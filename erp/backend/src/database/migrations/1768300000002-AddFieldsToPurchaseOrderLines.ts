import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFieldsToPurchaseOrderLines1768300000002
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "purchase_order_lines" ADD "manufacturer" varchar(255) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_order_lines" ADD "manufacturer_pn" varchar(255) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_order_lines" ADD "packaging" varchar(100) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "purchase_order_lines" DROP COLUMN "packaging"`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_order_lines" DROP COLUMN "manufacturer_pn"`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_order_lines" DROP COLUMN "manufacturer"`,
    );
  }
}
