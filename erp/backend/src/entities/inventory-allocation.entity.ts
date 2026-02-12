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
import { Customer } from './customer.entity';
import { OwnerType } from './inventory-transaction.entity';

export enum AllocationStatus {
  ACTIVE = 'ACTIVE',           // Reserved, still in stock
  PICKED = 'PICKED',           // Picked from stock, staged for kitting
  ISSUED = 'ISSUED',           // Issued to production floor
  FLOOR_STOCK = 'FLOOR_STOCK', // On floor between jobs (not tied to specific order)
  CONSUMED = 'CONSUMED',       // Materials used in production
  RETURNED = 'RETURNED',       // Returned to warehouse after job completion
  CANCELLED = 'CANCELLED',     // Reservation cancelled
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

  // ============ Ownership Dimension ============

  @Column({
    type: 'enum',
    enum: OwnerType,
    default: OwnerType.COMPANY,
  })
  owner_type: OwnerType;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  owner_id: string | null; // customer_id when owner_type=CUSTOMER, NULL when owner_type=COMPANY

  @ManyToOne(() => Customer)
  @JoinColumn({ name: 'owner_id' })
  owner: Customer | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @VersionColumn()
  version: number;
}
