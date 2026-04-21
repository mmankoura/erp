import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateConsumableOrders1768700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DO $$ BEGIN CREATE TYPE "consumable_order_status_enum" AS ENUM ('ORDERED', 'RECEIVED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "consumable_orders" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "order_number" varchar(50) NOT NULL,
        "supplier" varchar(200) NOT NULL,
        "status" "consumable_order_status_enum" NOT NULL DEFAULT 'ORDERED',
        "order_date" date NOT NULL,
        "expected_date" date,
        "currency" varchar(3) NOT NULL DEFAULT 'CAD',
        "notes" text,
        "created_by" varchar(100),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_consumable_orders" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_consumable_order_number" UNIQUE ("order_number")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "consumable_order_lines" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "consumable_order_id" uuid NOT NULL,
        "ata_part_number" varchar(100),
        "description" varchar(200) NOT NULL,
        "manufacturer" varchar(200),
        "manufacturer_pn" varchar(100),
        "quantity" decimal(12,4) NOT NULL DEFAULT 1,
        "unit_cost" decimal(12,4),
        "customer" varchar(200),
        "line_number" integer,
        "notes" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_consumable_order_lines" PRIMARY KEY ("id"),
        CONSTRAINT "FK_col_order" FOREIGN KEY ("consumable_order_id") REFERENCES "consumable_orders"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_col_order" ON "consumable_order_lines" ("consumable_order_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "consumable_order_lines"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "consumable_orders"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "consumable_order_status_enum"`);
  }
}
