import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';

export enum ConsumableOrderStatus {
  ORDERED = 'ORDERED',
  RECEIVED = 'RECEIVED',
}

@Entity('consumable_orders')
export class ConsumableOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 50 })
  order_number: string;

  @Column({ type: 'varchar', length: 200 })
  supplier: string;

  @Column({
    type: 'enum',
    enum: ConsumableOrderStatus,
    default: ConsumableOrderStatus.ORDERED,
  })
  status: ConsumableOrderStatus;

  @Column({ type: 'date' })
  order_date: Date;

  @Column({ type: 'date', nullable: true })
  expected_date: Date | null;

  @Column({ type: 'varchar', length: 3, default: 'CAD' })
  currency: string;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  created_by: string | null;

  @OneToMany(() => ConsumableOrderLine, (line) => line.consumable_order, { cascade: true })
  lines: ConsumableOrderLine[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

@Entity('consumable_order_lines')
export class ConsumableOrderLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  consumable_order_id: string;

  @ManyToOne(() => ConsumableOrder, (order) => order.lines)
  @JoinColumn({ name: 'consumable_order_id' })
  consumable_order: ConsumableOrder;

  @Column({ type: 'varchar', length: 100, nullable: true })
  ata_part_number: string | null;

  @Column({ type: 'varchar', length: 200 })
  description: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  manufacturer: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  manufacturer_pn: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 4, default: 1 })
  quantity: number;

  @Column({ type: 'decimal', precision: 12, scale: 4, nullable: true })
  unit_cost: number | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  customer: string | null;

  @Column({ type: 'integer', nullable: true })
  line_number: number | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn()
  created_at: Date;
}
