import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOrders1736600000004 implements MigrationInterface {
  name = 'CreateOrders1736600000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enum types
    await queryRunner.query(`
      CREATE TYPE "order_type_enum" AS ENUM ('TURNKEY', 'CONSIGNMENT')
    `);

    await queryRunner.query(`
      CREATE TYPE "order_status_enum" AS ENUM (
        'PENDING',
        'CONFIRMED',
        'IN_PRODUCTION',
        'SHIPPED',
        'COMPLETED',
        'CANCELLED'
      )
    `);

    // Create orders table
    await queryRunner.query(`
      CREATE TABLE "orders" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "order_number" character varying NOT NULL,
        "po_number" character varying,
        "wo_number" character varying,
        "customer_id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        "bom_revision_id" uuid NOT NULL,
        "quantity" integer NOT NULL,
        "quantity_shipped" integer NOT NULL DEFAULT 0,
        "due_date" date NOT NULL,
        "order_type" "order_type_enum" NOT NULL DEFAULT 'TURNKEY',
        "status" "order_status_enum" NOT NULL DEFAULT 'PENDING',
        "notes" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "PK_orders" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_orders_order_number" UNIQUE ("order_number"),
        CONSTRAINT "FK_orders_customer" FOREIGN KEY ("customer_id")
          REFERENCES "customers"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_orders_product" FOREIGN KEY ("product_id")
          REFERENCES "products"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_orders_bom_revision" FOREIGN KEY ("bom_revision_id")
          REFERENCES "bom_revisions"("id") ON DELETE RESTRICT
      )
    `);

    // Create indexes
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_orders_order_number" ON "orders" ("order_number")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_orders_customer_id" ON "orders" ("customer_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_orders_product_id" ON "orders" ("product_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_orders_bom_revision_id" ON "orders" ("bom_revision_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_orders_status" ON "orders" ("status")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_orders_due_date" ON "orders" ("due_date")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_orders_due_date"`);
    await queryRunner.query(`DROP INDEX "IDX_orders_status"`);
    await queryRunner.query(`DROP INDEX "IDX_orders_bom_revision_id"`);
    await queryRunner.query(`DROP INDEX "IDX_orders_product_id"`);
    await queryRunner.query(`DROP INDEX "IDX_orders_customer_id"`);
    await queryRunner.query(`DROP INDEX "IDX_orders_order_number"`);
    await queryRunner.query(`DROP TABLE "orders"`);
    await queryRunner.query(`DROP TYPE "order_status_enum"`);
    await queryRunner.query(`DROP TYPE "order_type_enum"`);
  }
}
