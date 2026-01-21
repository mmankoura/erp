import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSoftDeleteToMaterials1736600000000
  implements MigrationInterface
{
  name = 'AddSoftDeleteToMaterials1736600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "materials" ADD "deleted_at" TIMESTAMP`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "materials" DROP COLUMN "deleted_at"`);
  }
}
