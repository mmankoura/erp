import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Login matches username/email case-insensitively, so the database must
 * guarantee no two accounts differ only by case — otherwise the login lookup
 * would be ambiguous and could resolve to either account.
 *
 * The existing exact-match unique constraints are left in place; these are
 * strictly stronger and sit alongside them. They also give the case-insensitive
 * login lookup an index to use.
 */
export class AddCaseInsensitiveUserUniqueness1769400000000 implements MigrationInterface {
  name = 'AddCaseInsensitiveUserUniqueness1769400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Fails loudly if two accounts already differ only by case — that must be
    // resolved by hand rather than silently picking a winner.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_users_username_lower_unique"
      ON "users" (LOWER("username"))
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_users_email_lower_unique"
      ON "users" (LOWER("email"))
      WHERE "email" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_users_email_lower_unique"`);
    await queryRunner.query(`DROP INDEX "IDX_users_username_lower_unique"`);
  }
}
