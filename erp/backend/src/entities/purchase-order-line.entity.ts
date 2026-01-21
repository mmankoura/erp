import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { PurchaseOrder } from './purchase-order.entity';
import { Material } from './material.entity';

@Entity('purchase_order_lines')
@Unique(['purchase_order_id', 'line_number'])
export class PurchaseOrderLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  purchase_order_id: string;

  @ManyToOne(() => PurchaseOrder, (po) => po.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'purchase_order_id' })
  purchase_order: PurchaseOrder;

  @Index()
  @Column({ type: 'uuid' })
  material_id: string;

  @ManyToOne(() => Material)
  @JoinColumn({ name: 'material_id' })
  material: Material;

  @Column({ type: 'integer' })
  line_number: number;

  @Column({ type: 'decimal', precision: 12, scale: 4 })
  quantity_ordered: number;

  @Column({ type: 'decimal', precision: 12, scale: 4, default: 0 })
  quantity_received: number;

  @Column({ type: 'decimal', precision: 12, scale: 4, nullable: true })
  unit_cost: number | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  // Computed property: quantity still on order
  get quantity_on_order(): number {
    return (
      parseFloat(String(this.quantity_ordered)) -
      parseFloat(String(this.quantity_received))
    );
  }

  // Computed property: is line fully received
  get is_fully_received(): boolean {
    return this.quantity_on_order <= 0;
  }
}
