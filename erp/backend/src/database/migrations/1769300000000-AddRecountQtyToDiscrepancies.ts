import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRecountQtyToDiscrepancies1769300000000 implements MigrationInterface {
  name = 'AddRecountQtyToDiscrepancies1769300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Nullable: existing RECOUNT rows on counts still in PENDING_REVIEW were
    // resolved without a qty and keep the legacy child-count spawn behaviour.
    await queryRunner.query(`
      ALTER TABLE "physical_count_discrepancies"
      ADD COLUMN "recount_qty" numeric(12,4)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "physical_count_discrepancies"
      DROP COLUMN "recount_qty"
    `);
  }
}
