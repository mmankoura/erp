import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Saved BOM Wizard transformation recipes.
 *
 * Customer BOMs arrive in the same awkward shape month after month, so the
 * sequence that cleans one up is worth keeping and replaying against the next.
 *
 * Names are unique case-insensitively: the Saved Recordings dropdown is picked
 * from by eye, and "AEGIS multi-row" sitting next to "Aegis Multi-Row" is a
 * trap rather than a feature.
 */
export class CreateBomWizardRecipes1769500000000 implements MigrationInterface {
  name = 'CreateBomWizardRecipes1769500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "bom_wizard_recipes" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" character varying(255) NOT NULL,
        "description" text,
        "schema_version" integer NOT NULL DEFAULT 1,
        "actions" jsonb NOT NULL,
        "created_by" character varying,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_bom_wizard_recipes" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_bom_wizard_recipes_name_lower"
      ON "bom_wizard_recipes" (LOWER("name"))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "IDX_bom_wizard_recipes_name_lower"`,
    );
    await queryRunner.query(`DROP TABLE "bom_wizard_recipes"`);
  }
}
