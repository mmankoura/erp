import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Customer } from './customer.entity';

export enum CostingMethod {
  FIFO = 'FIFO',
  WEIGHTED_AVG = 'WEIGHTED_AVG',
  STANDARD = 'STANDARD',
  SPECIFIC = 'SPECIFIC', // Lot-level costing
}

@Entity('materials')
export class Material {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column()
  internal_part_number: string;

  @Column({ nullable: true })
  description: string;

  @Column({ nullable: true })
  value: string;

  @Column({ nullable: true })
  package: string;

  @Column({ nullable: true })
  manufacturer: string;

  @Column({ nullable: true })
  manufacturer_pn: string;

  @Column({ nullable: true })
  category: string;

  @Column({ default: 'EA' })
  uom: string;

  // ============ Customer Ownership ============

  @Column({ type: 'uuid', nullable: true })
  customer_id: string | null;

  @ManyToOne(() => Customer, { nullable: true })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer | null;

  // ============ Costing Support (Phase: Future) ============

  @Column({
    type: 'enum',
    enum: CostingMethod,
    default: CostingMethod.WEIGHTED_AVG,
  })
  costing_method: CostingMethod;

  @Column({ type: 'decimal', precision: 12, scale: 4, nullable: true })
  standard_cost: number | null; // Used when costing_method = STANDARD

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @DeleteDateColumn()
  deleted_at: Date | null;
}
