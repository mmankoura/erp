import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { PackageType } from './inventory-lot.entity';

/**
 * Manually keyed warehouse stock.
 *
 * Deliberately standalone: no foreign keys to materials, lots or POs, and
 * nothing here feeds inventory balances or transactions. It is a scratch
 * ledger of what is physically on the shelf, typed in by hand.
 */
@Entity('manual_stock_entries')
export class ManualStockEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 100, nullable: true })
  uid: string | null;

  @Index()
  @Column({ type: 'varchar', length: 100 })
  ipn: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  mpn: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  manufacturer: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 4 })
  quantity: number;

  // Stored as varchar, not a PG enum, so this table stays decoupled from the
  // inventory enums. Validated against PackageType at the DTO layer.
  @Column({ type: 'varchar', length: 20, default: PackageType.REEL })
  package_type: PackageType;

  @Column({ type: 'varchar', length: 100, nullable: true })
  location: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  date_code: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  lot_code: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  reference: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'varchar', length: 100 })
  entered_by: string;

  @Index()
  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  entered_at: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
