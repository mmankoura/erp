import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBomImportMappings1736600000022
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "bom_import_mappings" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying(255) NOT NULL,
        "description" text NULL,
        "column_mappings" jsonb NOT NULL,
        "has_header_row" boolean NOT NULL DEFAULT true,
        "skip_rows" integer NOT NULL DEFAULT 0,
        "multi_row_designators" boolean NOT NULL DEFAULT false,
        "ignore_columns" jsonb NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_bom_import_mappings" PRIMARY KEY ("id")
      )
    `);

    // Create unique index on name
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_bom_import_mappings_name" ON "bom_import_mappings" ("name")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "UQ_bom_import_mappings_name"`);
    await queryRunner.query(`DROP TABLE "bom_import_mappings"`);
  }
}
