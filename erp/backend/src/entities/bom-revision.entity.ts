import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { Product } from './product.entity';
import { BomItem } from './bom-item.entity';

export enum BomSource {
  MANUAL = 'MANUAL',
  IMPORT_CLIENT = 'IMPORT_CLIENT',
  IMPORT_INTERNAL = 'IMPORT_INTERNAL',
}

@Entity('bom_revisions')
@Unique(['product_id', 'revision_number'])
export class BomRevision {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  product_id: string;

  @ManyToOne(() => Product)
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column({ type: 'varchar' })
  revision_number: string;

  @Column({ type: 'date' })
  revision_date: Date;

  @Column({ type: 'text', nullable: true })
  change_summary: string | null;

  @Column({
    type: 'enum',
    enum: BomSource,
    default: BomSource.MANUAL,
  })
  source: BomSource;

  @Column({ type: 'varchar', nullable: true })
  source_filename: string | null;

  @Column({ type: 'boolean', default: false })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @OneToMany(() => BomItem, (item) => item.bom_revision)
  items: BomItem[];
}
