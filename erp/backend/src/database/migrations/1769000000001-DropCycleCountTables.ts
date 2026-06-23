import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Drops the legacy cycle_count_items and cycle_counts tables. The Physical
 * Count feature replaces them entirely (UID-scan-driven, per-customer).
 *
 * ONE-WAY: down() throws — restoring requires a DB backup. Confirmed
 * acceptable during planning (Round 5).
 */
export class DropCycleCountTables1769000000001 implements MigrationInterface {
  name = 'DropCycleCountTables1769000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "cycle_count_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "cycle_counts"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "cycle_count_item_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "cycle_count_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "cycle_count_type_enum"`);
  }

  public async down(): Promise<void> {
    throw new Error(
      'Irreversible migration: cycle-count tables were removed in favour of Physical Count. Restore from a pre-deploy DB dump.',
    );
  }
}
