import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBinToInventoryLots1768900000000 implements MigrationInterface {
  name = 'AddBinToInventoryLots1768900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "inventory_lots"
      ADD COLUMN "bin" varchar(50)
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_inventory_lots_bin" ON "inventory_lots"("bin")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_inventory_lots_bin"`);
    await queryRunner.query(`ALTER TABLE "inventory_lots" DROP COLUMN "bin"`);
  }
}
