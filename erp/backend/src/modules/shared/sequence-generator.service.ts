import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

@Injectable()
export class SequenceGeneratorService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Generate the next sequence number for a given prefix using SELECT FOR UPDATE.
   * This prevents race conditions in concurrent requests.
   *
   * @param prefix - e.g., "INS-20260316", "PO-202603", "ORD-20260316-"
   * @param table - the table to query for existing sequences
   * @param column - the column containing the sequence number
   * @param padLength - zero-pad length for the sequence portion (default 4)
   * @param manager - optional EntityManager for running inside an existing transaction
   */
  async next(
    prefix: string,
    table: string,
    column: string,
    padLength = 4,
    manager?: EntityManager,
  ): Promise<string> {
    const runner = manager ?? this.dataSource;

    // Use advisory lock based on hash of prefix to prevent concurrent generation
    const lockKey = this.hashCode(prefix);

    const result = await runner.query(
      `SELECT pg_advisory_xact_lock($1)`,
      [lockKey],
    );

    const rows = await runner.query(
      `SELECT "${column}" FROM "${table}"
       WHERE "${column}" LIKE $1
       ORDER BY "${column}" DESC
       LIMIT 1`,
      [`${prefix}%`],
    );

    let sequence = 1;
    if (rows.length > 0) {
      const lastValue: string = rows[0][column];
      const suffix = lastValue.slice(prefix.length);
      const parsed = parseInt(suffix, 10);
      if (!isNaN(parsed)) {
        sequence = parsed + 1;
      }
    }

    return `${prefix}${String(sequence).padStart(padLength, '0')}`;
  }

  private hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }
}
