import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
} from 'typeorm';

export enum CostingMethod {
  FIFO = 'FIFO',
  WEIGHTED_AVG = 'WEIGHTED_AVG',
  STANDARD = 'STANDARD',
  SPECIFIC = 'SPECIFIC', // Lot-level costing
}

@Entity('materials')
export class Material {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column()
  internal_part_number: string;

  @Column({ nullable: true })
  description: string;

  @Column({ nullable: true })
  value: string;

  @Column({ nullable: true })
  package: string;

  @Column({ nullable: true })
  manufacturer: string;

  @Column({ nullable: true })
  manufacturer_part_number: string;

  @Column({ default: 'pcs' })
  unit: string;

  // ============ Costing Support (Phase: Future) ============

  @Column({
    type: 'enum',
    enum: CostingMethod,
    default: CostingMethod.WEIGHTED_AVG,
  })
  costing_method: CostingMethod;

  @Column({ type: 'decimal', precision: 12, scale: 4, nullable: true })
  standard_cost: number | null; // Used when costing_method = STANDARD

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @DeleteDateColumn()
  deleted_at: Date | null;
}
