import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateReceivingInspection1736600000016
  implements MigrationInterface
{
  name = 'CreateReceivingInspection1736600000016';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create aml_status_enum
    await queryRunner.query(`
      CREATE TYPE "aml_status_enum" AS ENUM (
        'PENDING',
        'APPROVED',
        'SUSPENDED',
        'OBSOLETE'
      )
    `);

    // Create inspection_status_enum
    await queryRunner.query(`
      CREATE TYPE "inspection_status_enum" AS ENUM (
        'PENDING',
        'IN_PROGRESS',
        'APPROVED',
        'REJECTED',
        'ON_HOLD',
        'RELEASED'
      )
    `);

    // Create inspection_result_enum
    await queryRunner.query(`
      CREATE TYPE "inspection_result_enum" AS ENUM (
        'PASS',
        'FAIL',
        'CONDITIONAL',
        'NOT_CHECKED'
      )
    `);

    // Create approved_manufacturers table
    await queryRunner.query(`
      CREATE TABLE "approved_manufacturers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "material_id" uuid NOT NULL,
        "manufacturer" character varying(100) NOT NULL,
        "manufacturer_part_number" character varying(100) NOT NULL,
        "status" "aml_status_enum" NOT NULL DEFAULT 'PENDING',
        "preferred_supplier_id" uuid,
        "approved_by" character varying(100),
        "approved_at" TIMESTAMP WITH TIME ZONE,
        "priority" integer NOT NULL DEFAULT 0,
        "notes" text,
        "created_by" character varying(100),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_approved_manufacturers" PRIMARY KEY ("id"),
        CONSTRAINT "FK_approved_manufacturers_material" FOREIGN KEY ("material_id")
          REFERENCES "materials"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_approved_manufacturers_supplier" FOREIGN KEY ("preferred_supplier_id")
          REFERENCES "suppliers"("id") ON DELETE SET NULL
      )
    `);

    // Create partial unique index for active AML entries
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_aml_material_mfr_mpn_active"
      ON "approved_manufacturers" ("material_id", "manufacturer", "manufacturer_part_number")
      WHERE "deleted_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_approved_manufacturers_material_id"
      ON "approved_manufacturers" ("material_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_approved_manufacturers_manufacturer"
      ON "approved_manufacturers" ("manufacturer")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_approved_manufacturers_mpn"
      ON "approved_manufacturers" ("manufacturer_part_number")
    `);

    // Create receiving_inspections table
    await queryRunner.query(`
      CREATE TABLE "receiving_inspections" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "inspection_number" character varying(50) NOT NULL,
        "po_line_id" uuid NOT NULL,
        "material_id" uuid NOT NULL,
        "received_ipn" character varying(100) NOT NULL,
        "received_manufacturer" character varying(100),
        "received_mpn" character varying(100),
        "quantity_received" decimal(12,4) NOT NULL,
        "matched_aml_id" uuid,
        "status" "inspection_status_enum" NOT NULL DEFAULT 'PENDING',
        "overall_result" "inspection_result_enum" NOT NULL DEFAULT 'NOT_CHECKED',
        "validation_results" jsonb,
        "unit_cost" decimal(12,4),
        "received_by" character varying(100),
        "received_at" TIMESTAMP WITH TIME ZONE,
        "inspected_by" character varying(100),
        "inspected_at" TIMESTAMP WITH TIME ZONE,
        "disposition_by" character varying(100),
        "disposition_at" TIMESTAMP WITH TIME ZONE,
        "disposition_notes" text,
        "inventory_transaction_id" uuid,
        "notes" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_receiving_inspections" PRIMARY KEY ("id"),
        CONSTRAINT "FK_receiving_inspections_po_line" FOREIGN KEY ("po_line_id")
          REFERENCES "purchase_order_lines"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_receiving_inspections_material" FOREIGN KEY ("material_id")
          REFERENCES "materials"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_receiving_inspections_aml" FOREIGN KEY ("matched_aml_id")
          REFERENCES "approved_manufacturers"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_receiving_inspections_inventory" FOREIGN KEY ("inventory_transaction_id")
          REFERENCES "inventory_transactions"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_receiving_inspections_number"
      ON "receiving_inspections" ("inspection_number")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_receiving_inspections_po_line_id"
      ON "receiving_inspections" ("po_line_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_receiving_inspections_material_id"
      ON "receiving_inspections" ("material_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_receiving_inspections_status"
      ON "receiving_inspections" ("status")
    `);

    // Covering index for pending inspections query
    await queryRunner.query(`
      CREATE INDEX "IDX_receiving_inspections_pending"
      ON "receiving_inspections" ("status", "created_at")
      WHERE "status" IN ('PENDING', 'IN_PROGRESS', 'ON_HOLD')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(`DROP INDEX "IDX_receiving_inspections_pending"`);
    await queryRunner.query(`DROP INDEX "IDX_receiving_inspections_status"`);
    await queryRunner.query(
      `DROP INDEX "IDX_receiving_inspections_material_id"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_receiving_inspections_po_line_id"`);
    await queryRunner.query(`DROP INDEX "IDX_receiving_inspections_number"`);
    await queryRunner.query(`DROP INDEX "IDX_approved_manufacturers_mpn"`);
    await queryRunner.query(
      `DROP INDEX "IDX_approved_manufacturers_manufacturer"`,
    );
    await queryRunner.query(
      `DROP INDEX "IDX_approved_manufacturers_material_id"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_aml_material_mfr_mpn_active"`);

    // Drop tables
    await queryRunner.query(`DROP TABLE "receiving_inspections"`);
    await queryRunner.query(`DROP TABLE "approved_manufacturers"`);

    // Drop enums
    await queryRunner.query(`DROP TYPE "inspection_result_enum"`);
    await queryRunner.query(`DROP TYPE "inspection_status_enum"`);
    await queryRunner.query(`DROP TYPE "aml_status_enum"`);
  }
}
