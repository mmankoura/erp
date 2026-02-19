import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateReceivingSessionLines1736600000036
  implements MigrationInterface
{
  name = 'CreateReceivingSessionLines1736600000036';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "receiving_line_validation_status" AS ENUM ('PENDING', 'PASS', 'FAIL', 'FLAGGED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "hold_reason_code" AS ENUM ('WRONG_MPN', 'DAMAGED', 'NO_PO_LINE', 'NO_AML', 'COUNTERFEIT_CONCERN', 'OTHER')`,
    );
    await queryRunner.query(
      `CREATE TYPE "disposition_action" AS ENUM ('ACCEPT_DEVIATION', 'PARTIAL_ACCEPT', 'REJECT_RTV', 'SCRAP')`,
    );

    await queryRunner.query(`
      CREATE TABLE "receiving_session_lines" (
        "id"                     uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "session_id"             uuid NOT NULL REFERENCES "receiving_sessions"("id") ON DELETE CASCADE,
        "line_number"            integer NOT NULL,
        "client_request_id"      uuid NOT NULL,
        "material_id"            uuid NOT NULL REFERENCES "materials"("id"),
        "received_ipn"           varchar(100) NOT NULL,
        "received_mpn"           varchar(100),
        "received_manufacturer"  varchar(100),
        "quantity_received"      decimal(12,4) NOT NULL,
        "package_type"           "package_type_enum" NOT NULL DEFAULT 'TR',
        "po_line_id"             uuid REFERENCES "purchase_order_lines"("id"),
        "uid"                    varchar(100) NOT NULL,
        "lot_id"                 uuid REFERENCES "inventory_lots"("id"),
        "inspection_id"          uuid REFERENCES "receiving_inspections"("id"),
        "validation_status"      "receiving_line_validation_status" NOT NULL DEFAULT 'PENDING',
        "ipn_match"              boolean,
        "aml_match"              boolean,
        "matched_aml_id"         uuid REFERENCES "approved_manufacturers"("id"),
        "qty_expected"           decimal(12,4),
        "qty_remaining_on_po"    decimal(12,4),
        "hold_reason_code"       "hold_reason_code",
        "hold_notes"             text,
        "disposition_action"     "disposition_action",
        "disposition_by"         varchar(100),
        "disposition_at"         TIMESTAMPTZ,
        "disposition_notes"      text,
        "validation_details"     jsonb,
        "created_at"             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"             TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_session_line_uid" ON "receiving_session_lines" ("uid")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_session_line_idempotency" ON "receiving_session_lines" ("session_id", "client_request_id")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_session_line_number" ON "receiving_session_lines" ("session_id", "line_number")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_session_line_session" ON "receiving_session_lines" ("session_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_session_line_material" ON "receiving_session_lines" ("material_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_session_line_validation" ON "receiving_session_lines" ("validation_status")`,
    );

    // UID Sequences table for atomic UID generation
    await queryRunner.query(`
      CREATE TABLE "uid_sequences" (
        "date_prefix" varchar(8) PRIMARY KEY,
        "last_value"  integer NOT NULL DEFAULT 0
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "uid_sequences"`);
    await queryRunner.query(`DROP INDEX "IDX_session_line_validation"`);
    await queryRunner.query(`DROP INDEX "IDX_session_line_material"`);
    await queryRunner.query(`DROP INDEX "IDX_session_line_session"`);
    await queryRunner.query(`DROP INDEX "IDX_session_line_number"`);
    await queryRunner.query(`DROP INDEX "IDX_session_line_idempotency"`);
    await queryRunner.query(`DROP INDEX "IDX_session_line_uid"`);
    await queryRunner.query(`DROP TABLE "receiving_session_lines"`);
    await queryRunner.query(`DROP TYPE "disposition_action"`);
    await queryRunner.query(`DROP TYPE "hold_reason_code"`);
    await queryRunner.query(`DROP TYPE "receiving_line_validation_status"`);
  }
}
