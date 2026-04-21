import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBomItemAlternates1768600000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "bom_item_alternates" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "bom_item_id" uuid NOT NULL,
        "material_id" uuid NOT NULL,
        "priority" integer NOT NULL DEFAULT 1,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_bom_item_alternates" PRIMARY KEY ("id"),
        CONSTRAINT "FK_bia_bom_item" FOREIGN KEY ("bom_item_id") REFERENCES "bom_items"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_bia_material" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE CASCADE
      )
    `);

    // Indexes
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_bia_bom_item" ON "bom_item_alternates" ("bom_item_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_bia_material" ON "bom_item_alternates" ("material_id")`,
    );

    // Backfill from existing alternate_ipn field
    // Resolve alternate_ipn text to material_id
    await queryRunner.query(`
      INSERT INTO "bom_item_alternates" ("bom_item_id", "material_id", "priority")
      SELECT
        bi."id" AS bom_item_id,
        m."id" AS material_id,
        1 AS priority
      FROM "bom_items" bi
      JOIN "materials" m ON m."internal_part_number" = bi."alternate_ipn" AND m."deleted_at" IS NULL
      WHERE bi."alternate_ipn" IS NOT NULL
        AND bi."alternate_ipn" != ''
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "bom_item_alternates"`);
  }
}
