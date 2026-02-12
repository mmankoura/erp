import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Customer } from './customer.entity';
import { Product } from './product.entity';
import { BomRevision } from './bom-revision.entity';

export enum OrderType {
  TURNKEY = 'TURNKEY',
  CONSIGNMENT = 'CONSIGNMENT',
}

export enum OrderStatus {
  ENTERED = 'ENTERED',
  KITTING = 'KITTING',
  SMT = 'SMT',
  TH = 'TH',
  SHIPPED = 'SHIPPED',
  ON_HOLD = 'ON_HOLD',
  CANCELLED = 'CANCELLED',
}

export enum OrderProductionType {
  SMT_ONLY = 'SMT_ONLY',
  TH_ONLY = 'TH_ONLY',
  SMT_AND_TH = 'SMT_AND_TH',
}

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar' })
  order_number: string;

  @Column({ type: 'varchar', nullable: true })
  po_number: string | null;

  @Column({ type: 'varchar', nullable: true })
  wo_number: string | null;

  @Column({ type: 'uuid' })
  @Index()
  customer_id: string;

  @ManyToOne(() => Customer)
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @Column({ type: 'uuid' })
  @Index()
  product_id: string;

  @ManyToOne(() => Product)
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column({ type: 'uuid' })
  @Index()
  bom_revision_id: string;

  @ManyToOne(() => BomRevision)
  @JoinColumn({ name: 'bom_revision_id' })
  bom_revision: BomRevision;

  @Column({ type: 'integer' })
  quantity: number;

  @Column({ type: 'integer', default: 0 })
  quantity_shipped: number;

  @Column({ type: 'date' })
  due_date: Date;

  @Column({
    type: 'enum',
    enum: OrderType,
    default: OrderType.TURNKEY,
  })
  order_type: OrderType;

  @Column({
    type: 'enum',
    enum: OrderStatus,
    default: OrderStatus.ENTERED,
  })
  status: OrderStatus;

  @Column({
    type: 'enum',
    enum: OrderStatus,
    nullable: true,
  })
  previous_status: OrderStatus | null;

  @Column({
    type: 'enum',
    enum: OrderProductionType,
    nullable: true,
  })
  production_type: OrderProductionType | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  // ============ Pricing Support (Phase: Future) ============

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  quoted_price: number | null; // Total quoted price for margin calculation

  @Column({ type: 'varchar', length: 3, default: 'USD' })
  currency: string; // ISO 4217 currency code

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @DeleteDateColumn()
  deleted_at: Date | null;

  // Computed property for balance
  get balance(): number {
    return this.quantity - this.quantity_shipped;
  }
}
