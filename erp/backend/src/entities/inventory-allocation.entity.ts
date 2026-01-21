import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  VersionColumn,
} from 'typeorm';
import { Material } from './material.entity';
import { Order } from './order.entity';

export enum AllocationStatus {
  ACTIVE = 'ACTIVE',       // Reserved, still in stock
  PICKED = 'PICKED',       // Phase 3: Picked from stock, staged
  ISSUED = 'ISSUED',       // Phase 3: Issued to WIP / production
  CONSUMED = 'CONSUMED',   // Materials used
  CANCELLED = 'CANCELLED', // Reservation cancelled
}

@Entity('inventory_allocations')
@Index(['material_id', 'order_id'], { unique: true, where: '"status" = \'ACTIVE\'' })
export class InventoryAllocation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  material_id: string;

  @ManyToOne(() => Material)
  @JoinColumn({ name: 'material_id' })
  material: Material;

  @Index()
  @Column({ type: 'uuid' })
  order_id: string;

  @ManyToOne(() => Order)
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @Column({ type: 'decimal', precision: 12, scale: 4 })
  quantity: number;

  @Column({
    type: 'enum',
    enum: AllocationStatus,
    default: AllocationStatus.ACTIVE,
  })
  status: AllocationStatus;

  @Column({ type: 'varchar', nullable: true })
  created_by: string | null;

  // ============ Phase 1 Inventory Dimensions (nullable for backward compatibility) ============

  @Column({ type: 'uuid', nullable: true })
  location_id: string | null; // Phase 2: Reserve from specific location

  @Column({ type: 'uuid', nullable: true })
  lot_id: string | null; // Phase 2: Reserve specific lot/reel

  // ============ Audit/Compliance Support ============

  @Column({ type: 'text', nullable: true })
  reason: string | null; // Reason for allocation change (for audit trail)

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @VersionColumn()
  version: number;
}
