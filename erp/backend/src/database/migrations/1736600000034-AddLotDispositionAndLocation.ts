import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLotDispositionAndLocation1736600000034
  implements MigrationInterface
{
  name = 'AddLotDispositionAndLocation1736600000034';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Extend lot_status enum with disposition states
    await queryRunner.query(
      `ALTER TYPE "lot_status" ADD VALUE IF NOT EXISTS 'REJECTED'`,
    );
    await queryRunner.query(
      `ALTER TYPE "lot_status" ADD VALUE IF NOT EXISTS 'SCRAPPED'`,
    );
    await queryRunner.query(
      `ALTER TYPE "lot_status" ADD VALUE IF NOT EXISTS 'RTV'`,
    );

    // Add new columns to inventory_lots
    await queryRunner.query(
      `ALTER TABLE "inventory_lots"
        ADD COLUMN "disposition" varchar(50),
        ADD COLUMN "location" varchar(50) DEFAULT 'RECEIVING',
        ADD COLUMN "owner_type" "owner_type_enum" NOT NULL DEFAULT 'COMPANY',
        ADD COLUMN "owner_id" uuid`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_lot_owner" ON "inventory_lots" ("owner_type", "owner_id")`,
    );

    await queryRunner.query(
      `ALTER TABLE "inventory_lots" ADD CONSTRAINT "CHK_lot_ownership"
        CHECK (
          (owner_type = 'COMPANY' AND owner_id IS NULL) OR
          (owner_type = 'CUSTOMER' AND owner_id IS NOT NULL)
        )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "inventory_lots" DROP CONSTRAINT "CHK_lot_ownership"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_lot_owner"`);
    await queryRunner.query(
      `ALTER TABLE "inventory_lots"
        DROP COLUMN "owner_id",
        DROP COLUMN "owner_type",
        DROP COLUMN "location",
        DROP COLUMN "disposition"`,
    );
    // Note: Cannot remove enum values in PostgreSQL without recreating the type
  }
}
