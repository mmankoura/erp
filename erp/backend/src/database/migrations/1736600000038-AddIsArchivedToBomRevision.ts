import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIsArchivedToBomRevision1736600000038 implements MigrationInterface {
  name = 'AddIsArchivedToBomRevision1736600000038';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bom_revisions" ADD "is_archived" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bom_revisions" DROP COLUMN "is_archived"`,
    );
  }
}
