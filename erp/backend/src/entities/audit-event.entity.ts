import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Standard event types for the audit log.
 * New event types can be added as needed without migration.
 */
export enum AuditEventType {
  // Order events
  ORDER_CREATED = 'ORDER_CREATED',
  ORDER_UPDATED = 'ORDER_UPDATED',
  ORDER_STATUS_CHANGED = 'ORDER_STATUS_CHANGED',
  ORDER_SHIPPED = 'ORDER_SHIPPED',
  ORDER_CANCELLED = 'ORDER_CANCELLED',
  ORDER_DELETED = 'ORDER_DELETED',

  // BOM events
  BOM_REVISION_CREATED = 'BOM_REVISION_CREATED',
  BOM_REVISION_UPDATED = 'BOM_REVISION_UPDATED',
  BOM_REVISION_ACTIVATED = 'BOM_REVISION_ACTIVATED',
  BOM_REVISION_DELETED = 'BOM_REVISION_DELETED',
  BOM_ITEM_ADDED = 'BOM_ITEM_ADDED',
  BOM_ITEM_UPDATED = 'BOM_ITEM_UPDATED',
  BOM_ITEM_REMOVED = 'BOM_ITEM_REMOVED',

  // Inventory events
  INVENTORY_ADJUSTED = 'INVENTORY_ADJUSTED',
  INVENTORY_RECEIVED = 'INVENTORY_RECEIVED',
  INVENTORY_CONSUMED = 'INVENTORY_CONSUMED',
  INVENTORY_SCRAPPED = 'INVENTORY_SCRAPPED',
  STOCK_LEVEL_SET = 'STOCK_LEVEL_SET',

  // Allocation events
  ALLOCATION_CREATED = 'ALLOCATION_CREATED',
  ALLOCATION_UPDATED = 'ALLOCATION_UPDATED',
  ALLOCATION_CANCELLED = 'ALLOCATION_CANCELLED',
  ALLOCATION_CONSUMED = 'ALLOCATION_CONSUMED',
  ORDER_ALLOCATED = 'ORDER_ALLOCATED',
  ORDER_DEALLOCATED = 'ORDER_DEALLOCATED',

  // Material lifecycle events (pick → issue → return)
  ORDER_MATERIALS_PICKED = 'ORDER_MATERIALS_PICKED',
  ORDER_MATERIALS_ISSUED = 'ORDER_MATERIALS_ISSUED',
  ORDER_MATERIALS_RETURNED = 'ORDER_MATERIALS_RETURNED',
  ORDER_TH_AUTO_CONSUMED = 'ORDER_TH_AUTO_CONSUMED',

  // Material events
  MATERIAL_CREATED = 'MATERIAL_CREATED',
  MATERIAL_UPDATED = 'MATERIAL_UPDATED',
  MATERIAL_DELETED = 'MATERIAL_DELETED',

  // Product events
  PRODUCT_CREATED = 'PRODUCT_CREATED',
  PRODUCT_UPDATED = 'PRODUCT_UPDATED',
  PRODUCT_DELETED = 'PRODUCT_DELETED',

  // Customer events
  CUSTOMER_CREATED = 'CUSTOMER_CREATED',
  CUSTOMER_UPDATED = 'CUSTOMER_UPDATED',
  CUSTOMER_DELETED = 'CUSTOMER_DELETED',

  // Purchase Order events
  PO_CREATED = 'PO_CREATED',
  PO_UPDATED = 'PO_UPDATED',
  PO_STATUS_CHANGED = 'PO_STATUS_CHANGED',
  PO_RECEIVED = 'PO_RECEIVED',
  PO_CANCELLED = 'PO_CANCELLED',
  PO_DELETED = 'PO_DELETED',

  // Supplier events
  SUPPLIER_CREATED = 'SUPPLIER_CREATED',
  SUPPLIER_UPDATED = 'SUPPLIER_UPDATED',
  SUPPLIER_DELETED = 'SUPPLIER_DELETED',

  // AML (Approved Manufacturer List) events
  AML_CREATED = 'AML_CREATED',
  AML_UPDATED = 'AML_UPDATED',
  AML_APPROVED = 'AML_APPROVED',
  AML_SUSPENDED = 'AML_SUSPENDED',
  AML_REINSTATED = 'AML_REINSTATED',
  AML_OBSOLETED = 'AML_OBSOLETED',
  AML_DELETED = 'AML_DELETED',

  // Receiving Inspection events
  INSPECTION_CREATED = 'INSPECTION_CREATED',
  INSPECTION_VALIDATED = 'INSPECTION_VALIDATED',
  INSPECTION_APPROVED = 'INSPECTION_APPROVED',
  INSPECTION_REJECTED = 'INSPECTION_REJECTED',
  INSPECTION_ON_HOLD = 'INSPECTION_ON_HOLD',
  INSPECTION_RELEASED = 'INSPECTION_RELEASED',

  // Cycle Count events (legacy — retained so historical audit rows keep their string values)
  CYCLE_COUNT_CREATED = 'CYCLE_COUNT_CREATED',
  CYCLE_COUNT_STARTED = 'CYCLE_COUNT_STARTED',
  CYCLE_COUNT_ITEM_COUNTED = 'CYCLE_COUNT_ITEM_COUNTED',
  CYCLE_COUNT_ITEM_RECOUNTED = 'CYCLE_COUNT_ITEM_RECOUNTED',
  CYCLE_COUNT_COMPLETED = 'CYCLE_COUNT_COMPLETED',
  CYCLE_COUNT_APPROVED = 'CYCLE_COUNT_APPROVED',
  CYCLE_COUNT_CANCELLED = 'CYCLE_COUNT_CANCELLED',
  CYCLE_COUNT_ADJUSTMENT = 'CYCLE_COUNT_ADJUSTMENT',

  // Physical Count events
  PHYSICAL_COUNT_CREATED = 'PHYSICAL_COUNT_CREATED',
  PHYSICAL_COUNT_STARTED = 'PHYSICAL_COUNT_STARTED',
  PHYSICAL_COUNT_PAUSED = 'PHYSICAL_COUNT_PAUSED',
  PHYSICAL_COUNT_RESUMED = 'PHYSICAL_COUNT_RESUMED',
  PHYSICAL_COUNT_UID_SCANNED = 'PHYSICAL_COUNT_UID_SCANNED',
  PHYSICAL_COUNT_SCAN_VOIDED = 'PHYSICAL_COUNT_SCAN_VOIDED',
  PHYSICAL_COUNT_COMPLETED = 'PHYSICAL_COUNT_COMPLETED',
  PHYSICAL_COUNT_DISCREPANCY_RESOLVED = 'PHYSICAL_COUNT_DISCREPANCY_RESOLVED',
  PHYSICAL_COUNT_APPROVED = 'PHYSICAL_COUNT_APPROVED',
  PHYSICAL_COUNT_CANCELLED = 'PHYSICAL_COUNT_CANCELLED',
  PHYSICAL_COUNT_ADJUSTMENT = 'PHYSICAL_COUNT_ADJUSTMENT',
  PHYSICAL_COUNT_SCRAP = 'PHYSICAL_COUNT_SCRAP',

  // Production / WIP events
  PRODUCTION_STARTED = 'PRODUCTION_STARTED',
  PRODUCTION_STAGE_MOVED = 'PRODUCTION_STAGE_MOVED',
  PRODUCTION_COMPLETED = 'PRODUCTION_COMPLETED',

  // Kitting events
  KITTING_LIST_CREATED = 'KITTING_LIST_CREATED',
  KITTING_LIST_PRINTED = 'KITTING_LIST_PRINTED',
  KITTING_UID_SCANNED = 'KITTING_UID_SCANNED',
  KITTING_LIST_COMPLETED = 'KITTING_LIST_COMPLETED',
  KITTING_LIST_RESUMED = 'KITTING_LIST_RESUMED',
  KITTING_LIST_CANCELLED = 'KITTING_LIST_CANCELLED',

  // User / Auth events
  USER_CREATED = 'USER_CREATED',
  USER_UPDATED = 'USER_UPDATED',
  USER_LOGIN = 'USER_LOGIN',
  USER_LOGOUT = 'USER_LOGOUT',
}

/**
 * Entity types that can be audited.
 */
export enum AuditEntityType {
  ORDER = 'order',
  BOM_REVISION = 'bom_revision',
  BOM_ITEM = 'bom_item',
  INVENTORY_TRANSACTION = 'inventory_transaction',
  INVENTORY_ALLOCATION = 'inventory_allocation',
  INVENTORY_LOT = 'inventory_lot',
  MATERIAL = 'material',
  PRODUCT = 'product',
  CUSTOMER = 'customer',
  PURCHASE_ORDER = 'purchase_order',
  SUPPLIER = 'supplier',
  APPROVED_MANUFACTURER = 'approved_manufacturer',
  RECEIVING_INSPECTION = 'receiving_inspection',
  CYCLE_COUNT = 'cycle_count',
  CYCLE_COUNT_ITEM = 'cycle_count_item',
  PHYSICAL_COUNT = 'physical_count',
  PHYSICAL_COUNT_DISCREPANCY = 'physical_count_discrepancy',
  PRODUCTION_LOG = 'production_log',
  KITTING_LIST = 'kitting_list',
  USER = 'user',
}

/**
 * Metadata structure for audit events.
 * Flexible JSONB field for additional context.
 */
export interface AuditMetadata {
  ip_address?: string;
  session_id?: string;
  reason?: string;
  approval_id?: string;
  source?: string;
  [key: string]: any;
}

@Entity('audit_events')
export class AuditEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 50 })
  event_type: string;

  @Index()
  @Column({ type: 'varchar', length: 50 })
  entity_type: string;

  @Index()
  @Column({ type: 'uuid' })
  entity_id: string;

  @Index()
  @Column({ type: 'varchar', length: 100, nullable: true })
  actor: string | null;

  @Column({ type: 'jsonb', nullable: true })
  old_value: Record<string, any> | null;

  @Column({ type: 'jsonb', nullable: true })
  new_value: Record<string, any> | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: AuditMetadata | null;

  @Index()
  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
