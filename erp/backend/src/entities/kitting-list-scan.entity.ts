import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { KittingListItem } from './kitting-list-item.entity';
import { InventoryLot } from './inventory-lot.entity';

@Entity('kitting_list_scans')
export class KittingListScan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  kitting_list_item_id: string;

  @ManyToOne(() => KittingListItem, (kli) => kli.scans)
  @JoinColumn({ name: 'kitting_list_item_id' })
  kitting_list_item: KittingListItem;

  @Index()
  @Column({ type: 'uuid' })
  uid_id: string;

  @ManyToOne(() => InventoryLot)
  @JoinColumn({ name: 'uid_id' })
  uid: InventoryLot;

  @Column({ type: 'varchar', length: 100 })
  uid_code: string;

  @Column({ type: 'decimal', precision: 12, scale: 4 })
  quantity: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  scanned_by: string | null;

  @CreateDateColumn()
  created_at: Date;
}
