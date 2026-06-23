import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { PhysicalCount } from './physical-count.entity';
import { InventoryLot } from './inventory-lot.entity';

export enum PhysicalCountScanResolution {
  FIRST = 'FIRST',
  SUMMED = 'SUMMED',
  REPLACED = 'REPLACED',
  REJECTED = 'REJECTED',
}

@Entity('physical_count_scans')
@Index(['physical_count_id', 'uid'])
export class PhysicalCountScan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  physical_count_id: string;

  @ManyToOne(() => PhysicalCount, (pc: PhysicalCount) => pc.scans, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'physical_count_id' })
  physical_count: PhysicalCount;

  @Index()
  @Column({ type: 'varchar', length: 100 })
  uid: string;

  @Column({ type: 'decimal', precision: 12, scale: 4 })
  scanned_qty: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  scanned_by: string | null;

  @CreateDateColumn()
  scanned_at: Date;

  @Column({ type: 'uuid', nullable: true })
  matched_lot_id: string | null;

  @ManyToOne(() => InventoryLot, { nullable: true })
  @JoinColumn({ name: 'matched_lot_id' })
  matched_lot: InventoryLot | null;

  @Column({
    type: 'enum',
    enum: PhysicalCountScanResolution,
    default: PhysicalCountScanResolution.FIRST,
  })
  resolution: PhysicalCountScanResolution;

  @Column({ type: 'uuid', nullable: true })
  superseded_by_scan_id: string | null;
}
