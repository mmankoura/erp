import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { PhysicalCount } from './physical-count.entity';
import { InventoryLot } from './inventory-lot.entity';
import { Material } from './material.entity';
import { InventoryTransaction } from './inventory-transaction.entity';

export enum PhysicalCountDiscrepancyType {
  SHORTAGE = 'SHORTAGE',
  OVERAGE = 'OVERAGE',
  NOT_SCANNED = 'NOT_SCANNED',
  ORPHAN = 'ORPHAN',
}

export enum PhysicalCountResolutionAction {
  ADJUST_TO_SCAN = 'ADJUST_TO_SCAN',
  ACCEPT_WITH_NOTE = 'ACCEPT_WITH_NOTE',
  RECOUNT = 'RECOUNT',
  SCRAP_MISSING = 'SCRAP_MISSING',
}

@Entity('physical_count_discrepancies')
@Index(['physical_count_id', 'type'])
export class PhysicalCountDiscrepancy {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  physical_count_id: string;

  @ManyToOne(() => PhysicalCount, (pc: PhysicalCount) => pc.discrepancies, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'physical_count_id' })
  physical_count: PhysicalCount;

  @Column({
    type: 'enum',
    enum: PhysicalCountDiscrepancyType,
  })
  type: PhysicalCountDiscrepancyType;

  @Column({ type: 'uuid', nullable: true })
  lot_id: string | null;

  @ManyToOne(() => InventoryLot, { nullable: true })
  @JoinColumn({ name: 'lot_id' })
  lot: InventoryLot | null;

  @Column({ type: 'uuid', nullable: true })
  material_id: string | null;

  @ManyToOne(() => Material, { nullable: true })
  @JoinColumn({ name: 'material_id' })
  material: Material | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  uid: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 4, nullable: true })
  expected_qty: number | null;

  @Column({ type: 'decimal', precision: 12, scale: 4, nullable: true })
  scanned_qty: number | null;

  @Column({ type: 'decimal', precision: 12, scale: 4 })
  variance: number;

  @Column({ type: 'decimal', precision: 14, scale: 4, nullable: true })
  variance_value: number | null;

  @Column({
    type: 'enum',
    enum: PhysicalCountResolutionAction,
    nullable: true,
  })
  resolution_action: PhysicalCountResolutionAction | null;

  @Column({ type: 'text', nullable: true })
  resolution_note: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  resolved_by: string | null;

  @Column({ type: 'timestamp', nullable: true })
  resolved_at: Date | null;

  @Column({ type: 'uuid', nullable: true })
  adjustment_transaction_id: string | null;

  @ManyToOne(() => InventoryTransaction, { nullable: true })
  @JoinColumn({ name: 'adjustment_transaction_id' })
  adjustment_transaction: InventoryTransaction | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
