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
import { ReceivingSession } from './receiving-session.entity';
import { Material } from './material.entity';
import { PurchaseOrderLine } from './purchase-order-line.entity';
import { InventoryLot } from './inventory-lot.entity';
import { ReceivingInspection } from './receiving-inspection.entity';
import { ApprovedManufacturer } from './approved-manufacturer.entity';
import { PackageType } from './inventory-lot.entity';

export enum ReceivingLineValidationStatus {
  PENDING = 'PENDING',
  PASS = 'PASS',
  FAIL = 'FAIL',
  FLAGGED = 'FLAGGED',
}

export enum HoldReasonCode {
  WRONG_MPN = 'WRONG_MPN',
  DAMAGED = 'DAMAGED',
  NO_PO_LINE = 'NO_PO_LINE',
  NO_AML = 'NO_AML',
  COUNTERFEIT_CONCERN = 'COUNTERFEIT_CONCERN',
  OTHER = 'OTHER',
}

export enum DispositionAction {
  ACCEPT_DEVIATION = 'ACCEPT_DEVIATION',
  PARTIAL_ACCEPT = 'PARTIAL_ACCEPT',
  REJECT_RTV = 'REJECT_RTV',
  SCRAP = 'SCRAP',
}

@Entity('receiving_session_lines')
export class ReceivingSessionLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  session_id: string;

  @ManyToOne(() => ReceivingSession, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session: ReceivingSession;

  @Column({ type: 'integer' })
  line_number: number;

  @Column({ type: 'uuid' })
  client_request_id: string;

  @Index()
  @Column({ type: 'uuid' })
  material_id: string;

  @ManyToOne(() => Material)
  @JoinColumn({ name: 'material_id' })
  material: Material;

  @Column({ type: 'varchar', length: 100 })
  received_ipn: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  received_mpn: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  received_manufacturer: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 4 })
  quantity_received: number;

  @Column({
    type: 'enum',
    enum: PackageType,
    default: PackageType.TR,
  })
  package_type: PackageType;

  @Column({ type: 'uuid', nullable: true })
  po_line_id: string | null;

  @ManyToOne(() => PurchaseOrderLine, { nullable: true })
  @JoinColumn({ name: 'po_line_id' })
  po_line: PurchaseOrderLine | null;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 100 })
  uid: string;

  @Column({ type: 'uuid', nullable: true })
  lot_id: string | null;

  @ManyToOne(() => InventoryLot, { nullable: true })
  @JoinColumn({ name: 'lot_id' })
  lot: InventoryLot | null;

  @Column({ type: 'uuid', nullable: true })
  inspection_id: string | null;

  @ManyToOne(() => ReceivingInspection, { nullable: true })
  @JoinColumn({ name: 'inspection_id' })
  inspection: ReceivingInspection | null;

  @Index()
  @Column({
    type: 'enum',
    enum: ReceivingLineValidationStatus,
    default: ReceivingLineValidationStatus.PENDING,
  })
  validation_status: ReceivingLineValidationStatus;

  @Column({ type: 'boolean', nullable: true })
  ipn_match: boolean | null;

  @Column({ type: 'boolean', nullable: true })
  aml_match: boolean | null;

  @Column({ type: 'uuid', nullable: true })
  matched_aml_id: string | null;

  @ManyToOne(() => ApprovedManufacturer, { nullable: true })
  @JoinColumn({ name: 'matched_aml_id' })
  matched_aml: ApprovedManufacturer | null;

  @Column({ type: 'decimal', precision: 12, scale: 4, nullable: true })
  qty_expected: number | null;

  @Column({ type: 'decimal', precision: 12, scale: 4, nullable: true })
  qty_remaining_on_po: number | null;

  @Column({
    type: 'enum',
    enum: HoldReasonCode,
    nullable: true,
  })
  hold_reason_code: HoldReasonCode | null;

  @Column({ type: 'text', nullable: true })
  hold_notes: string | null;

  @Column({
    type: 'enum',
    enum: DispositionAction,
    nullable: true,
  })
  disposition_action: DispositionAction | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  disposition_by: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  disposition_at: Date | null;

  @Column({ type: 'text', nullable: true })
  disposition_notes: string | null;

  @Column({ type: 'jsonb', nullable: true })
  validation_details: Record<string, any> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
