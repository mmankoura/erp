import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameMaterialColumns1736600000018 implements MigrationInterface {
  name = 'RenameMaterialColumns1736600000018';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Rename manufacturer_part_number to manufacturer_pn
    await queryRunner.query(`
      ALTER TABLE "materials"
      RENAME COLUMN "manufacturer_part_number" TO "manufacturer_pn"
    `);

    // Rename unit to uom
    await queryRunner.query(`
      ALTER TABLE "materials"
      RENAME COLUMN "unit" TO "uom"
    `);

    // Add category column
    await queryRunner.query(`
      ALTER TABLE "materials"
      ADD COLUMN "category" character varying NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove category column
    await queryRunner.query(`
      ALTER TABLE "materials"
      DROP COLUMN "category"
    `);

    // Rename uom back to unit
    await queryRunner.query(`
      ALTER TABLE "materials"
      RENAME COLUMN "uom" TO "unit"
    `);

    // Rename manufacturer_pn back to manufacturer_part_number
    await queryRunner.query(`
      ALTER TABLE "materials"
      RENAME COLUMN "manufacturer_pn" TO "manufacturer_part_number"
    `);
  }
}
