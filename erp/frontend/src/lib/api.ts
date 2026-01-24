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
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Product {
  id: string
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
  required_quantity: number
  available_quantity: number
  on_order_quantity: number
  shortage: number
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
