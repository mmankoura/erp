import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSupplierAndPOFields1768800000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Supplier profile fields
    await queryRunner.query(`
      ALTER TABLE "suppliers"
      ADD COLUMN IF NOT EXISTS "attention" text,
      ADD COLUMN IF NOT EXISTS "default_terms" text,
      ADD COLUMN IF NOT EXISTS "default_fob" text,
      ADD COLUMN IF NOT EXISTS "default_ship_to" text,
      ADD COLUMN IF NOT EXISTS "currency" varchar(3) DEFAULT 'USD'
    `);

    // PO fields for PDF generation
    await queryRunner.query(`
      ALTER TABLE "purchase_orders"
      ADD COLUMN IF NOT EXISTS "terms" text,
      ADD COLUMN IF NOT EXISTS "revision" integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "fob" text,
      ADD COLUMN IF NOT EXISTS "ship_to" text,
      ADD COLUMN IF NOT EXISTS "requested_by" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "purchase_orders"
      DROP COLUMN IF EXISTS "terms",
      DROP COLUMN IF EXISTS "revision",
      DROP COLUMN IF EXISTS "fob",
      DROP COLUMN IF EXISTS "ship_to",
      DROP COLUMN IF EXISTS "requested_by"
    `);

    await queryRunner.query(`
      ALTER TABLE "suppliers"
      DROP COLUMN IF EXISTS "attention",
      DROP COLUMN IF EXISTS "default_terms",
      DROP COLUMN IF EXISTS "default_fob",
      DROP COLUMN IF EXISTS "default_ship_to",
      DROP COLUMN IF EXISTS "currency"
    `);
  }
}
