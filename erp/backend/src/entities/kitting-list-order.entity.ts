import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { KittingList } from './kitting-list.entity';
import { Order } from './order.entity';

@Entity('kitting_list_orders')
@Unique(['kitting_list_id', 'order_id'])
export class KittingListOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  kitting_list_id: string;

  @ManyToOne(() => KittingList, (kl) => kl.orders)
  @JoinColumn({ name: 'kitting_list_id' })
  kitting_list: KittingList;

  @Index()
  @Column({ type: 'uuid' })
  order_id: string;

  @ManyToOne(() => Order)
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @Column({ type: 'integer' })
  order_quantity: number;
}
