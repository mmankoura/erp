import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAttachments1736600000032 implements MigrationInterface {
  name = 'CreateAttachments1736600000032';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "attachments" (
        "id"            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "entity_type"   varchar(50)  NOT NULL,
        "entity_id"     uuid         NOT NULL,
        "filename"      varchar(255) NOT NULL,
        "mime_type"     varchar(100) NOT NULL,
        "size_bytes"    integer      NOT NULL,
        "sha256"        varchar(64)  NOT NULL,
        "storage_key"   varchar(500) NOT NULL,
        "uploaded_by"   varchar(100),
        "uploaded_at"   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        "notes"         text,
        "deleted_at"    TIMESTAMPTZ,
        "deleted_by"    varchar(100)
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_attachments_entity" ON "attachments" ("entity_type", "entity_id")`,
    );

    await queryRunner.query(
      `COMMENT ON TABLE "attachments" IS 'Entity-agnostic file attachments with soft delete for audit trail'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_attachments_entity"`);
    await queryRunner.query(`DROP TABLE "attachments"`);
  }
}
