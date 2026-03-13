import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { KittingListOrder } from './kitting-list-order.entity';
import { KittingListItem } from './kitting-list-item.entity';

export enum KittingListStatus {
  DRAFT = 'DRAFT',
  PRINTED = 'PRINTED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

@Entity('kitting_lists')
export class KittingList {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 50 })
  list_number: string;

  @Column({
    type: 'enum',
    enum: KittingListStatus,
    default: KittingListStatus.DRAFT,
  })
  status: KittingListStatus;

  @Column({ type: 'varchar', length: 100, nullable: true })
  created_by: string | null;

  @Column({ type: 'timestamp', nullable: true })
  printed_at: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  completed_at: Date | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @OneToMany(() => KittingListOrder, (klo) => klo.kitting_list, { cascade: true })
  orders: KittingListOrder[];

  @OneToMany(() => KittingListItem, (kli) => kli.kitting_list, { cascade: true })
  items: KittingListItem[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
