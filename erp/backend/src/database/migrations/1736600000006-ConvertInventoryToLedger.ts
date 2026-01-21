import { MigrationInterface, QueryRunner } from 'typeorm';

export class ConvertInventoryToLedger1736600000006 implements MigrationInterface {
  name = 'ConvertInventoryToLedger1736600000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop old inventory table (it was just created, should be empty)
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_inventory_material_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "inventory"`);

    // Create enum types for transactions
    await queryRunner.query(`
      CREATE TYPE "transaction_type_enum" AS ENUM (
        'ADJUSTMENT',
        'RECEIPT',
        'CONSUMPTION',
        'RETURN',
        'SCRAP'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "reference_type_enum" AS ENUM (
        'MANUAL',
        'WORK_ORDER',
        'PO_RECEIPT',
        'CYCLE_COUNT',
        'INITIAL_STOCK'
      )
    `);

    // Create inventory_transactions table (ledger model)
    await queryRunner.query(`
      CREATE TABLE "inventory_transactions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "material_id" uuid NOT NULL,
        "transaction_type" "transaction_type_enum" NOT NULL,
        "quantity" decimal(12,4) NOT NULL,
        "reference_type" "reference_type_enum" NOT NULL DEFAULT 'MANUAL',
        "reference_id" uuid,
        "reason" text,
        "created_by" character varying,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_inventory_transactions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_inventory_transactions_material" FOREIGN KEY ("material_id")
          REFERENCES "materials"("id") ON DELETE RESTRICT
      )
    `);

    // Create indexes for common queries
    await queryRunner.query(`
      CREATE INDEX "IDX_inventory_transactions_material_id"
      ON "inventory_transactions" ("material_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_inventory_transactions_created_at"
      ON "inventory_transactions" ("created_at")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_inventory_transactions_type"
      ON "inventory_transactions" ("transaction_type")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(`DROP INDEX "IDX_inventory_transactions_type"`);
    await queryRunner.query(`DROP INDEX "IDX_inventory_transactions_created_at"`);
    await queryRunner.query(`DROP INDEX "IDX_inventory_transactions_material_id"`);

    // Drop inventory_transactions table
    await queryRunner.query(`DROP TABLE "inventory_transactions"`);

    // Drop enum types
    await queryRunner.query(`DROP TYPE "reference_type_enum"`);
    await queryRunner.query(`DROP TYPE "transaction_type_enum"`);

    // Recreate old inventory table for rollback
    await queryRunner.query(`
      CREATE TABLE "inventory" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "material_id" uuid NOT NULL,
        "quantity_on_hand" decimal(12,2) NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_inventory" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_inventory_material_id" UNIQUE ("material_id"),
        CONSTRAINT "FK_inventory_material" FOREIGN KEY ("material_id")
          REFERENCES "materials"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_inventory_material_id" ON "inventory" ("material_id")
    `);
  }
}
