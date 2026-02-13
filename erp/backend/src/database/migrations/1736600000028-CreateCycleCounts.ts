import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCycleCounts1736600000028 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create cycle count status enum
    await queryRunner.query(`
      CREATE TYPE "cycle_count_status_enum" AS ENUM (
        'PLANNED',
        'IN_PROGRESS',
        'PENDING_REVIEW',
        'APPROVED',
        'CANCELLED'
      )
    `);

    // Create cycle count type enum
    await queryRunner.query(`
      CREATE TYPE "cycle_count_type_enum" AS ENUM (
        'FULL',
        'PARTIAL',
        'ABC',
        'LOCATION'
      )
    `);

    // Create cycle count item status enum
    await queryRunner.query(`
      CREATE TYPE "cycle_count_item_status_enum" AS ENUM (
        'PENDING',
        'COUNTED',
        'RECOUNTED',
        'APPROVED',
        'ADJUSTED',
        'SKIPPED'
      )
    `);

    // Create cycle_counts table
    await queryRunner.query(`
      CREATE TABLE "cycle_counts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "count_number" varchar(50) NOT NULL,
        "status" "cycle_count_status_enum" NOT NULL DEFAULT 'PLANNED',
        "count_type" "cycle_count_type_enum" NOT NULL DEFAULT 'PARTIAL',
        "scheduled_date" date NOT NULL,
        "started_at" timestamp NULL,
        "completed_at" timestamp NULL,
        "approved_at" timestamp NULL,
        "created_by" varchar(100) NULL,
        "counted_by" varchar(100) NULL,
        "approved_by" varchar(100) NULL,
        "notes" text NULL,
        "total_items" int NOT NULL DEFAULT 0,
        "items_counted" int NOT NULL DEFAULT 0,
        "items_with_variance" int NOT NULL DEFAULT 0,
        "total_variance_value" decimal(12,4) NOT NULL DEFAULT 0,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cycle_counts" PRIMARY KEY ("id")
      )
    `);

    // Create unique index on count_number
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_cycle_counts_count_number" ON "cycle_counts" ("count_number")
    `);

    // Create index on status for filtering
    await queryRunner.query(`
      CREATE INDEX "IDX_cycle_counts_status" ON "cycle_counts" ("status")
    `);

    // Create index on scheduled_date for date-based queries
    await queryRunner.query(`
      CREATE INDEX "IDX_cycle_counts_scheduled_date" ON "cycle_counts" ("scheduled_date")
    `);

    // Create cycle_count_items table
    await queryRunner.query(`
      CREATE TABLE "cycle_count_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "cycle_count_id" uuid NOT NULL,
        "material_id" uuid NOT NULL,
        "lot_id" uuid NULL,
        "status" "cycle_count_item_status_enum" NOT NULL DEFAULT 'PENDING',
        "system_quantity" decimal(12,4) NOT NULL,
        "counted_quantity" decimal(12,4) NULL,
        "variance" decimal(12,4) NULL,
        "variance_percent" decimal(8,4) NULL,
        "variance_value" decimal(12,4) NULL,
        "unit_cost" decimal(12,4) NULL,
        "recount_number" int NOT NULL DEFAULT 0,
        "previous_counted_quantity" decimal(12,4) NULL,
        "counted_by" varchar(100) NULL,
        "counted_at" timestamp NULL,
        "approved_by" varchar(100) NULL,
        "approved_at" timestamp NULL,
        "adjustment_transaction_id" uuid NULL,
        "notes" text NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cycle_count_items" PRIMARY KEY ("id"),
        CONSTRAINT "FK_cycle_count_items_cycle_count" FOREIGN KEY ("cycle_count_id")
          REFERENCES "cycle_counts"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_cycle_count_items_material" FOREIGN KEY ("material_id")
          REFERENCES "materials"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_cycle_count_items_lot" FOREIGN KEY ("lot_id")
          REFERENCES "inventory_lots"("id") ON DELETE SET NULL
      )
    `);

    // Create indexes for cycle_count_items
    await queryRunner.query(`
      CREATE INDEX "IDX_cycle_count_items_cycle_count_id" ON "cycle_count_items" ("cycle_count_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_cycle_count_items_material_id" ON "cycle_count_items" ("material_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_cycle_count_items_lot_id" ON "cycle_count_items" ("lot_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_cycle_count_items_status" ON "cycle_count_items" ("status")
    `);

    // Create unique constraint to prevent duplicate material entries in same count
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_cycle_count_items_unique_material"
      ON "cycle_count_items" ("cycle_count_id", "material_id")
      WHERE "lot_id" IS NULL
    `);

    // Create unique constraint for lot-level counting
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_cycle_count_items_unique_lot"
      ON "cycle_count_items" ("cycle_count_id", "lot_id")
      WHERE "lot_id" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cycle_count_items_unique_lot"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cycle_count_items_unique_material"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cycle_count_items_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cycle_count_items_lot_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cycle_count_items_material_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cycle_count_items_cycle_count_id"`);

    // Drop cycle_count_items table
    await queryRunner.query(`DROP TABLE IF EXISTS "cycle_count_items"`);

    // Drop cycle_counts indexes and table
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cycle_counts_scheduled_date"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cycle_counts_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cycle_counts_count_number"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cycle_counts"`);

    // Drop enums
    await queryRunner.query(`DROP TYPE IF EXISTS "cycle_count_item_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "cycle_count_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "cycle_count_status_enum"`);
  }
}
