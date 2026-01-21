import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSoftDeleteToProducts1736600000001
  implements MigrationInterface
{
  name = 'AddSoftDeleteToProducts1736600000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "products" ADD "deleted_at" TIMESTAMP`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "deleted_at"`);
  }
}
