import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUsersAndSessions1736600000030 implements MigrationInterface {
  name = 'CreateUsersAndSessions1736600000030';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create user_role enum type
    await queryRunner.query(`
      CREATE TYPE "user_role" AS ENUM ('ADMIN', 'MANAGER', 'WAREHOUSE_CLERK', 'OPERATOR')
    `);

    // Create users table
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "email" VARCHAR(255) NOT NULL,
        "username" VARCHAR(100) NOT NULL,
        "password_hash" VARCHAR(255) NOT NULL,
        "full_name" VARCHAR(255) NOT NULL,
        "role" "user_role" NOT NULL DEFAULT 'OPERATOR',
        "is_active" BOOLEAN NOT NULL DEFAULT true,
        "last_login_at" TIMESTAMPTZ NULL,
        "created_by" uuid NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_users" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_users_email" UNIQUE ("email"),
        CONSTRAINT "UQ_users_username" UNIQUE ("username"),
        CONSTRAINT "FK_users_created_by" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    // Create sessions table for express-session with connect-pg-simple
    await queryRunner.query(`
      CREATE TABLE "session" (
        "sid" VARCHAR NOT NULL,
        "sess" JSON NOT NULL,
        "expire" TIMESTAMPTZ NOT NULL,
        CONSTRAINT "PK_session" PRIMARY KEY ("sid")
      )
    `);

    // Index for session expiration cleanup
    await queryRunner.query(`
      CREATE INDEX "IDX_session_expire" ON "session" ("expire")
    `);

    // Index for faster user lookups
    await queryRunner.query(`
      CREATE INDEX "IDX_users_role" ON "users" ("role")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_users_is_active" ON "users" ("is_active")
    `);

    // Add comments for documentation
    await queryRunner.query(`
      COMMENT ON TABLE "users" IS 'User accounts for authentication and authorization'
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN "users"."role" IS 'User role: ADMIN (full access), MANAGER (full except settings), WAREHOUSE_CLERK (inventory ops), OPERATOR (view only)'
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN "users"."created_by" IS 'Admin user who created this account'
    `);
    await queryRunner.query(`
      COMMENT ON TABLE "session" IS 'Express session store for user authentication sessions'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_is_active"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_role"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_session_expire"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "session"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "user_role"`);
  }
}
