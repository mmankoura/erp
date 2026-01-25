import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInventoryLots1736600000024 implements MigrationInterface {
  name = 'CreateInventoryLots1736600000024';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create package_type enum
    await queryRunner.query(`
      CREATE TYPE "package_type_enum" AS ENUM ('TR', 'REEL', 'TUBE', 'TRAY', 'BAG', 'BOX', 'BULK', 'OTHER')
    `);

    // Create lot_status enum
    await queryRunner.query(`
      CREATE TYPE "lot_status_enum" AS ENUM ('ACTIVE', 'CONSUMED', 'EXPIRED', 'ON_HOLD')
    `);

    // Create inventory_lots table
    await queryRunner.query(`
      CREATE TABLE "inventory_lots" (
        "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
        "uid" varchar(100) NOT NULL,
        "material_id" uuid NOT NULL,
        "quantity" decimal(12,4) NOT NULL DEFAULT 0,
        "initial_quantity" decimal(12,4) NOT NULL,
        "package_type" "package_type_enum" DEFAULT 'TR',
        "po_reference" varchar(100) NULL,
        "supplier_id" uuid NULL,
        "unit_cost" decimal(12,4) NULL,
        "received_date" timestamp NULL,
        "expiration_date" date NULL,
        "status" "lot_status_enum" DEFAULT 'ACTIVE',
        "notes" text NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "PK_inventory_lots" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_inventory_lots_uid" UNIQUE ("uid"),
        CONSTRAINT "FK_inventory_lots_material" FOREIGN KEY ("material_id")
          REFERENCES "materials"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_inventory_lots_supplier" FOREIGN KEY ("supplier_id")
          REFERENCES "suppliers"("id") ON DELETE SET NULL
      )
    `);

    // Create indexes
    await queryRunner.query(`
      CREATE INDEX "IDX_inventory_lots_material" ON "inventory_lots" ("material_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_inventory_lots_status" ON "inventory_lots" ("status")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_inventory_lots_po_reference" ON "inventory_lots" ("po_reference")
    `);

    // Add FK constraint for lot_id in inventory_transactions
    await queryRunner.query(`
      ALTER TABLE "inventory_transactions"
      ADD CONSTRAINT "FK_inventory_transactions_lot"
        FOREIGN KEY ("lot_id") REFERENCES "inventory_lots"("id") ON DELETE SET NULL
    `);

    // Add FK for lot_id in inventory_allocations
    await queryRunner.query(`
      ALTER TABLE "inventory_allocations"
      ADD CONSTRAINT "FK_inventory_allocations_lot"
        FOREIGN KEY ("lot_id") REFERENCES "inventory_lots"("id") ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "inventory_allocations" DROP CONSTRAINT IF EXISTS "FK_inventory_allocations_lot"`);
    await queryRunner.query(`ALTER TABLE "inventory_transactions" DROP CONSTRAINT IF EXISTS "FK_inventory_transactions_lot"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_inventory_lots_po_reference"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_inventory_lots_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_inventory_lots_material"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "inventory_lots"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "lot_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "package_type_enum"`);
  }
}
