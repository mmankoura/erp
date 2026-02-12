import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAllocationStatuses1736600000027 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add new enum values to allocation_status_enum
    // PostgreSQL allows adding values to an enum type
    await queryRunner.query(`
      ALTER TYPE "allocation_status_enum" ADD VALUE IF NOT EXISTS 'FLOOR_STOCK'
    `);
    await queryRunner.query(`
      ALTER TYPE "allocation_status_enum" ADD VALUE IF NOT EXISTS 'RETURNED'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Note: PostgreSQL doesn't support removing enum values directly
    // To properly revert, we would need to recreate the enum type
    // For simplicity, we'll leave the values in place on rollback
    // as they won't affect existing functionality
    console.log('Note: Enum values FLOOR_STOCK and RETURNED remain in allocation_status_enum');
  }
}
