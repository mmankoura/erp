import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

const UID_PREFIX = 'UID';

@Injectable()
export class UidGeneratorService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Generate a UID using atomic sequence counter.
   * Format: UID-YYYYMMDD-XXXX (4-digit daily sequence)
   * Uses INSERT ... ON CONFLICT DO UPDATE for concurrency safety.
   *
   * @param manager - If provided, runs inside an existing transaction
   */
  async generate(manager?: EntityManager): Promise<string> {
    const runner = manager || this.dataSource;
    const today = new Date();
    const datePrefix =
      today.getFullYear().toString() +
      (today.getMonth() + 1).toString().padStart(2, '0') +
      today.getDate().toString().padStart(2, '0');

    // Use INSERT ON CONFLICT to upsert, then SELECT to get the value
    // (separate queries to avoid RETURNING format issues across TypeORM versions)
    await runner.query(
      `INSERT INTO "uid_sequences" ("date_prefix", "last_value")
       VALUES ($1, 1)
       ON CONFLICT ("date_prefix")
       DO UPDATE SET "last_value" = "uid_sequences"."last_value" + 1`,
      [datePrefix],
    );
    const result = await runner.query(
      `SELECT "last_value" FROM "uid_sequences" WHERE "date_prefix" = $1`,
      [datePrefix],
    );

    const seq = result[0].last_value;
    return `${UID_PREFIX}-${datePrefix}-${seq.toString().padStart(4, '0')}`;
  }
}
