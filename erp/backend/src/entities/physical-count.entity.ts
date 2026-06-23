import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { Customer } from './customer.entity';

export enum PhysicalCountStatus {
  PLANNED = 'PLANNED',
  IN_PROGRESS = 'IN_PROGRESS',
  PENDING_REVIEW = 'PENDING_REVIEW',
  APPROVED = 'APPROVED',
  CANCELLED = 'CANCELLED',
}

@Entity('physical_counts')
export class PhysicalCount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 50 })
  count_number: string;

  @Column({
    type: 'enum',
    enum: PhysicalCountStatus,
    default: PhysicalCountStatus.PLANNED,
  })
  status: PhysicalCountStatus;

  @Index()
  @Column({ type: 'uuid' })
  customer_id: string;

  @ManyToOne(() => Customer)
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @Column({ type: 'varchar', length: 50, nullable: true })
  bin_filter: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  category_filter: string | null;

  @Column({ type: 'uuid', nullable: true })
  parent_count_id: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  created_by: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  counted_by: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  approved_by: string | null;

  @Column({ type: 'timestamp', nullable: true })
  started_at: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  completed_at: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  approved_at: Date | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'int', default: 0 })
  total_expected_lots: number;

  @Column({ type: 'int', default: 0 })
  total_scans: number;

  @Column({ type: 'int', default: 0 })
  shortage_count: number;

  @Column({ type: 'int', default: 0 })
  overage_count: number;

  @Column({ type: 'int', default: 0 })
  not_scanned_count: number;

  @Column({ type: 'int', default: 0 })
  orphan_count: number;

  @Column({ type: 'decimal', precision: 14, scale: 4, default: 0 })
  total_variance_value: number;

  @OneToMany('PhysicalCountLot', 'physical_count')
  snapshot_lots: unknown[];

  @OneToMany('PhysicalCountScan', 'physical_count')
  scans: unknown[];

  @OneToMany('PhysicalCountDiscrepancy', 'physical_count')
  discrepancies: unknown[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
