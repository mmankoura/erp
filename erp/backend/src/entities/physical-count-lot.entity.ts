import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { PhysicalCount } from './physical-count.entity';
import { InventoryLot } from './inventory-lot.entity';
import { Material } from './material.entity';

@Entity('physical_count_lots')
@Unique(['physical_count_id', 'lot_id'])
export class PhysicalCountLot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  physical_count_id: string;

  @ManyToOne(() => PhysicalCount, (pc: PhysicalCount) => pc.snapshot_lots, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'physical_count_id' })
  physical_count: PhysicalCount;

  @Column({ type: 'uuid' })
  lot_id: string;

  @ManyToOne(() => InventoryLot)
  @JoinColumn({ name: 'lot_id' })
  lot: InventoryLot;

  @Index()
  @Column({ type: 'uuid' })
  material_id: string;

  @ManyToOne(() => Material)
  @JoinColumn({ name: 'material_id' })
  material: Material;

  @Column({ type: 'uuid' })
  customer_id: string;

  @Column({ type: 'decimal', precision: 12, scale: 4 })
  expected_qty: number;

  @Column({ type: 'decimal', precision: 12, scale: 4, nullable: true })
  unit_cost: number | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  bin_at_snapshot: string | null;

  @CreateDateColumn()
  created_at: Date;
}
