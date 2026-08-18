import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateManualStockEntries1769600000000 implements MigrationInterface {
  name = 'CreateManualStockEntries1769600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "manual_stock_entries" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "uid" varchar(100),
        "ipn" varchar(100) NOT NULL,
        "description" varchar(500),
        "mpn" varchar(100),
        "manufacturer" varchar(200),
        "quantity" decimal(12,4) NOT NULL,
        "package_type" varchar(20) NOT NULL DEFAULT 'REEL',
        "location" varchar(100),
        "date_code" varchar(50),
        "lot_code" varchar(100),
        "reference" varchar(200),
        "notes" text,
        "entered_by" varchar(100) NOT NULL,
        "entered_at" timestamptz NOT NULL DEFAULT NOW(),
        "created_at" timestamptz NOT NULL DEFAULT NOW(),
        "updated_at" timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_manual_stock_entries" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_manual_stock_entries_uid" ON "manual_stock_entries"("uid")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_manual_stock_entries_ipn" ON "manual_stock_entries"("ipn")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_manual_stock_entries_entered_at" ON "manual_stock_entries"("entered_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "manual_stock_entries"`);
  }
}
