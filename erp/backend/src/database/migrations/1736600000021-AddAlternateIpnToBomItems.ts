import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAlternateIpnToBomItems1736600000021 implements MigrationInterface {
  name = 'AddAlternateIpnToBomItems1736600000021';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "bom_items"
      ADD COLUMN "alternate_ipn" character varying NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "bom_items"
      DROP COLUMN "alternate_ipn"
    `);
  }
}
