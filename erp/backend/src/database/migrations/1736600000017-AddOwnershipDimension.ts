import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOwnershipDimension1736600000017 implements MigrationInterface {
  name = 'AddOwnershipDimension1736600000017';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create owner_type enum
    await queryRunner.query(`
      CREATE TYPE "owner_type_enum" AS ENUM ('COMPANY', 'CUSTOMER')
    `);

    // Add ownership columns to inventory_transactions
    await queryRunner.query(`
      ALTER TABLE "inventory_transactions"
      ADD COLUMN "owner_type" "owner_type_enum" NOT NULL DEFAULT 'COMPANY',
      ADD COLUMN "owner_id" uuid NULL
    `);

    // Add foreign key constraint for owner_id to customers table
    await queryRunner.query(`
      ALTER TABLE "inventory_transactions"
      ADD CONSTRAINT "FK_inventory_transactions_owner"
      FOREIGN KEY ("owner_id") REFERENCES "customers"("id")
      ON DELETE SET NULL
    `);

    // Add constraint: CUSTOMER type must have owner_id, COMPANY must have NULL
    await queryRunner.query(`
      ALTER TABLE "inventory_transactions"
      ADD CONSTRAINT "CHK_inventory_transactions_owner_consistency"
      CHECK (
        ("owner_type" = 'COMPANY' AND "owner_id" IS NULL) OR
        ("owner_type" = 'CUSTOMER' AND "owner_id" IS NOT NULL)
      )
    `);

    // Add index for owner-scoped queries
    await queryRunner.query(`
      CREATE INDEX "IDX_inventory_transactions_owner"
      ON "inventory_transactions" ("owner_type", "owner_id", "material_id")
    `);

    // Add ownership columns to inventory_allocations
    await queryRunner.query(`
      ALTER TABLE "inventory_allocations"
      ADD COLUMN "owner_type" "owner_type_enum" NOT NULL DEFAULT 'COMPANY',
      ADD COLUMN "owner_id" uuid NULL
    `);

    // Add foreign key constraint for owner_id to customers table
    await queryRunner.query(`
      ALTER TABLE "inventory_allocations"
      ADD CONSTRAINT "FK_inventory_allocations_owner"
      FOREIGN KEY ("owner_id") REFERENCES "customers"("id")
      ON DELETE SET NULL
    `);

    // Add constraint: CUSTOMER type must have owner_id, COMPANY must have NULL
    await queryRunner.query(`
      ALTER TABLE "inventory_allocations"
      ADD CONSTRAINT "CHK_inventory_allocations_owner_consistency"
      CHECK (
        ("owner_type" = 'COMPANY' AND "owner_id" IS NULL) OR
        ("owner_type" = 'CUSTOMER' AND "owner_id" IS NOT NULL)
      )
    `);

    // Add index for owner-scoped allocation queries
    await queryRunner.query(`
      CREATE INDEX "IDX_inventory_allocations_owner"
      ON "inventory_allocations" ("owner_type", "owner_id", "material_id")
    `);

    // Add comments for documentation
    await queryRunner.query(`
      COMMENT ON COLUMN "inventory_transactions"."owner_type" IS 'COMPANY = our stock (turnkey), CUSTOMER = consignment stock belonging to specific customer'
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN "inventory_transactions"."owner_id" IS 'customer_id when owner_type=CUSTOMER, NULL when owner_type=COMPANY'
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN "inventory_allocations"."owner_type" IS 'COMPANY = our stock (turnkey), CUSTOMER = consignment stock belonging to specific customer'
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN "inventory_allocations"."owner_id" IS 'customer_id when owner_type=CUSTOMER, NULL when owner_type=COMPANY'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_inventory_allocations_owner"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_inventory_transactions_owner"`);

    // Remove constraints from inventory_allocations
    await queryRunner.query(`
      ALTER TABLE "inventory_allocations"
      DROP CONSTRAINT IF EXISTS "CHK_inventory_allocations_owner_consistency"
    `);
    await queryRunner.query(`
      ALTER TABLE "inventory_allocations"
      DROP CONSTRAINT IF EXISTS "FK_inventory_allocations_owner"
    `);

    // Remove columns from inventory_allocations
    await queryRunner.query(`
      ALTER TABLE "inventory_allocations"
      DROP COLUMN IF EXISTS "owner_id",
      DROP COLUMN IF EXISTS "owner_type"
    `);

    // Remove constraints from inventory_transactions
    await queryRunner.query(`
      ALTER TABLE "inventory_transactions"
      DROP CONSTRAINT IF EXISTS "CHK_inventory_transactions_owner_consistency"
    `);
    await queryRunner.query(`
      ALTER TABLE "inventory_transactions"
      DROP CONSTRAINT IF EXISTS "FK_inventory_transactions_owner"
    `);

    // Remove columns from inventory_transactions
    await queryRunner.query(`
      ALTER TABLE "inventory_transactions"
      DROP COLUMN IF EXISTS "owner_id",
      DROP COLUMN IF EXISTS "owner_type"
    `);

    // Drop enum type
    await queryRunner.query(`DROP TYPE IF EXISTS "owner_type_enum"`);
  }
}
