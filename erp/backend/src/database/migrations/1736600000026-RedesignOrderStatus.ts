import { MigrationInterface, QueryRunner } from 'typeorm';

export class RedesignOrderStatus1736600000026 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Step 1: Create new enum type with all values
    await queryRunner.query(`
      CREATE TYPE "order_status_enum_new" AS ENUM (
        'ENTERED',
        'KITTING',
        'SMT',
        'TH',
        'SHIPPED',
        'ON_HOLD',
        'CANCELLED'
      )
    `);

    // Step 2: Add a temporary column with the new enum type
    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD COLUMN "status_new" "order_status_enum_new"
    `);

    // Step 3: Migrate existing data to new statuses
    // PENDING -> ENTERED (pre-kitting)
    // CONFIRMED -> ENTERED (pre-kitting, 4 records based on data inspection)
    // IN_PRODUCTION -> SMT (assume SMT as default production stage)
    // SHIPPED -> SHIPPED (keep)
    // COMPLETED -> SHIPPED (merge with shipped)
    // CANCELLED -> CANCELLED (keep)
    await queryRunner.query(`
      UPDATE "orders" SET "status_new" = CASE
        WHEN "status" = 'PENDING' THEN 'ENTERED'::"order_status_enum_new"
        WHEN "status" = 'CONFIRMED' THEN 'ENTERED'::"order_status_enum_new"
        WHEN "status" = 'IN_PRODUCTION' THEN 'SMT'::"order_status_enum_new"
        WHEN "status" = 'SHIPPED' THEN 'SHIPPED'::"order_status_enum_new"
        WHEN "status" = 'COMPLETED' THEN 'SHIPPED'::"order_status_enum_new"
        WHEN "status" = 'CANCELLED' THEN 'CANCELLED'::"order_status_enum_new"
        ELSE 'ENTERED'::"order_status_enum_new"
      END
    `);

    // Step 4: Drop the old column and rename the new one
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "status"`);
    await queryRunner.query(`ALTER TABLE "orders" RENAME COLUMN "status_new" TO "status"`);

    // Step 5: Set NOT NULL and default
    await queryRunner.query(`
      ALTER TABLE "orders"
      ALTER COLUMN "status" SET NOT NULL,
      ALTER COLUMN "status" SET DEFAULT 'ENTERED'::"order_status_enum_new"
    `);

    // Step 6: Drop old enum type
    await queryRunner.query(`DROP TYPE "order_status_enum"`);

    // Step 7: Rename new enum to original name
    await queryRunner.query(`ALTER TYPE "order_status_enum_new" RENAME TO "order_status_enum"`);

    // Step 8: Add previous_status column for ON_HOLD tracking
    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD COLUMN "previous_status" "order_status_enum"
    `);

    // Step 9: Add order_production_type column to track SMT-only, TH-only, or SMT+TH
    await queryRunner.query(`
      CREATE TYPE "order_production_type_enum" AS ENUM ('SMT_ONLY', 'TH_ONLY', 'SMT_AND_TH')
    `);
    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD COLUMN "production_type" "order_production_type_enum"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Step 1: Drop the production_type column and enum
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "production_type"`);
    await queryRunner.query(`DROP TYPE "order_production_type_enum"`);

    // Step 2: Drop previous_status column
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "previous_status"`);

    // Step 3: Create old enum type
    await queryRunner.query(`
      CREATE TYPE "order_status_enum_old" AS ENUM (
        'PENDING',
        'CONFIRMED',
        'IN_PRODUCTION',
        'SHIPPED',
        'COMPLETED',
        'CANCELLED'
      )
    `);

    // Step 4: Add temporary column with old enum
    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD COLUMN "status_old" "order_status_enum_old"
    `);

    // Step 5: Migrate data back
    // ENTERED -> CONFIRMED
    // KITTING -> IN_PRODUCTION
    // SMT -> IN_PRODUCTION
    // TH -> IN_PRODUCTION
    // SHIPPED -> SHIPPED
    // ON_HOLD -> PENDING
    // CANCELLED -> CANCELLED
    await queryRunner.query(`
      UPDATE "orders" SET "status_old" = CASE
        WHEN "status" = 'ENTERED' THEN 'CONFIRMED'::"order_status_enum_old"
        WHEN "status" = 'KITTING' THEN 'IN_PRODUCTION'::"order_status_enum_old"
        WHEN "status" = 'SMT' THEN 'IN_PRODUCTION'::"order_status_enum_old"
        WHEN "status" = 'TH' THEN 'IN_PRODUCTION'::"order_status_enum_old"
        WHEN "status" = 'SHIPPED' THEN 'SHIPPED'::"order_status_enum_old"
        WHEN "status" = 'ON_HOLD' THEN 'PENDING'::"order_status_enum_old"
        WHEN "status" = 'CANCELLED' THEN 'CANCELLED'::"order_status_enum_old"
        ELSE 'PENDING'::"order_status_enum_old"
      END
    `);

    // Step 6: Drop current column and rename old one
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "status"`);
    await queryRunner.query(`ALTER TABLE "orders" RENAME COLUMN "status_old" TO "status"`);

    // Step 7: Set NOT NULL and default
    await queryRunner.query(`
      ALTER TABLE "orders"
      ALTER COLUMN "status" SET NOT NULL,
      ALTER COLUMN "status" SET DEFAULT 'PENDING'::"order_status_enum_old"
    `);

    // Step 8: Drop new enum and rename old to original name
    await queryRunner.query(`DROP TYPE "order_status_enum"`);
    await queryRunner.query(`ALTER TYPE "order_status_enum_old" RENAME TO "order_status_enum"`);
  }
}
