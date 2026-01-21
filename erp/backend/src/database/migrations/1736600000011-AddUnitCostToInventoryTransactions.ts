import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUnitCostToInventoryTransactions1736600000011 implements MigrationInterface {
  name = 'AddUnitCostToInventoryTransactions1736600000011';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add unit_cost column to inventory_transactions for future costing support
    // This captures the cost per unit at the time of transaction
    // Critical for FIFO costing, margin calculations, and financial reporting
    await queryRunner.query(`
      ALTER TABLE "inventory_transactions"
      ADD COLUMN "unit_cost" DECIMAL(12, 4) NULL
    `);

    // Add comment explaining the column's purpose
    await queryRunner.query(`
      COMMENT ON COLUMN "inventory_transactions"."unit_cost" IS 'Cost per unit at time of transaction. Used for FIFO costing, margin analysis. Capture on RECEIPT transactions.'
    `);

    // Create index for cost-related queries (e.g., finding transactions with cost data)
    await queryRunner.query(`
      CREATE INDEX "IDX_inventory_transactions_unit_cost" ON "inventory_transactions" ("unit_cost")
      WHERE "unit_cost" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_inventory_transactions_unit_cost"`);
    await queryRunner.query(`
      ALTER TABLE "inventory_transactions"
      DROP COLUMN IF EXISTS "unit_cost"
    `);
  }
}
