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
import { Material } from './material.entity';
import { Supplier } from './supplier.entity';
import { OwnerType } from './inventory-transaction.entity';

export enum PackageType {
  TR = 'TR',
  REEL = 'REEL',
  TUBE = 'TUBE',
  TRAY = 'TRAY',
  BAG = 'BAG',
  BOX = 'BOX',
  BULK = 'BULK',
  OTHER = 'OTHER',
}

export enum LotStatus {
  ACTIVE = 'ACTIVE',
  CONSUMED = 'CONSUMED',
  EXPIRED = 'EXPIRED',
  ON_HOLD = 'ON_HOLD',
  REJECTED = 'REJECTED',
  SCRAPPED = 'SCRAPPED',
  RTV = 'RTV',
  // Reel handed back to the customer — removed from our inventory entirely.
  RETURNED_TO_CLIENT = 'RETURNED_TO_CLIENT',
}

@Entity('inventory_lots')
export class InventoryLot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 100 })
  uid: string;

  @Index()
  @Column({ type: 'uuid' })
  material_id: string;

  @ManyToOne(() => Material)
  @JoinColumn({ name: 'material_id' })
  material: Material;

  @Column({ type: 'decimal', precision: 12, scale: 4, default: 0 })
  quantity: number;

  @Column({ type: 'decimal', precision: 12, scale: 4 })
  initial_quantity: number;

  @Column({
    type: 'enum',
    enum: PackageType,
    default: PackageType.TR,
  })
  package_type: PackageType;

  @Index()
  @Column({ type: 'varchar', length: 100, nullable: true })
  po_reference: string | null;

  @Column({ type: 'uuid', nullable: true })
  supplier_id: string | null;

  @ManyToOne(() => Supplier, { nullable: true })
  @JoinColumn({ name: 'supplier_id' })
  supplier: Supplier | null;

  @Column({ type: 'decimal', precision: 12, scale: 4, nullable: true })
  unit_cost: number | null;

  @Column({ type: 'timestamp', nullable: true })
  received_date: Date | null;

  @Column({ type: 'date', nullable: true })
  expiration_date: Date | null;

  @Column({
    type: 'enum',
    enum: LotStatus,
    default: LotStatus.ACTIVE,
  })
  status: LotStatus;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  disposition: string | null;

  @Column({ type: 'varchar', length: 50, default: 'RECEIVING' })
  location: string;

  @Index()
  @Column({ type: 'varchar', length: 50, nullable: true })
  bin: string | null;

  @Column({
    type: 'enum',
    enum: OwnerType,
    default: OwnerType.COMPANY,
  })
  owner_type: OwnerType;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  owner_id: string | null;

  @Column({ type: 'uuid', nullable: true })
  receiving_session_line_id: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
