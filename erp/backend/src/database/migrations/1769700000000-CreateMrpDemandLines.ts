import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The MRP run and its admitted demand.
 *
 * Until now MRP inferred its demand from order status: anything ENTERED,
 * KITTING, SMT or TH was in, automatically. The buyer had no say. Their own
 * spreadsheet works the other way round — every assembly has a column, but a job
 * only counts once they type a quantity into it, and only 44 of 74 columns
 * carried one. Admission is a deliberate act.
 *
 * `mrp_demand_lines` is that act, and it covers two things at once:
 *   - an admitted real order (source = ORDER), and
 *   - a scratch what-if job (source = SCRATCH) that never becomes an order.
 *
 * `mrp_runs` is a thin container. There is deliberately no run-management UI:
 * one row is ACTIVE and everything reads it. It exists so that a what-if
 * sandbox is a DRAFT run rather than a special case.
 */
export class CreateMrpDemandLines1769700000000 implements MigrationInterface {
  name = 'CreateMrpDemandLines1769700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "mrp_run_status_enum" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED')
    `);
    await queryRunner.query(`
      CREATE TYPE "mrp_demand_source_enum" AS ENUM ('ORDER', 'SCRATCH')
    `);

    await queryRunner.query(`
      CREATE TABLE "mrp_runs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" varchar(200) NOT NULL,
        "status" "mrp_run_status_enum" NOT NULL DEFAULT 'DRAFT',
        "notes" text,
        "created_by" varchar(100),
        "created_at" timestamptz NOT NULL DEFAULT NOW(),
        "updated_at" timestamptz NOT NULL DEFAULT NOW(),
        "archived_at" timestamptz,
        CONSTRAINT "PK_mrp_runs" PRIMARY KEY ("id")
      )
    `);

    // At most one ACTIVE run, so every read has an unambiguous default.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_mrp_runs_single_active"
        ON "mrp_runs" ("status") WHERE "status" = 'ACTIVE'
    `);

    await queryRunner.query(`
      CREATE TABLE "mrp_demand_lines" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "run_id" uuid NOT NULL,
        "source" "mrp_demand_source_enum" NOT NULL,
        "order_id" uuid,
        "product_id" uuid,
        "bom_revision_id" uuid,
        "label" varchar(120) NOT NULL,
        "quantity" integer NOT NULL,
        "due_date" date,
        "priority" smallint,
        "status_note" varchar(60),
        "include_in_totals" boolean NOT NULL DEFAULT true,
        "sort_order" integer NOT NULL DEFAULT 0,
        "notes" text,
        "created_by" varchar(100) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT NOW(),
        "updated_at" timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_mrp_demand_lines" PRIMARY KEY ("id"),
        CONSTRAINT "FK_mrp_demand_lines_run" FOREIGN KEY ("run_id")
          REFERENCES "mrp_runs"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_mrp_demand_lines_order" FOREIGN KEY ("order_id")
          REFERENCES "orders"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_mrp_demand_lines_product" FOREIGN KEY ("product_id")
          REFERENCES "products"("id"),
        CONSTRAINT "FK_mrp_demand_lines_bom_revision" FOREIGN KEY ("bom_revision_id")
          REFERENCES "bom_revisions"("id"),
        CONSTRAINT "CHK_mrp_demand_lines_quantity" CHECK ("quantity" > 0),
        -- An ORDER line follows its order (and its order's BOM revision, which is
        -- why bom_revision_id is null there: re-BOM the order and MRP stays
        -- correct). A SCRATCH line has no order, so it must pin both itself.
        CONSTRAINT "CHK_mrp_demand_lines_source" CHECK (
          ("source" = 'ORDER' AND "order_id" IS NOT NULL)
          OR ("source" = 'SCRATCH' AND "product_id" IS NOT NULL AND "bom_revision_id" IS NOT NULL)
        )
      )
    `);

    // An order can be admitted to a run once.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_mrp_demand_lines_run_order"
        ON "mrp_demand_lines" ("run_id", "order_id") WHERE "order_id" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_mrp_demand_lines_run_sort"
        ON "mrp_demand_lines" ("run_id", "sort_order")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_mrp_demand_lines_included"
        ON "mrp_demand_lines" ("run_id", "include_in_totals")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "mrp_demand_lines"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "mrp_runs"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "mrp_demand_source_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "mrp_run_status_enum"`);
  }
}
