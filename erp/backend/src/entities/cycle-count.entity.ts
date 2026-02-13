import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { CycleCountItem } from './cycle-count-item.entity';

export enum CycleCountStatus {
  PLANNED = 'PLANNED',         // Scheduled but not started
  IN_PROGRESS = 'IN_PROGRESS', // Currently being counted
  PENDING_REVIEW = 'PENDING_REVIEW', // Counting done, awaiting approval
  APPROVED = 'APPROVED',       // Approved, adjustments made
  CANCELLED = 'CANCELLED',     // Cancelled
}

export enum CycleCountType {
  FULL = 'FULL',         // Count all materials
  PARTIAL = 'PARTIAL',   // Count selected materials
  ABC = 'ABC',           // ABC classification-based (A=monthly, B=quarterly, C=annual)
  LOCATION = 'LOCATION', // Count by location
}

@Entity('cycle_counts')
export class CycleCount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 50 })
  count_number: string;

  @Column({
    type: 'enum',
    enum: CycleCountStatus,
    default: CycleCountStatus.PLANNED,
  })
  status: CycleCountStatus;

  @Column({
    type: 'enum',
    enum: CycleCountType,
    default: CycleCountType.PARTIAL,
  })
  count_type: CycleCountType;

  @Column({ type: 'date' })
  scheduled_date: Date;

  @Column({ type: 'timestamp', nullable: true })
  started_at: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  completed_at: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  approved_at: Date | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  created_by: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  counted_by: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  approved_by: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  // Summary statistics (calculated on completion)
  @Column({ type: 'int', default: 0 })
  total_items: number;

  @Column({ type: 'int', default: 0 })
  items_counted: number;

  @Column({ type: 'int', default: 0 })
  items_with_variance: number;

  @Column({ type: 'decimal', precision: 12, scale: 4, default: 0 })
  total_variance_value: number;

  @OneToMany(() => CycleCountItem, (item) => item.cycle_count)
  items: CycleCountItem[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
