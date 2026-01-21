import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBomTables1736600000003 implements MigrationInterface {
  name = 'CreateBomTables1736600000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enum types
    await queryRunner.query(`
      CREATE TYPE "bom_source_enum" AS ENUM ('MANUAL', 'IMPORT_CLIENT', 'IMPORT_INTERNAL')
    `);

    await queryRunner.query(`
      CREATE TYPE "resource_type_enum" AS ENUM ('SMT', 'TH', 'MECH', 'PCB', 'DNP')
    `);

    // Create bom_revisions table
    await queryRunner.query(`
      CREATE TABLE "bom_revisions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "product_id" uuid NOT NULL,
        "revision_number" character varying NOT NULL,
        "revision_date" date NOT NULL,
        "change_summary" text,
        "source" "bom_source_enum" NOT NULL DEFAULT 'MANUAL',
        "source_filename" character varying,
        "is_active" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_bom_revisions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_bom_revisions_product_revision" UNIQUE ("product_id", "revision_number"),
        CONSTRAINT "FK_bom_revisions_product" FOREIGN KEY ("product_id")
          REFERENCES "products"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_bom_revisions_product_id" ON "bom_revisions" ("product_id")
    `);

    // Create bom_items table
    await queryRunner.query(`
      CREATE TABLE "bom_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "bom_revision_id" uuid NOT NULL,
        "material_id" uuid NOT NULL,
        "line_number" integer,
        "reference_designators" text,
        "quantity_required" decimal(10,4) NOT NULL,
        "resource_type" "resource_type_enum",
        "polarized" boolean NOT NULL DEFAULT false,
        "scrap_factor" decimal(5,2) NOT NULL DEFAULT 0,
        "notes" text,
        CONSTRAINT "PK_bom_items" PRIMARY KEY ("id"),
        CONSTRAINT "FK_bom_items_revision" FOREIGN KEY ("bom_revision_id")
          REFERENCES "bom_revisions"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_bom_items_material" FOREIGN KEY ("material_id")
          REFERENCES "materials"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_bom_items_revision_id" ON "bom_items" ("bom_revision_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_bom_items_material_id" ON "bom_items" ("material_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_bom_items_material_id"`);
    await queryRunner.query(`DROP INDEX "IDX_bom_items_revision_id"`);
    await queryRunner.query(`DROP TABLE "bom_items"`);
    await queryRunner.query(`DROP INDEX "IDX_bom_revisions_product_id"`);
    await queryRunner.query(`DROP TABLE "bom_revisions"`);
    await queryRunner.query(`DROP TYPE "resource_type_enum"`);
    await queryRunner.query(`DROP TYPE "bom_source_enum"`);
  }
}
