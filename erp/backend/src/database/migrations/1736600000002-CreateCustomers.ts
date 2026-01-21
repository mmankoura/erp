import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCustomers1736600000002 implements MigrationInterface {
  name = 'CreateCustomers1736600000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "customers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying NOT NULL,
        "contact_person" character varying,
        "email" character varying,
        "phone" character varying,
        "address" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP,
        CONSTRAINT "PK_customers" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_customers_name" ON "customers" ("name")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_customers_name"`);
    await queryRunner.query(`DROP TABLE "customers"`);
  }
}
