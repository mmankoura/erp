import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCustomerIdToProducts1768400000000
  implements MigrationInterface
{
  name = 'AddCustomerIdToProducts1768400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "products"
      ADD COLUMN "customer_id" uuid
    `);

    await queryRunner.query(`
      ALTER TABLE "products"
      ADD CONSTRAINT "FK_products_customer"
      FOREIGN KEY ("customer_id") REFERENCES "customers"("id")
      ON DELETE RESTRICT
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_products_customer_id" ON "products"("customer_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_products_customer_id"`);
    await queryRunner.query(`
      ALTER TABLE "products" DROP CONSTRAINT "FK_products_customer"
    `);
    await queryRunner.query(`
      ALTER TABLE "products" DROP COLUMN "customer_id"
    `);
  }
}
