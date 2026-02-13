import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { CycleCount } from './cycle-count.entity';
import { Material } from './material.entity';
import { InventoryLot } from './inventory-lot.entity';

export enum CycleCountItemStatus {
  PENDING = 'PENDING',       // Awaiting count
  COUNTED = 'COUNTED',       // Count entered
  RECOUNTED = 'RECOUNTED',   // Re-counted due to variance
  APPROVED = 'APPROVED',     // Approved, ready for adjustment
  ADJUSTED = 'ADJUSTED',     // Adjustment transaction created
  SKIPPED = 'SKIPPED',       // Skipped (material not found, etc.)
}

@Entity('cycle_count_items')
export class CycleCountItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  cycle_count_id: string;

  @ManyToOne(() => CycleCount, (count) => count.items)
  @JoinColumn({ name: 'cycle_count_id' })
  cycle_count: CycleCount;

  @Index()
  @Column({ type: 'uuid' })
  material_id: string;

  @ManyToOne(() => Material)
  @JoinColumn({ name: 'material_id' })
  material: Material;

  // Optional: count at lot level for more granular tracking
  @Index()
  @Column({ type: 'uuid', nullable: true })
  lot_id: string | null;

  @ManyToOne(() => InventoryLot, { nullable: true })
  @JoinColumn({ name: 'lot_id' })
  lot: InventoryLot | null;

  @Column({
    type: 'enum',
    enum: CycleCountItemStatus,
    default: CycleCountItemStatus.PENDING,
  })
  status: CycleCountItemStatus;

  // System quantity captured when count started
  @Column({ type: 'decimal', precision: 12, scale: 4 })
  system_quantity: number;

  // Actual counted quantity (null until counted)
  @Column({ type: 'decimal', precision: 12, scale: 4, nullable: true })
  counted_quantity: number | null;

  // Variance = counted - system (calculated after count)
  @Column({ type: 'decimal', precision: 12, scale: 4, nullable: true })
  variance: number | null;

  // Variance percentage for easy filtering
  @Column({ type: 'decimal', precision: 8, scale: 4, nullable: true })
  variance_percent: number | null;

  // Variance in value (variance * unit cost)
  @Column({ type: 'decimal', precision: 12, scale: 4, nullable: true })
  variance_value: number | null;

  // Unit cost at time of count (for variance value calculation)
  @Column({ type: 'decimal', precision: 12, scale: 4, nullable: true })
  unit_cost: number | null;

  // Recount tracking
  @Column({ type: 'int', default: 0 })
  recount_number: number;

  @Column({ type: 'decimal', precision: 12, scale: 4, nullable: true })
  previous_counted_quantity: number | null;

  // Audit fields
  @Column({ type: 'varchar', length: 100, nullable: true })
  counted_by: string | null;

  @Column({ type: 'timestamp', nullable: true })
  counted_at: Date | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  approved_by: string | null;

  @Column({ type: 'timestamp', nullable: true })
  approved_at: Date | null;

  // Reference to adjustment transaction created
  @Column({ type: 'uuid', nullable: true })
  adjustment_transaction_id: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
