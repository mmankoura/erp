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
import { PurchaseOrder } from './purchase-order.entity';
import { Customer } from './customer.entity';
import { Supplier } from './supplier.entity';

export enum ReceivingSessionStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
  CANCELLED = 'CANCELLED',
}

export enum ReceiptType {
  PO = 'PO',
  CUSTOMER_SUPPLIED = 'CUSTOMER_SUPPLIED',
  TRANSFER = 'TRANSFER',
  RMA = 'RMA',
}

@Entity('receiving_sessions')
export class ReceivingSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 50 })
  session_number: string;

  @Column({
    type: 'enum',
    enum: ReceiptType,
    default: ReceiptType.PO,
  })
  receipt_type: ReceiptType;

  @Column({ type: 'uuid', nullable: true })
  po_id: string | null;

  @ManyToOne(() => PurchaseOrder, { nullable: true })
  @JoinColumn({ name: 'po_id' })
  purchase_order: PurchaseOrder | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  packing_slip_number: string | null;

  @Column({ type: 'uuid', nullable: true })
  customer_id: string | null;

  @ManyToOne(() => Customer, { nullable: true })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer | null;

  @Column({ type: 'uuid', nullable: true })
  supplier_id: string | null;

  @ManyToOne(() => Supplier, { nullable: true })
  @JoinColumn({ name: 'supplier_id' })
  supplier: Supplier | null;

  @Column({ type: 'boolean', default: true })
  auto_release_on_pass: boolean;

  @Column({ type: 'integer', default: 0 })
  next_line_number: number;

  @Index()
  @Column({
    type: 'enum',
    enum: ReceivingSessionStatus,
    default: ReceivingSessionStatus.OPEN,
  })
  status: ReceivingSessionStatus;

  @Column({ type: 'varchar', length: 100 })
  started_by: string;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  started_at: Date;

  @Column({ type: 'timestamptz', nullable: true })
  closed_at: Date | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
