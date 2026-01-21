import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Material } from './material.entity';
import { Supplier } from './supplier.entity';

export enum AMLStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  SUSPENDED = 'SUSPENDED',
  OBSOLETE = 'OBSOLETE',
}

@Entity('approved_manufacturers')
@Index(['material_id', 'manufacturer', 'manufacturer_part_number'], {
  unique: true,
  where: 'deleted_at IS NULL',
})
export class ApprovedManufacturer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  material_id: string;

  @ManyToOne(() => Material)
  @JoinColumn({ name: 'material_id' })
  material: Material;

  @Index()
  @Column({ type: 'varchar', length: 100 })
  manufacturer: string;

  @Index()
  @Column({ type: 'varchar', length: 100 })
  manufacturer_part_number: string;

  @Column({
    type: 'enum',
    enum: AMLStatus,
    default: AMLStatus.PENDING,
  })
  status: AMLStatus;

  @Column({ type: 'uuid', nullable: true })
  preferred_supplier_id: string | null;

  @ManyToOne(() => Supplier)
  @JoinColumn({ name: 'preferred_supplier_id' })
  preferred_supplier: Supplier | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  approved_by: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  approved_at: Date | null;

  @Column({ type: 'integer', default: 0 })
  priority: number; // Lower = preferred

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  created_by: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  @DeleteDateColumn({ type: 'timestamptz' })
  deleted_at: Date | null;
}
