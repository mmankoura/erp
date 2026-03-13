import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePoHistory1768200000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "po_history" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "po_number" varchar(50) NOT NULL,
        "order_date" date,
        "supplier" varchar(200),
        "ipn" varchar(100),
        "manufacturer" varchar(200),
        "mpn" varchar(200),
        "description" text,
        "quantity" decimal(12,4),
        "mounting_type" varchar(20),
        "packaging" varchar(50),
        "customer" varchar(100),
        "unit_price" decimal(12,6),
        "currency" varchar(10),
        "comments" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_po_history" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_po_history_po_number" ON "po_history" ("po_number")`);
    await queryRunner.query(`CREATE INDEX "IDX_po_history_supplier" ON "po_history" ("supplier")`);
    await queryRunner.query(`CREATE INDEX "IDX_po_history_ipn" ON "po_history" ("ipn")`);
    await queryRunner.query(`CREATE INDEX "IDX_po_history_mpn" ON "po_history" ("mpn")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "po_history"`);
  }
}
