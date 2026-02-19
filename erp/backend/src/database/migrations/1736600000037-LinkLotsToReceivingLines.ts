import { MigrationInterface, QueryRunner } from 'typeorm';

export class LinkLotsToReceivingLines1736600000037
  implements MigrationInterface
{
  name = 'LinkLotsToReceivingLines1736600000037';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "inventory_lots"
        ADD COLUMN "receiving_session_line_id" uuid REFERENCES "receiving_session_lines"("id")`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_lot_receiving_line" ON "inventory_lots" ("receiving_session_line_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_lot_receiving_line"`);
    await queryRunner.query(
      `ALTER TABLE "inventory_lots" DROP COLUMN "receiving_session_line_id"`,
    );
  }
}
