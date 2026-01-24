import { MigrationInterface, QueryRunner } from 'typeorm';

export class RevertSkuToPartNumber1736600000020 implements MigrationInterface {
  name = 'RevertSkuToPartNumber1736600000020';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Rename sku back to part_number
    await queryRunner.query(`
      ALTER TABLE "products"
      RENAME COLUMN "sku" TO "part_number"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Rename part_number to sku
    await queryRunner.query(`
      ALTER TABLE "products"
      RENAME COLUMN "part_number" TO "sku"
    `);
  }
}
