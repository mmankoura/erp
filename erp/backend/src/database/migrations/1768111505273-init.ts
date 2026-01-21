import { MigrationInterface, QueryRunner } from "typeorm";

export class Init1768111505273 implements MigrationInterface {
    name = 'Init1768111505273'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "products" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "part_number" character varying NOT NULL, "name" character varying NOT NULL, "description" character varying, "active_bom_revision_id" character varying, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_0806c755e0aca124e67c0cf6d7d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_54bf41a17cbf9fc08fbcf49d67" ON "products" ("part_number") `);
        await queryRunner.query(`CREATE TABLE "materials" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "internal_part_number" character varying NOT NULL, "description" character varying, "value" character varying, "package" character varying, "manufacturer" character varying, "manufacturer_part_number" character varying, "unit" character varying NOT NULL DEFAULT 'pcs', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_2fd1a93ecb222a28bef28663fa0" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_0647866c777c37ac81539bafc1" ON "materials" ("internal_part_number") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_0647866c777c37ac81539bafc1"`);
        await queryRunner.query(`DROP TABLE "materials"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_54bf41a17cbf9fc08fbcf49d67"`);
        await queryRunner.query(`DROP TABLE "products"`);
    }

}
