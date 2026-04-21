import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { BomItem } from './bom-item.entity';
import { Material } from './material.entity';

@Entity('bom_item_alternates')
export class BomItemAlternate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  bom_item_id: string;

  @ManyToOne(() => BomItem, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'bom_item_id' })
  bom_item: BomItem;

  @Column({ type: 'uuid' })
  material_id: string;

  @ManyToOne(() => Material)
  @JoinColumn({ name: 'material_id' })
  material: Material;

  @Column({ type: 'int', default: 1 })
  priority: number;

  @CreateDateColumn()
  created_at: Date;
}
