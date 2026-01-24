import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Material } from './material.entity';
import { Customer } from './customer.entity';

export enum TransactionType {
  ADJUSTMENT = 'ADJUSTMENT',
  RECEIPT = 'RECEIPT',
  CONSUMPTION = 'CONSUMPTION',
  RETURN = 'RETURN',
  SCRAP = 'SCRAP',
  // Phase 2+ transaction types (added to DB enum, ready for use)
  MOVE = 'MOVE',
  ISSUE_TO_WO = 'ISSUE_TO_WO',
  RETURN_FROM_WO = 'RETURN_FROM_WO',
  SHIPMENT = 'SHIPMENT',
}

export enum InventoryBucket {
  RAW = 'RAW',           // Raw materials in stock
  WIP = 'WIP',           // Work in progress (on production floor)
  FG = 'FG',             // Finished goods
  IN_TRANSIT = 'IN_TRANSIT', // In transit between locations
}

export enum ReferenceType {
  MANUAL = 'MANUAL',
  WORK_ORDER = 'WORK_ORDER',
  PO_RECEIPT = 'PO_RECEIPT',
  CYCLE_COUNT = 'CYCLE_COUNT',
  INITIAL_STOCK = 'INITIAL_STOCK',
}

export enum OwnerType {
  COMPANY = 'COMPANY',   // Materials owned by us (purchased, turnkey jobs)
  CUSTOMER = 'CUSTOMER', // Consignment materials owned by customer
}

@Entity('inventory_transactions')
export class InventoryTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  material_id: string;

  @ManyToOne(() => Material)
  @JoinColumn({ name: 'material_id' })
  material: Material;

  @Column({
    type: 'enum',
    enum: TransactionType,
  })
  transaction_type: TransactionType;

  @Column({ type: 'decimal', precision: 12, scale: 4 })
  quantity: number;

  @Column({
    type: 'enum',
    enum: ReferenceType,
    default: ReferenceType.MANUAL,
  })
  reference_type: ReferenceType;

  @Column({ type: 'uuid', nullable: true })
  reference_id: string | null;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ type: 'varchar', nullable: true })
  created_by: string | null;

  // ============ Phase 1 Inventory Dimensions (nullable for backward compatibility) ============

  @Index()
  @Column({ type: 'uuid', nullable: true })
  location_id: string | null; // Phase 2: FK to locations table

  @Index()
  @Column({ type: 'uuid', nullable: true })
  lot_id: string | null; // Phase 2: FK to material_lots table

  @Column({
    type: 'enum',
    enum: InventoryBucket,
    default: InventoryBucket.RAW,
  })
  bucket: InventoryBucket;

  // ============ Costing Support (Phase: Future) ============

  @Index()
  @Column({ type: 'decimal', precision: 12, scale: 4, nullable: true })
  unit_cost: number | null; // Cost per unit at time of transaction (capture on RECEIPT)

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

  @Index()
  @CreateDateColumn()
  created_at: Date;
}
