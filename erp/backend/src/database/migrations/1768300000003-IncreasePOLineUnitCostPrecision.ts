import { MigrationInterface, QueryRunner } from 'typeorm';

export class IncreasePOLineUnitCostPrecision1768300000003
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "purchase_order_lines" ALTER COLUMN "unit_cost" TYPE decimal(12,6)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "purchase_order_lines" ALTER COLUMN "unit_cost" TYPE decimal(12,4)`,
    );
  }
}
