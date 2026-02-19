import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateReceivingSessions1736600000035
  implements MigrationInterface
{
  name = 'CreateReceivingSessions1736600000035';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "receiving_session_status" AS ENUM ('OPEN', 'CLOSED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "receipt_type" AS ENUM ('PO', 'CUSTOMER_SUPPLIED', 'TRANSFER', 'RMA')`,
    );

    await queryRunner.query(`
      CREATE TABLE "receiving_sessions" (
        "id"                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "session_number"        varchar(50)  NOT NULL,
        "receipt_type"          "receipt_type" NOT NULL DEFAULT 'PO',
        "po_id"                 uuid REFERENCES "purchase_orders"("id"),
        "packing_slip_number"   varchar(100),
        "customer_id"           uuid REFERENCES "customers"("id"),
        "supplier_id"           uuid REFERENCES "suppliers"("id"),
        "auto_release_on_pass"  boolean NOT NULL DEFAULT true,
        "next_line_number"      integer NOT NULL DEFAULT 0,
        "status"                "receiving_session_status" NOT NULL DEFAULT 'OPEN',
        "started_by"            varchar(100) NOT NULL,
        "started_at"            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "closed_at"             TIMESTAMPTZ,
        "notes"                 text,
        "created_at"            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"            TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_receiving_session_number" ON "receiving_sessions" ("session_number")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_receiving_session_status" ON "receiving_sessions" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_receiving_session_po" ON "receiving_sessions" ("po_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_receiving_session_po"`);
    await queryRunner.query(`DROP INDEX "IDX_receiving_session_status"`);
    await queryRunner.query(`DROP INDEX "IDX_receiving_session_number"`);
    await queryRunner.query(`DROP TABLE "receiving_sessions"`);
    await queryRunner.query(`DROP TYPE "receipt_type"`);
    await queryRunner.query(`DROP TYPE "receiving_session_status"`);
  }
}
