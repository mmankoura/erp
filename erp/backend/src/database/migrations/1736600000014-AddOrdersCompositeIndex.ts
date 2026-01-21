import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrdersCompositeIndex1736600000014 implements MigrationInterface {
  name = 'AddOrdersCompositeIndex1736600000014';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Composite index for common order queries:
    // "Show me pending orders due this week" or "All confirmed orders by due date"
    // This index supports queries filtering by status and sorting/filtering by due_date
    await queryRunner.query(`
      CREATE INDEX "IDX_orders_status_due_date"
      ON "orders" ("status", "due_date")
    `);

    // Add comment explaining the index purpose
    await queryRunner.query(`
      COMMENT ON INDEX "IDX_orders_status_due_date" IS 'Optimizes queries filtering by status and due_date (e.g., pending orders due this week)'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_orders_status_due_date"`);
  }
}
