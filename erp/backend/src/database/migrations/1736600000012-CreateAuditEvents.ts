import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuditEvents1736600000012 implements MigrationInterface {
  name = 'CreateAuditEvents1736600000012';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create audit_events table for comprehensive audit trail
    // This is the foundation for roles/approvals, regulatory compliance, and user accountability
    await queryRunner.query(`
      CREATE TABLE "audit_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "event_type" VARCHAR(50) NOT NULL,
        "entity_type" VARCHAR(50) NOT NULL,
        "entity_id" uuid NOT NULL,
        "actor" VARCHAR(100) NULL,
        "old_value" JSONB NULL,
        "new_value" JSONB NULL,
        "metadata" JSONB NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_audit_events" PRIMARY KEY ("id")
      )
    `);

    // Index for looking up events by entity (most common query pattern)
    await queryRunner.query(`
      CREATE INDEX "IDX_audit_events_entity" ON "audit_events" ("entity_type", "entity_id")
    `);

    // Index for looking up events by actor (who did what)
    await queryRunner.query(`
      CREATE INDEX "IDX_audit_events_actor" ON "audit_events" ("actor")
      WHERE "actor" IS NOT NULL
    `);

    // Index for time-based queries (recent events, date ranges)
    await queryRunner.query(`
      CREATE INDEX "IDX_audit_events_created_at" ON "audit_events" ("created_at")
    `);

    // Index for event type queries (all status changes, all BOM activations, etc.)
    await queryRunner.query(`
      CREATE INDEX "IDX_audit_events_event_type" ON "audit_events" ("event_type")
    `);

    // Add comments for documentation
    await queryRunner.query(`
      COMMENT ON TABLE "audit_events" IS 'Append-only audit log for all significant system events. Foundation for compliance and accountability.'
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN "audit_events"."event_type" IS 'Type of event: ORDER_STATUS_CHANGE, BOM_ACTIVATED, INVENTORY_ADJUSTMENT, etc.'
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN "audit_events"."entity_type" IS 'Type of entity affected: order, bom_revision, inventory_transaction, etc.'
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN "audit_events"."actor" IS 'Username or system identifier. Will be converted to user FK when auth is implemented.'
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN "audit_events"."old_value" IS 'Previous state before the change (for updates). NULL for creates.'
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN "audit_events"."new_value" IS 'New state after the change. Contains the created/updated values.'
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN "audit_events"."metadata" IS 'Additional context: IP address, session ID, reason, approval info, etc.'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_events_event_type"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_events_created_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_events_actor"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_audit_events_entity"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_events"`);
  }
}
