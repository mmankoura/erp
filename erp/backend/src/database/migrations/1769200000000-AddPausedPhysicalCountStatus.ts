import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the PAUSED value to the physical count status enum. A count can be
 * paused mid-session (scanning blocked, snapshot preserved) and resumed back to
 * IN_PROGRESS. "One active count per customer" is enforced in the service guard,
 * so the partial unique index is left unchanged (two PAUSED counts can't arise —
 * a count only reaches PAUSED from IN_PROGRESS, of which the index allows one).
 */
export class AddPausedPhysicalCountStatus1769200000000
  implements MigrationInterface
{
  name = 'AddPausedPhysicalCountStatus1769200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "physical_count_status_enum" ADD VALUE IF NOT EXISTS 'PAUSED' BEFORE 'PENDING_REVIEW'`,
    );
  }

  public async down(): Promise<void> {
    // PostgreSQL cannot drop a value from an enum type without recreating it.
    // Intentionally left as a no-op.
  }
}
