import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCustomerToProduct1706500000000 implements MigrationInterface {
  name = 'AddCustomerToProduct1706500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add customer_id column as nullable first
    await queryRunner.query(`
      ALTER TABLE "products"
      ADD COLUMN IF NOT EXISTS "customer_id" uuid
    `);

    // Update existing products to link to the first customer (if any exist without customer_id)
    await queryRunner.query(`
      UPDATE "products" p
      SET "customer_id" = (SELECT id FROM "customers" LIMIT 1)
      WHERE p."customer_id" IS NULL
    `);

    // Make customer_id NOT NULL
    await queryRunner.query(`
      ALTER TABLE "products"
      ALTER COLUMN "customer_id" SET NOT NULL
    `);

    // Add foreign key constraint
    await queryRunner.query(`
      ALTER TABLE "products"
      ADD CONSTRAINT "FK_products_customer"
      FOREIGN KEY ("customer_id") REFERENCES "customers"("id")
      ON DELETE RESTRICT
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "FK_products_customer"
    `);
    await queryRunner.query(`
      ALTER TABLE "products" DROP COLUMN IF EXISTS "customer_id"
    `);
  }
}
