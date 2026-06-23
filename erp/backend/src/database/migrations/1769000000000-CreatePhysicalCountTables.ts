import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePhysicalCountTables1769000000000 implements MigrationInterface {
  name = 'CreatePhysicalCountTables1769000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enums
    await queryRunner.query(`
      CREATE TYPE "physical_count_status_enum" AS ENUM (
        'PLANNED', 'IN_PROGRESS', 'PENDING_REVIEW', 'APPROVED', 'CANCELLED'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "physical_count_scan_resolution_enum" AS ENUM (
        'FIRST', 'SUMMED', 'REPLACED', 'REJECTED'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "physical_count_discrepancy_type_enum" AS ENUM (
        'SHORTAGE', 'OVERAGE', 'NOT_SCANNED', 'ORPHAN'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "physical_count_resolution_action_enum" AS ENUM (
        'ADJUST_TO_SCAN', 'ACCEPT_WITH_NOTE', 'RECOUNT', 'SCRAP_MISSING'
      )
    `);

    // physical_counts
    await queryRunner.query(`
      CREATE TABLE "physical_counts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "count_number" varchar(50) NOT NULL,
        "status" "physical_count_status_enum" NOT NULL DEFAULT 'PLANNED',
        "customer_id" uuid NOT NULL,
        "bin_filter" varchar(50),
        "category_filter" varchar(100),
        "parent_count_id" uuid,
        "created_by" varchar(100),
        "counted_by" varchar(100),
        "approved_by" varchar(100),
        "started_at" timestamp,
        "completed_at" timestamp,
        "approved_at" timestamp,
        "notes" text,
        "total_expected_lots" integer NOT NULL DEFAULT 0,
        "total_scans" integer NOT NULL DEFAULT 0,
        "shortage_count" integer NOT NULL DEFAULT 0,
        "overage_count" integer NOT NULL DEFAULT 0,
        "not_scanned_count" integer NOT NULL DEFAULT 0,
        "orphan_count" integer NOT NULL DEFAULT 0,
        "total_variance_value" decimal(14,4) NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_physical_counts" PRIMARY KEY ("id"),
        CONSTRAINT "FK_physical_counts_customer" FOREIGN KEY ("customer_id")
          REFERENCES "customers"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_physical_counts_parent" FOREIGN KEY ("parent_count_id")
          REFERENCES "physical_counts"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_physical_counts_count_number"
        ON "physical_counts"("count_number")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_physical_counts_customer_id"
        ON "physical_counts"("customer_id")
    `);
    // Partial unique: at most one active count per customer at a time
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_physical_counts_one_active_per_customer"
        ON "physical_counts"("customer_id")
        WHERE status IN ('IN_PROGRESS', 'PENDING_REVIEW')
    `);

    // physical_count_lots (snapshot)
    await queryRunner.query(`
      CREATE TABLE "physical_count_lots" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "physical_count_id" uuid NOT NULL,
        "lot_id" uuid NOT NULL,
        "material_id" uuid NOT NULL,
        "customer_id" uuid NOT NULL,
        "expected_qty" decimal(12,4) NOT NULL,
        "unit_cost" decimal(12,4),
        "bin_at_snapshot" varchar(50),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_physical_count_lots" PRIMARY KEY ("id"),
        CONSTRAINT "FK_physical_count_lots_count" FOREIGN KEY ("physical_count_id")
          REFERENCES "physical_counts"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_physical_count_lots_lot" FOREIGN KEY ("lot_id")
          REFERENCES "inventory_lots"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_physical_count_lots_material" FOREIGN KEY ("material_id")
          REFERENCES "materials"("id") ON DELETE RESTRICT,
        CONSTRAINT "UQ_physical_count_lots_count_lot" UNIQUE ("physical_count_id", "lot_id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_physical_count_lots_count_id"
        ON "physical_count_lots"("physical_count_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_physical_count_lots_material_id"
        ON "physical_count_lots"("material_id")
    `);

    // physical_count_scans (log)
    await queryRunner.query(`
      CREATE TABLE "physical_count_scans" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "physical_count_id" uuid NOT NULL,
        "uid" varchar(100) NOT NULL,
        "scanned_qty" decimal(12,4) NOT NULL,
        "scanned_by" varchar(100),
        "scanned_at" TIMESTAMP NOT NULL DEFAULT now(),
        "matched_lot_id" uuid,
        "resolution" "physical_count_scan_resolution_enum" NOT NULL DEFAULT 'FIRST',
        "superseded_by_scan_id" uuid,
        CONSTRAINT "PK_physical_count_scans" PRIMARY KEY ("id"),
        CONSTRAINT "FK_physical_count_scans_count" FOREIGN KEY ("physical_count_id")
          REFERENCES "physical_counts"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_physical_count_scans_lot" FOREIGN KEY ("matched_lot_id")
          REFERENCES "inventory_lots"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_physical_count_scans_count_id"
        ON "physical_count_scans"("physical_count_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_physical_count_scans_uid"
        ON "physical_count_scans"("uid")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_physical_count_scans_count_uid"
        ON "physical_count_scans"("physical_count_id", "uid")
    `);

    // physical_count_discrepancies (materialized at Complete)
    await queryRunner.query(`
      CREATE TABLE "physical_count_discrepancies" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "physical_count_id" uuid NOT NULL,
        "type" "physical_count_discrepancy_type_enum" NOT NULL,
        "lot_id" uuid,
        "material_id" uuid,
        "uid" varchar(100),
        "expected_qty" decimal(12,4),
        "scanned_qty" decimal(12,4),
        "variance" decimal(12,4) NOT NULL,
        "variance_value" decimal(14,4),
        "resolution_action" "physical_count_resolution_action_enum",
        "resolution_note" text,
        "resolved_by" varchar(100),
        "resolved_at" timestamp,
        "adjustment_transaction_id" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_physical_count_discrepancies" PRIMARY KEY ("id"),
        CONSTRAINT "FK_pc_disc_count" FOREIGN KEY ("physical_count_id")
          REFERENCES "physical_counts"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_pc_disc_lot" FOREIGN KEY ("lot_id")
          REFERENCES "inventory_lots"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_pc_disc_material" FOREIGN KEY ("material_id")
          REFERENCES "materials"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_pc_disc_adj_tx" FOREIGN KEY ("adjustment_transaction_id")
          REFERENCES "inventory_transactions"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_pc_disc_count_id"
        ON "physical_count_discrepancies"("physical_count_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_pc_disc_count_type"
        ON "physical_count_discrepancies"("physical_count_id", "type")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "physical_count_discrepancies"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "physical_count_scans"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "physical_count_lots"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_physical_counts_one_active_per_customer"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "physical_counts"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "physical_count_resolution_action_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "physical_count_discrepancy_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "physical_count_scan_resolution_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "physical_count_status_enum"`);
  }
}
