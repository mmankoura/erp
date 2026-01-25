import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCustomerIdToMaterials1736600000023
  implements MigrationInterface
{
  name = 'AddCustomerIdToMaterials1736600000023';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add customer_id column to materials table
    await queryRunner.query(`
      ALTER TABLE "materials"
      ADD COLUMN "customer_id" uuid
    `);

    // Add foreign key constraint
    await queryRunner.query(`
      ALTER TABLE "materials"
      ADD CONSTRAINT "FK_materials_customer"
      FOREIGN KEY ("customer_id") REFERENCES "customers"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE
    `);

    // Add index for faster lookups by customer
    await queryRunner.query(`
      CREATE INDEX "IDX_materials_customer_id" ON "materials"("customer_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_materials_customer_id"`);
    await queryRunner.query(`
      ALTER TABLE "materials" DROP CONSTRAINT "FK_materials_customer"
    `);
    await queryRunner.query(`
      ALTER TABLE "materials" DROP COLUMN "customer_id"
    `);
  }
}
