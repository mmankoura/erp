import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateKittingTables1768200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create kitting_list_status enum
    await queryRunner.query(`
      CREATE TYPE "kitting_list_status_enum" AS ENUM (
        'DRAFT', 'PRINTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'
      )
    `);

    // Create kitting_lists table
    await queryRunner.query(`
      CREATE TABLE "kitting_lists" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "list_number" varchar(50) NOT NULL,
        "status" "kitting_list_status_enum" NOT NULL DEFAULT 'DRAFT',
        "created_by" varchar(100),
        "printed_at" TIMESTAMP,
        "completed_at" TIMESTAMP,
        "notes" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_kitting_lists" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_kitting_lists_list_number" UNIQUE ("list_number")
      )
    `);

    // Create kitting_list_orders junction table
    await queryRunner.query(`
      CREATE TABLE "kitting_list_orders" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "kitting_list_id" uuid NOT NULL,
        "order_id" uuid NOT NULL,
        "order_quantity" integer NOT NULL,
        CONSTRAINT "PK_kitting_list_orders" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_kitting_list_orders_list_order" UNIQUE ("kitting_list_id", "order_id"),
        CONSTRAINT "FK_kitting_list_orders_kitting_list" FOREIGN KEY ("kitting_list_id") REFERENCES "kitting_lists"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_kitting_list_orders_order" FOREIGN KEY ("order_id") REFERENCES "orders"("id")
      )
    `);

    // Create kitting_list_items table
    await queryRunner.query(`
      CREATE TABLE "kitting_list_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "kitting_list_id" uuid NOT NULL,
        "material_id" uuid NOT NULL,
        "resource_type" "resource_type_enum",
        "total_qty_required" decimal(12,4) NOT NULL,
        "qty_verified" decimal(12,4) NOT NULL DEFAULT 0,
        "is_short" boolean NOT NULL DEFAULT false,
        "shortage_qty" decimal(12,4) NOT NULL DEFAULT 0,
        "notes" text,
        CONSTRAINT "PK_kitting_list_items" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_kitting_list_items_list_material_resource" UNIQUE ("kitting_list_id", "material_id", "resource_type"),
        CONSTRAINT "FK_kitting_list_items_kitting_list" FOREIGN KEY ("kitting_list_id") REFERENCES "kitting_lists"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_kitting_list_items_material" FOREIGN KEY ("material_id") REFERENCES "materials"("id")
      )
    `);

    // Create kitting_list_scans table
    await queryRunner.query(`
      CREATE TABLE "kitting_list_scans" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "kitting_list_item_id" uuid NOT NULL,
        "uid_id" uuid NOT NULL,
        "uid_code" varchar(100) NOT NULL,
        "quantity" decimal(12,4) NOT NULL,
        "scanned_by" varchar(100),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_kitting_list_scans" PRIMARY KEY ("id"),
        CONSTRAINT "FK_kitting_list_scans_item" FOREIGN KEY ("kitting_list_item_id") REFERENCES "kitting_list_items"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_kitting_list_scans_uid" FOREIGN KEY ("uid_id") REFERENCES "inventory_lots"("id")
      )
    `);

    // Create indexes
    await queryRunner.query(`CREATE INDEX "IDX_kitting_list_orders_kitting_list_id" ON "kitting_list_orders" ("kitting_list_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_kitting_list_orders_order_id" ON "kitting_list_orders" ("order_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_kitting_list_items_kitting_list_id" ON "kitting_list_items" ("kitting_list_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_kitting_list_items_material_id" ON "kitting_list_items" ("material_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_kitting_list_scans_item_id" ON "kitting_list_scans" ("kitting_list_item_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_kitting_list_scans_uid_id" ON "kitting_list_scans" ("uid_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "kitting_list_scans"`);
    await queryRunner.query(`DROP TABLE "kitting_list_items"`);
    await queryRunner.query(`DROP TABLE "kitting_list_orders"`);
    await queryRunner.query(`DROP TABLE "kitting_lists"`);
    await queryRunner.query(`DROP TYPE "kitting_list_status_enum"`);
  }
}
