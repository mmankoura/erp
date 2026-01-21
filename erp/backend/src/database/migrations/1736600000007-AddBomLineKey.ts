import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBomLineKey1736600000007 implements MigrationInterface {
  name = 'AddBomLineKey1736600000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add bom_line_key column to bom_items
    await queryRunner.query(`
      ALTER TABLE "bom_items"
      ADD COLUMN "bom_line_key" character varying
    `);

    // Populate bom_line_key for existing records
    // Default strategy: use material_id as the key
    // This provides stable identity for diffing across revisions
    await queryRunner.query(`
      UPDATE "bom_items"
      SET "bom_line_key" = "material_id"::text
      WHERE "bom_line_key" IS NULL
    `);

    // Create index on bom_line_key for efficient diff queries
    await queryRunner.query(`
      CREATE INDEX "IDX_bom_items_line_key" ON "bom_items" ("bom_line_key")
    `);

    // Create composite index for revision + line_key lookups (used in diff)
    await queryRunner.query(`
      CREATE INDEX "IDX_bom_items_revision_line_key"
      ON "bom_items" ("bom_revision_id", "bom_line_key")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_bom_items_revision_line_key"`);
    await queryRunner.query(`DROP INDEX "IDX_bom_items_line_key"`);
    await queryRunner.query(`ALTER TABLE "bom_items" DROP COLUMN "bom_line_key"`);
  }
}
