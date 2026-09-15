import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { MrpRun } from './mrp-run.entity';
import { Order } from './order.entity';
import { Product } from './product.entity';
import { BomRevision } from './bom-revision.entity';

export enum MrpDemandSource {
  /** An admitted real order. Follows the order for its BOM revision. */
  ORDER = 'ORDER',
  /** A hypothetical job that never becomes an order. */
  SCRATCH = 'SCRATCH',
}

/**
 * One admitted job — one column in the buyer's matrix.
 *
 * This mirrors row 4 of the reference spreadsheet, where typing a quantity into
 * an assembly's column is what puts that job into the plan. Demand is taken from
 * `quantity` here, not from `orders.quantity`, because buyers deliberately plan
 * to a different number than the order carries ("buy for 250, the job is 200").
 * Admitting an order seeds this from the order and then leaves it editable.
 */
@Entity('mrp_demand_lines')
@Index(['run_id', 'sort_order'])
export class MrpDemandLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  run_id: string;

  @ManyToOne(() => MrpRun, (run) => run.demand_lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'run_id' })
  run: MrpRun;

  @Column({
    type: 'enum',
    enum: MrpDemandSource,
    enumName: 'mrp_demand_source_enum',
  })
  source: MrpDemandSource;

  @Column({ type: 'uuid', nullable: true })
  order_id: string | null;

  @ManyToOne(() => Order, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order: Order | null;

  @Column({ type: 'uuid', nullable: true })
  product_id: string | null;

  @ManyToOne(() => Product, { nullable: true })
  @JoinColumn({ name: 'product_id' })
  product: Product | null;

  /**
   * Null for ORDER lines, which follow their order's revision so that re-BOMing
   * an order keeps MRP correct. Required for SCRATCH lines, which have no order
   * to follow.
   */
  @Column({ type: 'uuid', nullable: true })
  bom_revision_id: string | null;

  @ManyToOne(() => BomRevision, { nullable: true })
  @JoinColumn({ name: 'bom_revision_id' })
  bom_revision: BomRevision | null;

  /** The matrix column header. */
  @Column({ type: 'varchar', length: 120 })
  label: string;

  @Column({ type: 'int' })
  quantity: number;

  /** Falls back to the order's due date when null. */
  @Column({ type: 'date', nullable: true })
  due_date: Date | null;

  /**
   * The buyer's hand-typed build rank (spreadsheet row 5). Null means unranked,
   * and unranked sorts after ranked. This decides who gets scarce stock first.
   */
  @Column({ type: 'smallint', nullable: true })
  priority: number | null;

  /** Free-text job state (spreadsheet row 3): "Open 34", "Quote", "done". */
  @Column({ type: 'varchar', length: 60, nullable: true })
  status_note: string | null;

  /** Park a column without deleting it, keeping its notes and alternates. */
  @Column({ type: 'boolean', default: true })
  include_in_totals: boolean;

  @Column({ type: 'int', default: 0 })
  sort_order: number;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'varchar', length: 100 })
  created_by: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
