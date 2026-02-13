import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWipTracking1736600000029 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add WIP quantity tracking columns to orders
    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD COLUMN "quantity_in_kitting" integer NOT NULL DEFAULT 0,
      ADD COLUMN "quantity_in_smt" integer NOT NULL DEFAULT 0,
      ADD COLUMN "quantity_in_th" integer NOT NULL DEFAULT 0,
      ADD COLUMN "quantity_completed" integer NOT NULL DEFAULT 0
    `);

    // Add stage timestamp columns
    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD COLUMN "kitting_started_at" timestamp NULL,
      ADD COLUMN "smt_started_at" timestamp NULL,
      ADD COLUMN "th_started_at" timestamp NULL,
      ADD COLUMN "production_completed_at" timestamp NULL
    `);

    // Create production_logs table for tracking stage transitions
    await queryRunner.query(`
      CREATE TABLE "production_logs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "order_id" uuid NOT NULL,
        "from_stage" varchar(50) NULL,
        "to_stage" varchar(50) NOT NULL,
        "quantity" integer NOT NULL,
        "notes" text NULL,
        "created_by" varchar(100) NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_production_logs" PRIMARY KEY ("id"),
        CONSTRAINT "FK_production_logs_order" FOREIGN KEY ("order_id")
          REFERENCES "orders"("id") ON DELETE CASCADE
      )
    `);

    // Create indexes for production_logs
    await queryRunner.query(`
      CREATE INDEX "IDX_production_logs_order_id" ON "production_logs" ("order_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_production_logs_created_at" ON "production_logs" ("created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop production_logs table
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_production_logs_created_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_production_logs_order_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "production_logs"`);

    // Remove stage timestamp columns from orders
    await queryRunner.query(`
      ALTER TABLE "orders"
      DROP COLUMN IF EXISTS "kitting_started_at",
      DROP COLUMN IF EXISTS "smt_started_at",
      DROP COLUMN IF EXISTS "th_started_at",
      DROP COLUMN IF EXISTS "production_completed_at"
    `);

    // Remove WIP quantity columns from orders
    await queryRunner.query(`
      ALTER TABLE "orders"
      DROP COLUMN IF EXISTS "quantity_in_kitting",
      DROP COLUMN IF EXISTS "quantity_in_smt",
      DROP COLUMN IF EXISTS "quantity_in_th",
      DROP COLUMN IF EXISTS "quantity_completed"
    `);
  }
}
