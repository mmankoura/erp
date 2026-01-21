import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInventoryAllocations1736600000009 implements MigrationInterface {
  name = 'CreateInventoryAllocations1736600000009';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enum type for allocation status
    await queryRunner.query(`
      CREATE TYPE "allocation_status_enum" AS ENUM (
        'ACTIVE',
        'CONSUMED',
        'CANCELLED'
      )
    `);

    // Create inventory_allocations table
    await queryRunner.query(`
      CREATE TABLE "inventory_allocations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "material_id" uuid NOT NULL,
        "order_id" uuid NOT NULL,
        "quantity" decimal(12,4) NOT NULL,
        "status" "allocation_status_enum" NOT NULL DEFAULT 'ACTIVE',
        "created_by" character varying,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "version" integer NOT NULL DEFAULT 1,
        CONSTRAINT "PK_inventory_allocations" PRIMARY KEY ("id"),
        CONSTRAINT "FK_inventory_allocations_material" FOREIGN KEY ("material_id")
          REFERENCES "materials"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_inventory_allocations_order" FOREIGN KEY ("order_id")
          REFERENCES "orders"("id") ON DELETE RESTRICT
      )
    `);

    // Create indexes for common queries
    await queryRunner.query(`
      CREATE INDEX "IDX_inventory_allocations_material_id"
      ON "inventory_allocations" ("material_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_inventory_allocations_order_id"
      ON "inventory_allocations" ("order_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_inventory_allocations_status"
      ON "inventory_allocations" ("status")
    `);

    // Partial unique index: only one ACTIVE allocation per material+order combination
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_inventory_allocations_material_order_active"
      ON "inventory_allocations" ("material_id", "order_id")
      WHERE "status" = 'ACTIVE'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(`DROP INDEX "IDX_inventory_allocations_material_order_active"`);
    await queryRunner.query(`DROP INDEX "IDX_inventory_allocations_status"`);
    await queryRunner.query(`DROP INDEX "IDX_inventory_allocations_order_id"`);
    await queryRunner.query(`DROP INDEX "IDX_inventory_allocations_material_id"`);

    // Drop table
    await queryRunner.query(`DROP TABLE "inventory_allocations"`);

    // Drop enum type
    await queryRunner.query(`DROP TYPE "allocation_status_enum"`);
  }
}
