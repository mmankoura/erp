import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakeUserEmailOptional1736600000031 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the existing unique constraint on email
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_users_email"
    `);
    await queryRunner.query(`
      ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "UQ_users_email"
    `);

    // Make email nullable
    await queryRunner.query(`
      ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL
    `);

    // Add partial unique index (only unique when email is not null)
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_users_email_unique" ON "users" ("email") WHERE "email" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop partial unique index
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_users_email_unique"
    `);

    // Make email required again (this will fail if there are null emails)
    await queryRunner.query(`
      ALTER TABLE "users" ALTER COLUMN "email" SET NOT NULL
    `);

    // Restore unique constraint
    await queryRunner.query(`
      ALTER TABLE "users" ADD CONSTRAINT "UQ_users_email" UNIQUE ("email")
    `);
  }
}
