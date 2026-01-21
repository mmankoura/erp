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
import { PurchaseOrderLine } from './purchase-order-line.entity';
import { Material } from './material.entity';
import { ApprovedManufacturer } from './approved-manufacturer.entity';
import { InventoryTransaction } from './inventory-transaction.entity';

export enum InspectionStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  ON_HOLD = 'ON_HOLD',
  RELEASED = 'RELEASED', // Moved to inventory
}

export enum InspectionResult {
  PASS = 'PASS',
  FAIL = 'FAIL',
  CONDITIONAL = 'CONDITIONAL',
  NOT_CHECKED = 'NOT_CHECKED',
}

export interface ValidationResults {
  ipn_validation?: {
    result: InspectionResult;
    expected_ipn: string;
    received_ipn: string;
    checked_by?: string;
    checked_at?: string;
  };
  mpn_validation?: {
    result: InspectionResult;
    is_on_aml: boolean;
    approved_manufacturer_id?: string;
    received_manufacturer: string;
    received_mpn: string;
    checked_by?: string;
    checked_at?: string;
  };
  quantity_validation?: {
    result: InspectionResult;
    expected_quantity: number;
    received_quantity: number;
    variance_percent: number;
    checked_by?: string;
    checked_at?: string;
  };
}

@Entity('receiving_inspections')
export class ReceivingInspection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 50 })
  inspection_number: string;

  @Index()
  @Column({ type: 'uuid' })
  po_line_id: string;

  @ManyToOne(() => PurchaseOrderLine)
  @JoinColumn({ name: 'po_line_id' })
  po_line: PurchaseOrderLine;

  @Index()
  @Column({ type: 'uuid' })
  material_id: string;

  @ManyToOne(() => Material)
  @JoinColumn({ name: 'material_id' })
  material: Material;

  // What was actually received (may differ from expected)
  @Column({ type: 'varchar', length: 100 })
  received_ipn: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  received_manufacturer: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  received_mpn: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 4 })
  quantity_received: number;

  // Matched AML entry (if found during validation)
  @Column({ type: 'uuid', nullable: true })
  matched_aml_id: string | null;

  @ManyToOne(() => ApprovedManufacturer)
  @JoinColumn({ name: 'matched_aml_id' })
  matched_aml: ApprovedManufacturer | null;

  @Index()
  @Column({
    type: 'enum',
    enum: InspectionStatus,
    default: InspectionStatus.PENDING,
  })
  status: InspectionStatus;

  @Column({
    type: 'enum',
    enum: InspectionResult,
    default: InspectionResult.NOT_CHECKED,
  })
  overall_result: InspectionResult;

  @Column({ type: 'jsonb', nullable: true })
  validation_results: ValidationResults | null;

  @Column({ type: 'decimal', precision: 12, scale: 4, nullable: true })
  unit_cost: number | null;

  // Receiving operator info
  @Column({ type: 'varchar', length: 100, nullable: true })
  received_by: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  received_at: Date | null;

  // Inspector info (when validation is performed)
  @Column({ type: 'varchar', length: 100, nullable: true })
  inspected_by: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  inspected_at: Date | null;

  // Disposition info (approval/rejection)
  @Column({ type: 'varchar', length: 100, nullable: true })
  disposition_by: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  disposition_at: Date | null;

  @Column({ type: 'text', nullable: true })
  disposition_notes: string | null;

  // Linked inventory transaction (set when RELEASED)
  @Column({ type: 'uuid', nullable: true })
  inventory_transaction_id: string | null;

  @ManyToOne(() => InventoryTransaction)
  @JoinColumn({ name: 'inventory_transaction_id' })
  inventory_transaction: InventoryTransaction | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
