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
import { Order } from './order.entity';
import { Material } from './material.entity';

export enum SupplySource {
  COMPANY = 'COMPANY',
  CUSTOMER = 'CUSTOMER',
}

@Entity('order_material_sources')
@Unique(['order_id', 'material_id'])
export class OrderMaterialSource {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  order_id: string;

  @ManyToOne(() => Order)
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @Column({ type: 'uuid' })
  material_id: string;

  @ManyToOne(() => Material)
  @JoinColumn({ name: 'material_id' })
  material: Material;

  @Column({
    type: 'enum',
    enum: SupplySource,
  })
  supply_source: SupplySource;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
