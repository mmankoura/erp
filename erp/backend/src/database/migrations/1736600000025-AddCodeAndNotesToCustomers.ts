import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

export class AddCodeAndNotesToCustomers1736600000025
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add code column
    await queryRunner.addColumn(
      'customers',
      new TableColumn({
        name: 'code',
        type: 'varchar',
        length: '50',
        isNullable: true, // Temporarily nullable for existing rows
      }),
    );

    // Add notes column
    await queryRunner.addColumn(
      'customers',
      new TableColumn({
        name: 'notes',
        type: 'text',
        isNullable: true,
      }),
    );

    // Generate codes for existing customers (use first 3 chars of name uppercase)
    await queryRunner.query(`
      UPDATE customers
      SET code = UPPER(SUBSTRING(name, 1, 3)) || '-' || SUBSTRING(id::text, 1, 4)
      WHERE code IS NULL
    `);

    // Make code NOT NULL after populating existing rows
    await queryRunner.changeColumn(
      'customers',
      'code',
      new TableColumn({
        name: 'code',
        type: 'varchar',
        length: '50',
        isNullable: false,
      }),
    );

    // Add unique index on code
    await queryRunner.createIndex(
      'customers',
      new TableIndex({
        name: 'IDX_customers_code',
        columnNames: ['code'],
        isUnique: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('customers', 'IDX_customers_code');
    await queryRunner.dropColumn('customers', 'notes');
    await queryRunner.dropColumn('customers', 'code');
  }
}
