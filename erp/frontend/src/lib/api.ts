const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api"

export class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    message?: string
  ) {
    super(message || `API Error: ${status} ${statusText}`)
    this.name = "ApiError"
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorBody = await response.text()
    let message = errorBody
    try {
      const json = JSON.parse(errorBody)
      message = json.message || json.error || errorBody
    } catch {
      // Keep original text
    }
    throw new ApiError(response.status, response.statusText, message)
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T
  }

  return response.json()
}

export const api = {
  async get<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    })
    return handleResponse<T>(response)
  },

  async post<T>(endpoint: string, data?: unknown, options?: RequestInit): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
      body: data ? JSON.stringify(data) : undefined,
    })
    return handleResponse<T>(response)
  },

  async put<T>(endpoint: string, data?: unknown, options?: RequestInit): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
      body: data ? JSON.stringify(data) : undefined,
    })
    return handleResponse<T>(response)
  },

  async patch<T>(endpoint: string, data?: unknown, options?: RequestInit): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
      body: data ? JSON.stringify(data) : undefined,
    })
    return handleResponse<T>(response)
  },

  async delete<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    })
    return handleResponse<T>(response)
  },
}

// Type definitions for API responses
export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}

// Entity types
export interface Material {
  id: string
  internal_part_number: string
  manufacturer_pn: string | null
  manufacturer: string | null
  description: string | null
  category: string | null
  uom: string
  costing_method: string | null
  standard_cost: number | null
  customer_id: string | null
  customer?: Customer
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Product {
  id: string
  customer_id: string
  customer?: Customer
  part_number: string
  name: string
  description: string | null
  active_bom_revision_id: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Customer {
  id: string
  name: string
  code: string
  email: string | null
  phone: string | null
  address: string | null
  notes: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Supplier {
  id: string
  name: string
  code: string
  email: string | null
  phone: string | null
  address: string | null
  notes: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type OrderType = "TURNKEY" | "CONSIGNMENT"
export type OrderStatus = "PENDING" | "CONFIRMED" | "IN_PRODUCTION" | "SHIPPED" | "COMPLETED" | "CANCELLED"

export interface Order {
  id: string
  order_number: string
  po_number: string | null
  wo_number: string | null
  customer_id: string
  customer?: Customer
  product_id: string
  product?: Product
  bom_revision_id: string
  quantity: number
  quantity_shipped: number
  due_date: string
  order_type: OrderType
  status: OrderStatus
  notes: string | null
  quoted_price: number | null
  currency: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type PurchaseOrderStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "CONFIRMED"
  | "PARTIALLY_RECEIVED"
  | "RECEIVED"
  | "CLOSED"
  | "CANCELLED"

export interface PurchaseOrderLine {
  id: string
  purchase_order_id: string
  material_id: string
  material?: Material
  quantity_ordered: number
  quantity_received: number
  unit_cost: number | null
  line_number: number
  notes: string | null
}

export interface PurchaseOrder {
  id: string
  po_number: string
  supplier_id: string
  supplier?: Supplier
  status: PurchaseOrderStatus
  order_date: string
  expected_date: string | null
  total_amount: number | null
  currency: string
  notes: string | null
  created_by: string | null
  lines?: PurchaseOrderLine[]
  created_at: string
  updated_at: string
  deleted_at: string | null
}

// DTOs for creating/updating purchase orders
export interface CreatePurchaseOrderLineDto {
  material_id: string
  quantity_ordered: number
  unit_cost?: number
  notes?: string
}

export interface CreatePurchaseOrderDto {
  po_number?: string
  supplier_id: string
  status?: PurchaseOrderStatus
  order_date: string
  expected_date?: string
  currency?: string
  notes?: string
  created_by?: string
  lines?: CreatePurchaseOrderLineDto[]
}

export interface UpdatePurchaseOrderDto {
  supplier_id?: string
  expected_date?: string
  currency?: string
  notes?: string
}

export interface InventoryStock {
  material_id: string
  material?: Material
  quantity_on_hand: number
  quantity_allocated: number
  quantity_available: number
  quantity_on_order: number
}

export type TransactionType =
  | "RECEIPT"
  | "CONSUMPTION"
  | "ADJUSTMENT"
  | "SCRAP"
  | "TRANSFER"
  | "ISSUE_TO_WO"
  | "RETURN_FROM_WO"

// Ownership types for inventory
export type OwnerType = "COMPANY" | "CUSTOMER"

export interface InventoryTransaction {
  id: string
  material_id: string
  material?: Material
  quantity: number
  transaction_type: TransactionType
  reference_type: string | null
  reference_id: string | null
  bucket: string | null
  unit_cost: number | null
  reason: string | null
  created_by: string | null
  created_at: string
  // Ownership dimension
  owner_type: OwnerType
  owner_id: string | null
}

export interface InventoryAllocation {
  id: string
  material_id: string
  material?: Material
  order_id: string
  order?: Order
  quantity: number
  status: "ACTIVE" | "CONSUMED" | "CANCELLED"
  reason: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  // Ownership dimension
  owner_type: OwnerType
  owner_id: string | null
}

export interface MrpShortage {
  material_id: string
  material: Material
  quantity_on_hand: number
  quantity_allocated: number
  quantity_available: number
  quantity_on_order: number
  total_required: number
  shortage: number
}

export interface MrpShortagesResponse {
  generated_at: string
  total_materials_with_shortage: number
  total_orders_analyzed: number
  shortages: MrpShortage[]
}

export interface MrpRequirement {
  material_id: string
  material: Material
  total_required: number
  quantity_on_hand: number
  quantity_allocated: number
  quantity_available: number
  quantity_on_order: number
  net_requirement: number
}

export interface MrpRequirementsResponse {
  generated_at: string
  total_orders: number
  materials: MrpRequirement[]
}

// Enhanced shortage types for new views
export interface EnhancedOrderInfo {
  order_id: string
  order_number: string
  product_id: string
  product_name: string
  customer_id: string
  customer_name: string
  customer_code: string
  required_quantity: number
  allocated_quantity: number
  due_date: string
}

export interface ResourceTypeUsage {
  resource_type: string
  quantity_required: number
  reference_designators: string | null
}

export interface EnhancedMaterialShortage {
  material_id: string
  material: Material
  quantity_on_hand: number
  quantity_allocated: number
  quantity_available: number
  quantity_on_order: number
  total_required: number
  shortage: number
  orders: EnhancedOrderInfo[]
  resource_type_usages: ResourceTypeUsage[]
  affected_products: Array<{
    product_id: string
    product_name: string
    quantity_required: number
  }>
}

export interface EnhancedShortageReport {
  generated_at: string
  total_materials_with_shortage: number
  total_orders_analyzed: number
  shortages: EnhancedMaterialShortage[]
}

export interface CustomerShortageOrder {
  order_id: string
  order_number: string
  product_name: string
  due_date: string
  shortages: Array<{
    material_id: string
    ipn: string
    description: string | null
    shortage: number
  }>
}

export interface CustomerShortage {
  customer_id: string
  customer_name: string
  customer_code: string
  total_orders_affected: number
  total_shortage_items: number
  orders: CustomerShortageOrder[]
}

export interface ShortagesByCustomerResponse {
  generated_at: string
  total_customers_affected: number
  customers: CustomerShortage[]
}

export interface ResourceTypeShortage {
  resource_type: string
  total_materials_short: number
  total_shortage_quantity: number
  materials: Array<{
    material_id: string
    ipn: string
    description: string | null
    shortage: number
    total_required: number
    quantity_available: number
    quantity_on_order: number
    affected_orders_count: number
  }>
}

export interface ShortagesByResourceTypeResponse {
  generated_at: string
  resource_types: ResourceTypeShortage[]
}

export type BuildabilityStatus = "CAN_BUILD" | "PARTIAL" | "BLOCKED"

export interface OrderBuildability {
  order_id: string
  order_number: string
  customer_id: string
  customer_name: string
  customer_code: string
  product_id: string
  product_name: string
  due_date: string
  quantity: number
  status: BuildabilityStatus
  materials_ready: number
  materials_short: number
  materials_total: number
  critical_shortages: Array<{
    material_id: string
    ipn: string
    description: string | null
    required: number
    available: number
    on_order: number
    shortage: number        // Per-order shortage: how much THIS order is short
    global_shortage: number // Global shortage: total demand - total supply across ALL orders
  }>
}

export interface OrderBuildabilityResponse {
  generated_at: string
  total_orders: number
  can_build_count: number
  partial_count: number
  blocked_count: number
  orders: OrderBuildability[]
}

export interface AuditEvent {
  id: string
  event_type: string
  entity_type: string
  entity_id: string
  actor: string | null
  old_value: Record<string, unknown> | null
  new_value: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  created_at: string
}

export interface HealthStatus {
  status: string
  timestamp: string
  database?: {
    status: string
  }
}

// Material Status (computed for orders)
export type MaterialStatus = "NEEDS_REVIEW" | "PURCHASING" | "AWAITING_RECEIPT" | "READY" | "PARTIAL"

// Receiving Inspection types
export type InspectionStatus = "PENDING" | "IN_PROGRESS" | "APPROVED" | "REJECTED" | "ON_HOLD" | "RELEASED"

export interface ReceivingInspection {
  id: string
  po_line_id: string
  material_id: string
  material?: Material
  quantity_received: number
  received_ipn: string | null
  received_mpn: string | null
  received_manufacturer: string | null
  ipn_match: boolean | null
  mpn_match: boolean | null
  status: InspectionStatus
  inspected_by: string | null
  inspected_at: string | null
  disposition_by: string | null
  disposition_at: string | null
  disposition_notes: string | null
  created_at: string
  updated_at: string
}

// AML (Approved Manufacturer List) types
export type AmlStatus = "PENDING" | "APPROVED" | "SUSPENDED" | "OBSOLETE"

export interface ApprovedManufacturer {
  id: string
  material_id: string
  material?: Material
  manufacturer: string
  manufacturer_pn: string
  status: AmlStatus
  approved_by: string | null
  approved_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

// BOM types
export type BomSource = "MANUAL" | "IMPORT_CLIENT" | "IMPORT_INTERNAL"
export type ResourceType = "SMT" | "TH" | "MECH" | "PCB" | "DNP"

export interface BomRevision {
  id: string
  product_id: string
  product?: Product
  revision_number: string
  revision_date: string
  change_summary: string | null
  source: BomSource
  source_filename: string | null
  is_active: boolean
  created_at: string
  items?: BomItem[]
}

export interface BomItem {
  id: string
  bom_revision_id: string
  material_id: string
  material?: Material
  alternate_ipn: string | null
  bom_line_key: string | null
  line_number: number | null
  reference_designators: string | null
  quantity_required: number
  resource_type: ResourceType | null
  polarized: boolean
  scrap_factor: number
  notes: string | null
}

export interface CreateBomRevisionDto {
  product_id: string
  revision_number: string
  revision_date: string
  change_summary?: string
  source?: BomSource
  source_filename?: string
  is_active?: boolean
}

export interface CreateBomItemDto {
  material_id: string
  alternate_ipn?: string
  line_number?: number
  reference_designators?: string
  quantity_required: number
  resource_type?: ResourceType
  polarized?: boolean
  scrap_factor?: number
  notes?: string
}

export interface BomDiff {
  added: BomItem[]
  removed: BomItem[]
  changed: Array<{
    old: BomItem
    new: BomItem
    changes: string[]
  }>
}

// BOM Import types
export type BomImportField =
  | "internal_part_number"
  | "alternate_ipn"
  | "manufacturer"
  | "manufacturer_pn"
  | "quantity_required"
  | "reference_designators"
  | "line_number"
  | "resource_type"
  | "polarized"
  | "notes"
  | "ignore"

export interface ColumnMapping {
  source_column: string
  target_field: BomImportField
}

export interface BomImportMapping {
  id: string
  name: string
  description: string | null
  column_mappings: ColumnMapping[]
  has_header_row: boolean
  skip_rows: number
  multi_row_designators: boolean
  ignore_columns: string[] | null
  created_at: string
  updated_at: string
}

export interface BomImportPreviewResult {
  headers: string[]
  rows: string[][]
  total_rows: number
  preview_rows: number
}

export interface BomImportItemDto {
  internal_part_number: string
  alternate_ipn?: string
  manufacturer?: string
  manufacturer_pn?: string
  quantity_required: number
  reference_designators?: string
  line_number?: number
  resource_type?: string
  polarized?: boolean
  notes?: string
}

export interface BomImportParseResult {
  items: BomImportItemDto[]
  warnings: string[]
  errors: string[]
  unmatched_parts: string[]
  matched_count: number
  unmatched_count: number
}

export interface BomImportCommitDto {
  product_id: string
  revision_number: string
  change_summary?: string
  is_active?: boolean
  source_filename?: string
  items: BomImportItemDto[]
}

// Inventory Lot types
export type PackageType = "TR" | "REEL" | "TUBE" | "TRAY" | "BAG" | "BOX" | "BULK" | "OTHER"
export type LotStatus = "ACTIVE" | "CONSUMED" | "EXPIRED" | "ON_HOLD"

export interface InventoryLot {
  id: string
  uid: string
  material_id: string
  material?: Material
  quantity: number
  initial_quantity: number
  package_type: PackageType
  po_reference: string | null
  supplier_id: string | null
  supplier?: Supplier
  unit_cost: number | null
  received_date: string | null
  expiration_date: string | null
  status: LotStatus
  notes: string | null
  created_at: string
  updated_at: string
}

// Inventory Import types
export type InventoryImportField =
  | "uid"
  | "ipn"
  | "quantity"
  | "package_type"
  | "po_reference"
  | "unit_cost"
  | "expiration_date"
  | "notes"
  | "ignore"

export interface InventoryColumnMapping {
  source_column: string
  target_field: InventoryImportField
}

export interface InventoryImportPreviewResult {
  headers: string[]
  rows: string[][]
  total_rows: number
  preview_rows: number
}

export interface InventoryImportItemDto {
  uid: string
  ipn: string
  quantity: number
  package_type?: string
  po_reference?: string
  unit_cost?: number
  expiration_date?: string
  notes?: string
  material_id?: string
  material_matched?: boolean
}

export interface InventoryImportParseResult {
  items: InventoryImportItemDto[]
  warnings: string[]
  errors: string[]
  unmatched_ipns: string[]
  matched_count: number
  unmatched_count: number
  duplicate_uids: string[]
  total_quantity: number
}

export interface InventoryImportCommitResult {
  lots_created: number
  transactions_created: number
  total_quantity: number
  created_materials: string[]
  lot_ids: string[]
}
