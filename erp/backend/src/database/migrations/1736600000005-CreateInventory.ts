import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInventory1736600000005 implements MigrationInterface {
  name = 'CreateInventory1736600000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create inventory table
    await queryRunner.query(`
      CREATE TABLE "inventory" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "material_id" uuid NOT NULL,
        "quantity_on_hand" decimal(12,2) NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_inventory" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_inventory_material_id" UNIQUE ("material_id"),
        CONSTRAINT "FK_inventory_material" FOREIGN KEY ("material_id")
          REFERENCES "materials"("id") ON DELETE CASCADE
      )
    `);

    // Create index on material_id (already unique, but explicit index for clarity)
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_inventory_material_id" ON "inventory" ("material_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_inventory_material_id"`);
    await queryRunner.query(`DROP TABLE "inventory"`);
  }
}
