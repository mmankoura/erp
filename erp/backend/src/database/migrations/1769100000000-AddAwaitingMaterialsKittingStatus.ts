import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the AWAITING_MATERIALS value to the kitting list status enum. A kit
 * whose Complete pass still has shortages is parked in this state (shortage
 * report -> buyer -> purchase -> receive) until it is resumed and the received
 * material is scanned in against the kit.
 */
export class AddAwaitingMaterialsKittingStatus1769100000000
  implements MigrationInterface
{
  name = 'AddAwaitingMaterialsKittingStatus1769100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "kitting_list_status_enum" ADD VALUE IF NOT EXISTS 'AWAITING_MATERIALS' BEFORE 'COMPLETED'`,
    );
  }

  public async down(): Promise<void> {
    // PostgreSQL cannot drop a value from an enum type without recreating it.
    // Any rows in AWAITING_MATERIALS must first be migrated to another status.
    // Intentionally left as a no-op.
  }
}
