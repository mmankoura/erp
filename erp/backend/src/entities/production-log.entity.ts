import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Order } from './order.entity';

/**
 * Production stages that units can move through
 */
export enum ProductionStage {
  NOT_STARTED = 'NOT_STARTED',
  KITTING = 'KITTING',
  SMT = 'SMT',
  TH = 'TH',
  COMPLETED = 'COMPLETED',
  SHIPPED = 'SHIPPED',
}

/**
 * Tracks production stage transitions for orders.
 * Each log entry records movement of units from one stage to another.
 */
@Entity('production_logs')
export class ProductionLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  order_id: string;

  @ManyToOne(() => Order)
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @Column({ type: 'varchar', length: 50, nullable: true })
  from_stage: string | null;

  @Column({ type: 'varchar', length: 50 })
  to_stage: string;

  @Column({ type: 'int' })
  quantity: number;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  created_by: string | null;

  @Index()
  @CreateDateColumn()
  created_at: Date;
}
