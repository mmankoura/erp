import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddResourceTypeToMaterial1706600000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check what the existing enum type is called (created by TypeORM for bom_items)
    const enumResult = await queryRunner.query(
      `SELECT t.typname FROM pg_type t
       JOIN pg_enum e ON t.oid = e.enumtypid
       WHERE e.enumlabel = 'SMT'
       LIMIT 1`,
    );
    const enumName = enumResult?.[0]?.typname || 'resource_type_enum';

    await queryRunner.query(
      `ALTER TABLE "materials" ADD "resource_type" "public"."${enumName}" NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "materials" DROP COLUMN "resource_type"`,
    );
  }
}
