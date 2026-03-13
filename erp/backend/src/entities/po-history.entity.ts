import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('po_history')
export class PoHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 50 })
  po_number: string;

  @Column({ type: 'date', nullable: true })
  order_date: Date | null;

  @Index()
  @Column({ type: 'varchar', length: 200, nullable: true })
  supplier: string | null;

  @Index()
  @Column({ type: 'varchar', length: 100, nullable: true })
  ipn: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  manufacturer: string | null;

  @Index()
  @Column({ type: 'varchar', length: 200, nullable: true })
  mpn: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 4, nullable: true })
  quantity: number | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  mounting_type: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  packaging: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  customer: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 6, nullable: true })
  unit_price: number | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  currency: string | null;

  @Column({ type: 'text', nullable: true })
  comments: string | null;

  @CreateDateColumn()
  created_at: Date;
}
