import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFutureProofingColumns1736600000013 implements MigrationInterface {
  name = 'AddFutureProofingColumns1736600000013';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ============ MATERIALS: Costing Support ============

    // Create costing_method enum
    await queryRunner.query(`
      CREATE TYPE "costing_method_enum" AS ENUM ('FIFO', 'WEIGHTED_AVG', 'STANDARD', 'SPECIFIC')
    `);

    // Add costing columns to materials
    await queryRunner.query(`
      ALTER TABLE "materials"
      ADD COLUMN "costing_method" "costing_method_enum" DEFAULT 'WEIGHTED_AVG',
      ADD COLUMN "standard_cost" DECIMAL(12, 4) NULL
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN "materials"."costing_method" IS 'Costing method for this material: FIFO, WEIGHTED_AVG, STANDARD, or SPECIFIC (lot-level)'
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN "materials"."standard_cost" IS 'Standard cost per unit (used when costing_method = STANDARD)'
    `);

    // ============ ORDERS: Pricing Support ============

    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD COLUMN "quoted_price" DECIMAL(12, 2) NULL,
      ADD COLUMN "currency" VARCHAR(3) DEFAULT 'USD'
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN "orders"."quoted_price" IS 'Total quoted price for the order (for margin calculation)'
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN "orders"."currency" IS 'Currency code (ISO 4217) for the quoted price'
    `);

    // ============ INVENTORY ALLOCATIONS: Reason Tracking ============

    await queryRunner.query(`
      ALTER TABLE "inventory_allocations"
      ADD COLUMN "reason" TEXT NULL
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN "inventory_allocations"."reason" IS 'Reason for allocation change (for audit trail and regulatory compliance)'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove allocation reason
    await queryRunner.query(`
      ALTER TABLE "inventory_allocations"
      DROP COLUMN IF EXISTS "reason"
    `);

    // Remove order pricing columns
    await queryRunner.query(`
      ALTER TABLE "orders"
      DROP COLUMN IF EXISTS "currency",
      DROP COLUMN IF EXISTS "quoted_price"
    `);

    // Remove material costing columns
    await queryRunner.query(`
      ALTER TABLE "materials"
      DROP COLUMN IF EXISTS "standard_cost",
      DROP COLUMN IF EXISTS "costing_method"
    `);

    // Drop costing method enum
    await queryRunner.query(`DROP TYPE IF EXISTS "costing_method_enum"`);
  }
}
