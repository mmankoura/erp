import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Index,
  Unique,
} from 'typeorm';
import { KittingList } from './kitting-list.entity';
import { Material } from './material.entity';
import { KittingListScan } from './kitting-list-scan.entity';
import { ResourceType } from './bom-item.entity';

@Entity('kitting_list_items')
@Unique(['kitting_list_id', 'material_id'])
export class KittingListItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  kitting_list_id: string;

  @ManyToOne(() => KittingList, (kl) => kl.items)
  @JoinColumn({ name: 'kitting_list_id' })
  kitting_list: KittingList;

  @Index()
  @Column({ type: 'uuid' })
  material_id: string;

  @ManyToOne(() => Material)
  @JoinColumn({ name: 'material_id' })
  material: Material;

  @Column({
    type: 'enum',
    enum: ResourceType,
    nullable: true,
  })
  resource_type: ResourceType | null;

  @Column({ type: 'decimal', precision: 12, scale: 4 })
  total_qty_required: number;

  @Column({ type: 'decimal', precision: 12, scale: 4, default: 0 })
  qty_verified: number;

  @Column({ type: 'boolean', default: false })
  is_short: boolean;

  @Column({ type: 'decimal', precision: 12, scale: 4, default: 0 })
  shortage_qty: number;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @OneToMany(() => KittingListScan, (scan) => scan.kitting_list_item, { cascade: true })
  scans: KittingListScan[];
}
