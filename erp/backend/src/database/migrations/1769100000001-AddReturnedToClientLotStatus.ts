import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the RETURNED_TO_CLIENT value to the lot status enum. When a reel is
 * returned to the customer it is removed from our inventory entirely (status
 * set to RETURNED_TO_CLIENT, quantity zeroed), so it drops out of on-hand
 * (which sums only ACTIVE lots) while remaining auditable.
 */
export class AddReturnedToClientLotStatus1769100000001
  implements MigrationInterface
{
  name = 'AddReturnedToClientLotStatus1769100000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "lot_status_enum" ADD VALUE IF NOT EXISTS 'RETURNED_TO_CLIENT'`,
    );
  }

  public async down(): Promise<void> {
    // PostgreSQL cannot drop a value from an enum type without recreating it.
    // Intentionally left as a no-op.
  }
}
