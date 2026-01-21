import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { BomRevision } from './bom-revision.entity';
import { Material } from './material.entity';

export enum ResourceType {
  SMT = 'SMT',
  TH = 'TH',
  MECH = 'MECH',
  PCB = 'PCB',
  DNP = 'DNP',
}

@Entity('bom_items')
export class BomItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  bom_revision_id: string;

  @ManyToOne(() => BomRevision, (revision) => revision.items)
  @JoinColumn({ name: 'bom_revision_id' })
  bom_revision: BomRevision;

  @Column({ type: 'uuid' })
  @Index()
  material_id: string;

  @ManyToOne(() => Material)
  @JoinColumn({ name: 'material_id' })
  material: Material;

  @Index()
  @Column({ type: 'varchar', nullable: true })
  bom_line_key: string | null;

  @Column({ type: 'integer', nullable: true })
  line_number: number | null;

  @Column({ type: 'text', nullable: true })
  reference_designators: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 4 })
  quantity_required: number;

  @Column({
    type: 'enum',
    enum: ResourceType,
    nullable: true,
  })
  resource_type: ResourceType | null;

  @Column({ type: 'boolean', default: false })
  polarized: boolean;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  scrap_factor: number;

  @Column({ type: 'text', nullable: true })
  notes: string | null;
}
