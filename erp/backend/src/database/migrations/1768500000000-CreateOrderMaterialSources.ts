import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOrderMaterialSources1768500000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enum
    await queryRunner.query(
      `DO $$ BEGIN CREATE TYPE "supply_source_enum" AS ENUM ('COMPANY', 'CUSTOMER'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    );

    // Create table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "order_material_sources" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "order_id" uuid NOT NULL,
        "material_id" uuid NOT NULL,
        "supply_source" "supply_source_enum" NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_order_material_sources" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_order_material_source" UNIQUE ("order_id", "material_id"),
        CONSTRAINT "FK_oms_order" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_oms_material" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE CASCADE
      )
    `);

    // Indexes
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_oms_order_id" ON "order_material_sources" ("order_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_oms_order_supply" ON "order_material_sources" ("order_id", "supply_source")`,
    );

    // Backfill existing orders: seed supply sources from BOM items
    // All materials default to COMPANY — customer-supplied items are explicitly marked per order
    await queryRunner.query(`
      INSERT INTO "order_material_sources" ("order_id", "material_id", "supply_source")
      SELECT DISTINCT
        o."id" AS order_id,
        bi."material_id",
        'COMPANY'::"supply_source_enum" AS supply_source
      FROM "orders" o
      JOIN "bom_items" bi ON bi."bom_revision_id" = o."bom_revision_id"
      WHERE o."deleted_at" IS NULL
        AND bi."material_id" IS NOT NULL
      ON CONFLICT ("order_id", "material_id") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "order_material_sources"`);
    await queryRunner.query(`DROP TYPE "supply_source_enum"`);
  }
}
