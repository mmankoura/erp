import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAmlProvenance1736600000033 implements MigrationInterface {
  name = 'AddAmlProvenance1736600000033';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "approved_manufacturers"
        ADD COLUMN "source" varchar(20) NOT NULL DEFAULT 'MANUAL',
        ADD COLUMN "source_bom_revision_id" uuid REFERENCES "bom_revisions"("id") ON DELETE SET NULL,
        ADD COLUMN "customer_id" uuid REFERENCES "customers"("id") ON DELETE SET NULL`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_aml_source" ON "approved_manufacturers" ("source")`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_aml_customer" ON "approved_manufacturers" ("customer_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_aml_customer"`);
    await queryRunner.query(`DROP INDEX "IDX_aml_source"`);
    await queryRunner.query(
      `ALTER TABLE "approved_manufacturers"
        DROP COLUMN "customer_id",
        DROP COLUMN "source_bom_revision_id",
        DROP COLUMN "source"`,
    );
  }
}
