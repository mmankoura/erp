import { MigrationInterface, QueryRunner } from 'typeorm';

export class BackfillMaterialResourceType1768300000001
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Backfill resource_type on materials from bom_items where not already set.
    // Uses the most common resource_type for each material across all BOM items.
    await queryRunner.query(`
      UPDATE materials m
      SET resource_type = sub.resource_type
      FROM (
        SELECT DISTINCT ON (material_id)
          material_id,
          resource_type
        FROM bom_items
        WHERE resource_type IS NOT NULL
        GROUP BY material_id, resource_type
        ORDER BY material_id, COUNT(*) DESC
      ) sub
      WHERE m.id = sub.material_id
        AND m.resource_type IS NULL
    `);

    // Drop the old unique constraint on kitting_list_items that includes resource_type
    // and replace with one on just (kitting_list_id, material_id)
    const table = await queryRunner.getTable('kitting_list_items');
    const oldUnique = table?.uniques.find(
      (u) =>
        u.columnNames.includes('kitting_list_id') &&
        u.columnNames.includes('material_id') &&
        u.columnNames.includes('resource_type'),
    );
    if (oldUnique) {
      await queryRunner.query(
        `ALTER TABLE "kitting_list_items" DROP CONSTRAINT "${oldUnique.name}"`,
      );
    }
    await queryRunner.query(
      `ALTER TABLE "kitting_list_items" ADD CONSTRAINT "UQ_kitting_list_items_list_material" UNIQUE ("kitting_list_id", "material_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore old unique constraint
    await queryRunner.query(
      `ALTER TABLE "kitting_list_items" DROP CONSTRAINT IF EXISTS "UQ_kitting_list_items_list_material"`,
    );
    await queryRunner.query(
      `ALTER TABLE "kitting_list_items" ADD CONSTRAINT "UQ_kitting_list_items_list_material_resource" UNIQUE ("kitting_list_id", "material_id", "resource_type")`,
    );
    // Note: We don't clear material.resource_type on rollback since it's a useful field
  }
}
