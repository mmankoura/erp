import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePurchaseOrders1736600000015 implements MigrationInterface {
  name = 'CreatePurchaseOrders1736600000015';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create purchase_order_status_enum
    await queryRunner.query(`
      CREATE TYPE "purchase_order_status_enum" AS ENUM (
        'DRAFT',
        'SUBMITTED',
        'CONFIRMED',
        'PARTIALLY_RECEIVED',
        'RECEIVED',
        'CLOSED',
        'CANCELLED'
      )
    `);

    // Create suppliers table
    await queryRunner.query(`
      CREATE TABLE "suppliers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "code" character varying(50) NOT NULL,
        "name" character varying(100) NOT NULL,
        "contact_name" character varying(100),
        "email" character varying(255),
        "phone" character varying(50),
        "address" text,
        "notes" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_suppliers" PRIMARY KEY ("id")
      )
    `);

    // Create unique index on supplier code (excluding soft-deleted)
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_suppliers_code_active"
      ON "suppliers" ("code")
      WHERE "deleted_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_suppliers_name" ON "suppliers" ("name")
    `);

    // Create purchase_orders table
    await queryRunner.query(`
      CREATE TABLE "purchase_orders" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "po_number" character varying(50) NOT NULL,
        "supplier_id" uuid NOT NULL,
        "status" "purchase_order_status_enum" NOT NULL DEFAULT 'DRAFT',
        "order_date" date NOT NULL,
        "expected_date" date,
        "total_amount" decimal(12,2),
        "currency" character varying(3) NOT NULL DEFAULT 'USD',
        "notes" text,
        "created_by" character varying(100),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_purchase_orders" PRIMARY KEY ("id"),
        CONSTRAINT "FK_purchase_orders_supplier" FOREIGN KEY ("supplier_id")
          REFERENCES "suppliers"("id") ON DELETE RESTRICT
      )
    `);

    // Create unique index on po_number (excluding soft-deleted)
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_purchase_orders_po_number_active"
      ON "purchase_orders" ("po_number")
      WHERE "deleted_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_purchase_orders_supplier_id"
      ON "purchase_orders" ("supplier_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_purchase_orders_status"
      ON "purchase_orders" ("status")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_purchase_orders_expected_date"
      ON "purchase_orders" ("expected_date")
    `);

    // Create purchase_order_lines table
    await queryRunner.query(`
      CREATE TABLE "purchase_order_lines" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "purchase_order_id" uuid NOT NULL,
        "material_id" uuid NOT NULL,
        "line_number" integer NOT NULL,
        "quantity_ordered" decimal(12,4) NOT NULL,
        "quantity_received" decimal(12,4) NOT NULL DEFAULT 0,
        "unit_cost" decimal(12,4),
        "notes" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_purchase_order_lines" PRIMARY KEY ("id"),
        CONSTRAINT "FK_purchase_order_lines_po" FOREIGN KEY ("purchase_order_id")
          REFERENCES "purchase_orders"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_purchase_order_lines_material" FOREIGN KEY ("material_id")
          REFERENCES "materials"("id") ON DELETE RESTRICT,
        CONSTRAINT "UQ_purchase_order_lines_po_line"
          UNIQUE ("purchase_order_id", "line_number")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_purchase_order_lines_po_id"
      ON "purchase_order_lines" ("purchase_order_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_purchase_order_lines_material_id"
      ON "purchase_order_lines" ("material_id")
    `);

    // Create covering index for efficient on-order calculation query
    await queryRunner.query(`
      CREATE INDEX "IDX_po_lines_material_on_order"
      ON "purchase_order_lines" ("material_id")
      INCLUDE ("quantity_ordered", "quantity_received", "purchase_order_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(`DROP INDEX "IDX_po_lines_material_on_order"`);
    await queryRunner.query(`DROP INDEX "IDX_purchase_order_lines_material_id"`);
    await queryRunner.query(`DROP INDEX "IDX_purchase_order_lines_po_id"`);
    await queryRunner.query(`DROP INDEX "IDX_purchase_orders_expected_date"`);
    await queryRunner.query(`DROP INDEX "IDX_purchase_orders_status"`);
    await queryRunner.query(`DROP INDEX "IDX_purchase_orders_supplier_id"`);
    await queryRunner.query(`DROP INDEX "IDX_purchase_orders_po_number_active"`);
    await queryRunner.query(`DROP INDEX "IDX_suppliers_name"`);
    await queryRunner.query(`DROP INDEX "IDX_suppliers_code_active"`);

    // Drop tables
    await queryRunner.query(`DROP TABLE "purchase_order_lines"`);
    await queryRunner.query(`DROP TABLE "purchase_orders"`);
    await queryRunner.query(`DROP TABLE "suppliers"`);

    // Drop enum
    await queryRunner.query(`DROP TYPE "purchase_order_status_enum"`);
  }
}
