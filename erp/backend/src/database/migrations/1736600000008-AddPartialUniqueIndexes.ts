import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPartialUniqueIndexes1736600000008 implements MigrationInterface {
  name = 'AddPartialUniqueIndexes1736600000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // =====================================================
    // MATERIALS: internal_part_number
    // =====================================================
    // Drop old unique index (allows duplicates when soft deleted)
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_0647866c777c37ac81539bafc1"
    `);

    // Create partial unique index (only enforces uniqueness for non-deleted records)
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_materials_internal_part_number_active"
      ON "materials" ("internal_part_number")
      WHERE "deleted_at" IS NULL
    `);

    // =====================================================
    // PRODUCTS: part_number
    // =====================================================
    // Drop old unique index
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_54bf41a17cbf9fc08fbcf49d67"
    `);

    // Create partial unique index
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_products_part_number_active"
      ON "products" ("part_number")
      WHERE "deleted_at" IS NULL
    `);

    // =====================================================
    // ORDERS: order_number
    // =====================================================
    // Drop old unique constraint and index
    await queryRunner.query(`
      ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "UQ_orders_order_number"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_orders_order_number"
    `);

    // Create partial unique index
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_orders_order_number_active"
      ON "orders" ("order_number")
      WHERE "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // =====================================================
    // ORDERS: Restore original unique constraint
    // =====================================================
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_orders_order_number_active"
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_orders_order_number" ON "orders" ("order_number")
    `);
    await queryRunner.query(`
      ALTER TABLE "orders" ADD CONSTRAINT "UQ_orders_order_number" UNIQUE ("order_number")
    `);

    // =====================================================
    // PRODUCTS: Restore original unique index
    // =====================================================
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_products_part_number_active"
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_54bf41a17cbf9fc08fbcf49d67" ON "products" ("part_number")
    `);

    // =====================================================
    // MATERIALS: Restore original unique index
    // =====================================================
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_materials_internal_part_number_active"
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_0647866c777c37ac81539bafc1" ON "materials" ("internal_part_number")
    `);
  }
}
