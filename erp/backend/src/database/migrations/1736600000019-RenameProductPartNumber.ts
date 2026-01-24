import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameProductPartNumber1736600000019 implements MigrationInterface {
  name = 'RenameProductPartNumber1736600000019';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Rename part_number to sku
    await queryRunner.query(`
      ALTER TABLE "products"
      RENAME COLUMN "part_number" TO "sku"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Rename sku back to part_number
    await queryRunner.query(`
      ALTER TABLE "products"
      RENAME COLUMN "sku" TO "part_number"
    `);
  }
}
