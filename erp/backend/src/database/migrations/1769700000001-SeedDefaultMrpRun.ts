import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Seed the default run and admit everything currently in flight.
 *
 * Admission is new, so on the day it ships nobody has admitted anything. If the
 * run started empty the MRP screen would go blank, which is not an improvement.
 * Backfilling every active order reproduces exactly the demand set MRP inferred
 * before, so the numbers do not move on deploy — after which the buyer curates
 * the list by hand.
 *
 * Kept in its own migration so a backfill failure cannot roll back the tables,
 * mirroring 1768500000000-CreateOrderMaterialSources.
 */
export class SeedDefaultMrpRun1769700000001 implements MigrationInterface {
  name = 'SeedDefaultMrpRun1769700000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "mrp_runs" ("name", "status", "notes", "created_by")
      SELECT 'Current', 'ACTIVE',
             'Created automatically when order admission was introduced. Seeded with every order that was in flight at the time.',
             'system'
      WHERE NOT EXISTS (SELECT 1 FROM "mrp_runs" WHERE "status" = 'ACTIVE')
    `);

    // Same statuses MRP used to infer demand from, so the seeded run reproduces
    // the previous behaviour exactly. Soft-deleted orders are excluded, matching
    // the TypeORM reads.
    await queryRunner.query(`
      INSERT INTO "mrp_demand_lines" (
        "run_id", "source", "order_id", "product_id", "label",
        "quantity", "due_date", "created_by"
      )
      SELECT r."id", 'ORDER', o."id", o."product_id",
             COALESCE(NULLIF(p."part_number", ''), o."order_number"),
             o."quantity", o."due_date", 'system'
      FROM "orders" o
      JOIN "products" p ON p."id" = o."product_id"
      CROSS JOIN (SELECT "id" FROM "mrp_runs" WHERE "status" = 'ACTIVE' LIMIT 1) r
      WHERE o."status" IN ('ENTERED', 'KITTING', 'SMT', 'TH')
        AND o."deleted_at" IS NULL
        AND o."quantity" > 0
      ON CONFLICT DO NOTHING
    `);

    // Preserve due-date ordering as the initial column order, so the matrix
    // opens in the sequence the buyer already thinks in.
    await queryRunner.query(`
      WITH ranked AS (
        SELECT "id", ROW_NUMBER() OVER (
          PARTITION BY "run_id" ORDER BY "due_date" NULLS LAST, "label"
        ) AS rn
        FROM "mrp_demand_lines"
      )
      UPDATE "mrp_demand_lines" d
      SET "sort_order" = ranked.rn
      FROM ranked WHERE ranked."id" = d."id"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "mrp_demand_lines" WHERE "created_by" = 'system'`,
    );
    await queryRunner.query(
      `DELETE FROM "mrp_runs" WHERE "name" = 'Current' AND "created_by" = 'system'`,
    );
  }
}
