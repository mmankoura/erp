import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInventoryDimensions1736600000010 implements MigrationInterface {
  name = 'AddInventoryDimensions1736600000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create inventory_bucket enum type
    await queryRunner.query(`
      CREATE TYPE "inventory_bucket_enum" AS ENUM ('RAW', 'WIP', 'FG', 'IN_TRANSIT')
    `);

    // Add new allocation status values for future phases
    await queryRunner.query(`
      ALTER TYPE "allocation_status_enum" ADD VALUE IF NOT EXISTS 'PICKED'
    `);
    await queryRunner.query(`
      ALTER TYPE "allocation_status_enum" ADD VALUE IF NOT EXISTS 'ISSUED'
    `);

    // Add expanded transaction types for future use
    await queryRunner.query(`
      ALTER TYPE "transaction_type_enum" ADD VALUE IF NOT EXISTS 'MOVE'
    `);
    await queryRunner.query(`
      ALTER TYPE "transaction_type_enum" ADD VALUE IF NOT EXISTS 'ISSUE_TO_WO'
    `);
    await queryRunner.query(`
      ALTER TYPE "transaction_type_enum" ADD VALUE IF NOT EXISTS 'RETURN_FROM_WO'
    `);
    await queryRunner.query(`
      ALTER TYPE "transaction_type_enum" ADD VALUE IF NOT EXISTS 'SHIPMENT'
    `);

    // Add dimension columns to inventory_transactions (all nullable for backward compatibility)
    await queryRunner.query(`
      ALTER TABLE "inventory_transactions"
      ADD COLUMN "location_id" uuid NULL,
      ADD COLUMN "lot_id" uuid NULL,
      ADD COLUMN "bucket" "inventory_bucket_enum" DEFAULT 'RAW'
    `);

    // Add indexes for dimension queries
    await queryRunner.query(`
      CREATE INDEX "IDX_inventory_transactions_location" ON "inventory_transactions" ("location_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_inventory_transactions_lot" ON "inventory_transactions" ("lot_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_inventory_transactions_bucket" ON "inventory_transactions" ("bucket")
    `);

    // Composite index for common dimension queries
    await queryRunner.query(`
      CREATE INDEX "IDX_inventory_transactions_material_location_lot_bucket"
      ON "inventory_transactions" ("material_id", "location_id", "lot_id", "bucket")
    `);

    // Add dimension columns to inventory_allocations for future lot/location-specific reservations
    await queryRunner.query(`
      ALTER TABLE "inventory_allocations"
      ADD COLUMN "location_id" uuid NULL,
      ADD COLUMN "lot_id" uuid NULL
    `);

    // Add comments explaining the phase 1 approach
    await queryRunner.query(`
      COMMENT ON COLUMN "inventory_transactions"."location_id" IS 'Phase 2: FK to locations table when implemented'
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN "inventory_transactions"."lot_id" IS 'Phase 2: FK to material_lots table when implemented'
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN "inventory_transactions"."bucket" IS 'Inventory bucket: RAW (stock), WIP (in production), FG (finished goods), IN_TRANSIT'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_inventory_transactions_material_location_lot_bucket"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_inventory_transactions_bucket"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_inventory_transactions_lot"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_inventory_transactions_location"`);

    // Remove columns from inventory_allocations
    await queryRunner.query(`
      ALTER TABLE "inventory_allocations"
      DROP COLUMN IF EXISTS "lot_id",
      DROP COLUMN IF EXISTS "location_id"
    `);

    // Remove columns from inventory_transactions
    await queryRunner.query(`
      ALTER TABLE "inventory_transactions"
      DROP COLUMN IF EXISTS "bucket",
      DROP COLUMN IF EXISTS "lot_id",
      DROP COLUMN IF EXISTS "location_id"
    `);

    // Note: Cannot remove enum values in PostgreSQL, but can drop the type if not used
    await queryRunner.query(`DROP TYPE IF EXISTS "inventory_bucket_enum"`);
  }
}
