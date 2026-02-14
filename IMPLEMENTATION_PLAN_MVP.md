# Manufacturing ERP System - MVP Implementation Plan

## Progress Status

> **Last Updated**: February 13, 2026

### Completed ✅
- [x] Docker + PostgreSQL setup (running in WSL2)
- [x] NestJS backend initialized and connecting to database
- [x] TypeORM configured with migrations-first strategy (schema sync disabled)
- [x] Global API prefix `/api` configured
- [x] ValidationPipe configured (whitelist, forbidNonWhitelisted, transform)
- [x] Environment validation (fail-fast on missing DATABASE_URL)

#### Entities (14 complete)
- [x] **Materials** entity with soft delete + partial unique index + costing fields
- [x] **Products** entity with soft delete + partial unique index + customer association (required)
- [x] **Customers** entity with soft delete
- [x] **BomRevision** entity (BomSource enum: MANUAL, IMPORT_CLIENT, IMPORT_INTERNAL)
- [x] **BomItem** entity (ResourceType enum, bom_line_key for stable diffing)
- [x] **Order** entity (OrderType: TURNKEY/CONSIGNMENT, OrderStatus: 6 states) + partial unique index + pricing fields
- [x] **InventoryTransaction** entity (ledger model + unit_cost for costing)
- [x] **InventoryAllocation** entity (material reservations per order with optimistic locking + reason tracking)
- [x] **AuditEvent** entity (append-only audit log for compliance and accountability)
- [x] **Supplier** entity with soft delete + partial unique index
- [x] **PurchaseOrder** entity (PurchaseOrderStatus: 7 states) + soft delete
- [x] **PurchaseOrderLine** entity (quantity_ordered, quantity_received tracking)
- [x] **ApprovedManufacturer** entity (AML - tracks approved MPN/manufacturer combinations per material)
- [x] **ReceivingInspection** entity (staging area for received items pending validation)

#### Migrations (20 applied)
- [x] Initial schema (materials, products)
- [x] AddSoftDeleteToMaterials
- [x] AddSoftDeleteToProducts
- [x] CreateCustomers
- [x] CreateBomTables (bom_revisions, bom_items with enums)
- [x] CreateOrders (with indexes on status, customer_id, product_id, due_date)
- [x] CreateInventory (original flat model - replaced)
- [x] ConvertInventoryToLedger (inventory_transactions table)
- [x] AddBomLineKey (stable identity for BOM diffing)
- [x] AddPartialUniqueIndexes (soft delete correctness)
- [x] CreateInventoryAllocations (allocation system with partial unique index)
- [x] AddInventoryDimensions (Phase 1: location_id, lot_id, bucket columns + indexes)
- [x] AddUnitCostToInventoryTransactions (costing foundation - capture cost at transaction time)
- [x] CreateAuditEvents (audit log table for compliance)
- [x] AddFutureProofingColumns (costing_method, standard_cost on materials; quoted_price, currency on orders; reason on allocations)
- [x] AddOrdersCompositeIndex (status + due_date for filtered queries)
- [x] CreatePurchaseOrders (suppliers, purchase_orders, purchase_order_lines tables with indexes)
- [x] CreateReceivingInspection (approved_manufacturers, receiving_inspections tables with enums and indexes)
- [x] AddOwnershipDimension (owner_type, owner_id on inventory_transactions and inventory_allocations)
- [x] AddCustomerToProduct (customer_id on products with foreign key to customers)

#### Backend Modules (13 complete) - ~122 API Endpoints Total
- [x] **Materials Module** (7 endpoints) - CRUD + bulk create + restore
- [x] **Products Module** (6 endpoints) - CRUD + restore
- [x] **Customers Module** (6 endpoints) - CRUD + search + restore
- [x] **BOM Module** (15 endpoints) - Revisions, items, activation, diff, copy + audit events
- [x] **Orders Module** (13 endpoints) - CRUD, status, shipping, cancel, filtering, stats + allocation lifecycle + audit events
- [x] **Inventory Module** (18 endpoints) - Ledger-based transactions + stock queries (includes quantity_on_order) + allocation management + audit events
- [x] **MRP Module** (4 endpoints) - Requirements + shortages + order availability (factors in quantity_on_order)
- [x] **Audit Module** (6 endpoints) - Query audit events, entity history, actor history, event type filtering, stats
- [x] **Health Module** (3 endpoints) - Health check, liveness probe, readiness probe
- [x] **Suppliers Module** (6 endpoints) - CRUD + search + restore
- [x] **Purchase Orders Module** (15 endpoints) - CRUD, lines, status workflow, receiving, quantity_on_order queries
- [x] **AML Module** (11 endpoints) - Approved Manufacturer List CRUD + status transitions (approve, suspend, reinstate, obsolete) + validation
- [x] **Receiving Inspection Module** (11 endpoints) - Inspection workflow (validate, approve, reject, hold, release) + bulk release

### In Progress 🔄
- [ ] **Frontend (Next.js)** (~99% complete)
  - [x] Next.js 14 initialized with App Router, Tailwind CSS v4, TypeScript
  - [x] shadcn/ui component library integrated
  - [x] Layout: Collapsible sidebar navigation, header with breadcrumbs
  - [x] Dashboard: Stats cards, recent orders, shortages display (fixed Feb 13)
  - [x] Full CRUD pages: Materials, Products, Customers, Suppliers
  - [x] Orders page with computed Material Status (Option A implementation)
  - [x] Reusable DataTable component with search/pagination/column resize
  - [x] API client with TypeScript types (`lib/api.ts`)
  - [x] Custom data fetching hooks (`useApi`, `useMutation`)
  - [x] Purchase Orders page (full CRUD with line items, status workflow)
  - [x] Inventory page (stock levels, transactions, adjustments, low stock alerts)
  - [x] MRP/Shortages page (shortages analysis, requirements view)
  - [x] Receiving Inspection page (validation workflow)
  - [x] AML page (CRUD with status workflow)
  - [x] Audit Log page (filterable event log with detail view)
  - [x] BOM viewer page (view revisions, compare diffs, filter by product)
  - [x] BOM Import wizard (CSV + Excel support, column mapping, material matching, full-screen UI)
  - [x] BOM Validation page (compare uploaded file against stored revision)
  - [x] Login page with session authentication
  - [x] User management page (admin only)
  - [x] Role-based UI controls (canEdit, canManageUsers, etc.)
  - [x] Cycle Count pages (count entry, variance review, approval workflow)
  - [x] Production/WIP tracking pages
  - [ ] Settings page (placeholder - low priority)

#### Recently Completed
- [x] **Seed Script** - 4 customers, 20 materials, 4 products with BOMs, 5 sample orders
- [x] **Schema refinements** - bom_line_key, partial unique indexes (2 migrations)
- [x] **Inventory Allocation System** - Reserve materials per order, prevent overselling
- [x] **Order Lifecycle Integration** - Automatic deallocation on cancel, consumption on complete
- [x] **Order Lifecycle Testing** - Full end-to-end testing of status transitions and allocation handling
- [x] **Phase 1 Inventory Dimensions** - Schema future-proofed with location_id, lot_id, bucket (nullable)
- [x] **Architecture Review (Jan 14)** - Resolved dual-truth conflict, added bucket transition rules, allocation state semantics, ownership dimension design
- [x] **Future-Proofing Infrastructure (Jan 15)** - Added costing foundation, audit events, and schema columns for future features
- [x] **Audit System Tested & Verified (Jan 16)** - All 6 audit endpoints tested, events captured for orders and inventory
- [x] **Health Check Module (Jan 16)** - `/health`, `/health/live`, `/health/ready` endpoints for deployment/monitoring
- [x] **Environment Validation (Jan 16)** - Fail-fast on missing DATABASE_URL with clear error messages
- [x] **Database Index Optimization (Jan 16)** - Added composite index on orders(status, due_date)
- [x] **Suppliers Module (Jan 20)** - Full CRUD for supplier management with soft delete
- [x] **Purchase Orders Module (Jan 20)** - Complete PO lifecycle (DRAFT→SUBMITTED→CONFIRMED→RECEIVED→CLOSED), receiving workflow, quantity_on_order tracking
- [x] **MRP Integration with POs (Jan 20)** - Shortage calculations now factor in quantity_on_order from open POs
- [x] **Receiving Inspection Module (Jan 20)** - Validation gate between PO receiving and inventory: IPN validation, MPN validation against AML, quantity documentation
- [x] **Approved Manufacturer List Module (Jan 20)** - Track approved manufacturer/MPN combinations per material with status workflow (PENDING→APPROVED→SUSPENDED→OBSOLETE)
- [x] **WSL2 Development Guide (Jan 20)** - DEVELOPMENT.md documenting port conflict issue (orphaned node.exe), helper scripts (`npm run dev`, `npm run kill-node`)
- [x] **Frontend Initial Setup (Jan 22)** - Next.js 14 with App Router, Tailwind CSS v4, shadcn/ui, TypeScript
- [x] **Frontend Core Pages (Jan 22)** - Dashboard, Materials, Products, Customers, Suppliers, Orders with full CRUD
- [x] **Material Status Feature (Jan 22)** - Computed material status on Orders page (READY, PURCHASING, AWAITING_RECEIPT, PARTIAL, NEEDS_REVIEW) based on MRP shortages
- [x] **Frontend Remaining Pages (Jan 23)** - Purchase Orders, Inventory, MRP, Receiving, AML, Audit Log pages completed
- [x] **Ownership Dimension (Jan 23)** - Added owner_type (COMPANY/CUSTOMER) and owner_id to inventory_transactions and inventory_allocations. Owner-aware stock queries for TURNKEY vs CONSIGNMENT orders. Prevents cross-customer material contamination.
- [x] **BOM Viewer Page (Jan 24)** - View all BOM revisions, filter by product, search, view revision details with items, compare/diff between two revisions
- [x] **BOM Import with Excel Support (Jan 24)** - Added xlsx library for Excel parsing (.xlsx, .xls), fixed UTF-8 encoding bug with btoa()
- [x] **BOM Validation Page (Jan 24)** - 4-step wizard to compare uploaded BOM file against stored revision. Shows added/removed/changed items with visual diff
- [x] **Auto-Create Materials on BOM Import (Jan 25)** - Materials not found during BOM import are now automatically created using IPN, manufacturer, and MPN from the import. UI updated to show "New Materials (will be created)" instead of errors
- [x] **Inventory Import with Lot Tracking (Jan 28)** - Added `/inventory/import/commit` endpoint for importing inventory with lot/reel tracking (UID, package type, PO reference). Inventory lots maintain traceability from receipt to consumption
- [x] **Customer Association for Products (Jan 28)** - Products now require customer_id (foreign key). All products must belong to a customer. Migration updates existing products to link to first customer
- [x] **Materials Page Search/Filter (Jan 28)** - Multi-field search (IPN, MPN, description) and filter panel (customer, IPN, MPN, description) added to materials page
- [x] **Products Page Search/Filter (Jan 28)** - Multi-field search (part number, name, description) and customer filter added to products page. Customer column displayed in table
- [x] **MRP Page Fixes (Jan 28)** - Fixed API response handling (wrapper objects vs arrays), corrected field name mismatches (total_required, quantity_available, quantity_on_order)
- [x] **DNP Filtering in BOM Import (Jan 28)** - "Do Not Populate" entries automatically filtered out during BOM import to prevent false shortage reports
- [x] **User Authentication & Authorization (Feb 4-13)** - Session-based auth with Passport.js, 4 roles (ADMIN, MANAGER, WAREHOUSE_CLERK, OPERATOR), role-based UI controls, user management page
- [x] **BOM Import Wizard Full Screen (Feb 13)** - Made BOM import wizard full screen with better UX
- [x] **BOM Import Description Field (Feb 13)** - Added description as mappable field, auto-populates material description on import
- [x] **BOM Import Customer Assignment (Feb 13)** - Materials created during BOM import now auto-assigned to product's customer
- [x] **System Workflows Documentation (Feb 13)** - Comprehensive mermaid diagrams documenting entity dependencies, order lifecycle, production flow, etc.
- [x] **Cycle Count / Physical Inventory (Feb 4)** - Full cycle count workflow with variance tracking and approval process
- [x] **WIP Tracking / In-Process Parts (Feb 4)** - Track materials through production stages (kitting, SMT, TH, etc.)
- [x] **Material Return Workflow (Feb 4)** - Return unused materials from production back to stock

### Bug Fixes (Feb 2026)
- [x] **Session Cookie Not Sent** - SameSite=None requires Secure=true on HTTP; fixed with SameSite=Lax + Next.js proxy for same-origin requests
- [x] **Edit Dialog Navigation** - Click/keyboard events in edit dialogs propagated to DataTable row click handler, causing unwanted navigation; fixed with stopPropagation on triggers and DialogContent
- [x] **User Email Validation** - Empty email string caused validation error; made email optional, frontend filters out empty strings
- [x] **Dashboard Shortages Not Displaying** - Dashboard expected MrpShortage[] but API returns wrapper object; fixed by extracting shortages array from response
- [x] **Materials Missing Customer Association** - Materials created during BOM import had no customer_id; fixed by auto-assigning product's customer

### Not Started ⬚
- [ ] Production deployment configuration
- [ ] Phase 5: Quoting Module (vendor pricing integration)
- [ ] Phase 6: Label Printing (Dymo integration)

---

## Recommended Next Steps

### Phase 0: Ownership Dimension ✅ COMPLETED

**Status:** Completed on January 23, 2026. Inventory transactions and allocations now support owner_type (COMPANY/CUSTOMER) and owner_id for consignment material isolation.

### Current Priority: Production Readiness 🟡

**Completed:**
- [x] User authentication/authorization (session-based with 4 roles)
- [x] Frontend ~99% complete

**Remaining for MVP Go-Live:**
- [ ] Production deployment configuration (Docker, environment variables)
- [ ] Settings page (placeholder - low priority)

---

### Phase 1: Frontend Development (In Progress ~40%)

The backend is feature-complete for MVP. Frontend development enables:
- Visual testing of all backend functionality
- User feedback on workflows before adding more backend features
- Usable system for day-to-day operations

**Frontend Implementation Steps:**
1. ~~**Initialize Next.js** with Tailwind CSS and App Router~~ ✅ Complete
2. ~~**Build layout** - Navigation sidebar, header, responsive design~~ ✅ Complete
3. ~~**Core CRUD pages** - Materials, Products, Customers, Suppliers~~ ✅ Complete (4 pages)
4. ~~**Order management** - Order list with computed material status~~ ✅ Complete
5. **Purchase Orders page** - PO list, create/edit, receiving workflow
6. **Inventory page** - Stock levels, allocation visibility, transaction history (will show ownership after Phase 0)
7. **MRP/Shortages** - Material requirements and shortage reporting
8. **Receiving Inspection page** - Validation workflow, approve/reject/hold
9. **AML page** - Approved manufacturer list management
10. **BOM viewer** - View BOM revisions, compare diffs
11. **Audit log viewer** - View system activity and history

### Phase 2: BOM Import Module (After Ownership Dimension)

Once the frontend is operational, add BOM import capabilities:

1. **BOM Import Module** - File parsing, column mapping, preview, commit
   - Create `bom_import_mappings` entity and migration
   - Implement file upload and parsing (CSV/XLSX)
   - Column mapping service
   - Preview and commit endpoints
   - Frontend: Import wizard UI

2. **BOM Validation Module** - Compare uploaded BOM against stored revision
   - Create `bom_validations` entity and migration
   - Validation comparison service
   - Discrepancy reporting
   - Frontend: Validation results UI

### Phase 3: Document Tracking & Receiving Inspection (After BOM Import)

Full document reference system for traceability and compliance, plus kit list comparison for consignment receiving inspection.

#### 3.0 Ownership Dimension - CRITICAL PREREQUISITE (~4 hours)

**Purpose:** Prevent cross-customer material contamination. Ensures Customer A's consignment parts are never used for Customer B's orders.

**Problem Without This:**
```
Customer A sends 1000 resistors (consignment)  ──┐
                                                 ├──► Mixed pool: 1500 resistors
Customer B sends 500 resistors (consignment)   ──┘

Risk: Customer A's order might consume Customer B's parts ❌
```

**Solution:** Add ownership tracking to inventory.

**Schema Changes:**
```sql
-- Migration: Add ownership dimension to inventory_transactions
ALTER TABLE inventory_transactions
ADD COLUMN owner_type VARCHAR(20) NOT NULL DEFAULT 'COMPANY',
ADD COLUMN owner_id UUID REFERENCES customers(id);

-- Index for fast owner-scoped queries
CREATE INDEX idx_inventory_transactions_owner
ON inventory_transactions(owner_type, owner_id, material_id);

-- Constraint: CUSTOMER type must have owner_id
ALTER TABLE inventory_transactions
ADD CONSTRAINT chk_inventory_owner_consistency
CHECK (
  (owner_type = 'COMPANY' AND owner_id IS NULL) OR
  (owner_type = 'CUSTOMER' AND owner_id IS NOT NULL)
);

-- Also add to inventory_allocations for consistency
ALTER TABLE inventory_allocations
ADD COLUMN owner_type VARCHAR(20) NOT NULL DEFAULT 'COMPANY',
ADD COLUMN owner_id UUID REFERENCES customers(id);

ALTER TABLE inventory_allocations
ADD CONSTRAINT chk_allocation_owner_consistency
CHECK (
  (owner_type = 'COMPANY' AND owner_id IS NULL) OR
  (owner_type = 'CUSTOMER' AND owner_id IS NOT NULL)
);

-- Add comment for documentation
COMMENT ON COLUMN inventory_transactions.owner_type IS 'COMPANY = our stock, CUSTOMER = consignment stock belonging to specific customer';
COMMENT ON COLUMN inventory_transactions.owner_id IS 'customer_id when owner_type=CUSTOMER, NULL when owner_type=COMPANY';
```

**Owner Types:**
| Type | Description | owner_id |
|------|-------------|----------|
| `COMPANY` | Materials owned by us (purchased, turnkey jobs) | NULL |
| `CUSTOMER` | Consignment materials owned by customer | customer_id |

**Service Changes:**

```typescript
// InventoryService - Owner-aware stock queries

async getAvailableStockForOrder(
  materialId: string,
  order: Order
): Promise<number> {
  const query = this.transactionRepository
    .createQueryBuilder('t')
    .select('COALESCE(SUM(t.quantity), 0)', 'stock')
    .where('t.material_id = :materialId', { materialId });

  if (order.order_type === 'CONSIGNMENT') {
    // Consignment: ONLY customer's own inventory
    query.andWhere('t.owner_type = :ownerType', { ownerType: 'CUSTOMER' });
    query.andWhere('t.owner_id = :customerId', { customerId: order.customer_id });
  } else {
    // Turnkey: ONLY company inventory
    query.andWhere('t.owner_type = :ownerType', { ownerType: 'COMPANY' });
  }

  const result = await query.getRawOne();
  return parseFloat(result.stock);
}

// Allocation must respect ownership
async allocateForOrder(orderId: string, createdBy?: string): Promise<AllocationResult> {
  const order = await this.getOrder(orderId);

  // Determine ownership scope
  const ownerType = order.order_type === 'CONSIGNMENT' ? 'CUSTOMER' : 'COMPANY';
  const ownerId = order.order_type === 'CONSIGNMENT' ? order.customer_id : null;

  return await this.dataSource.transaction(async (manager) => {
    for (const bomItem of bomItems) {
      // Get available stock FOR THIS OWNER ONLY
      const available = await this.getAvailableStockByOwner(
        bomItem.material_id,
        ownerType,
        ownerId,
        manager
      );

      // Create allocation with ownership
      const allocation = manager.create(InventoryAllocation, {
        material_id: bomItem.material_id,
        order_id: orderId,
        quantity: toAllocate,
        owner_type: ownerType,
        owner_id: ownerId,
        // ...
      });

      await manager.save(allocation);
    }
  });
}

// Receipt must capture ownership from shipment
async recordReceipt(dto: ReceiptDto): Promise<InventoryTransaction> {
  // Determine ownership from shipment
  let ownerType = 'COMPANY';
  let ownerId = null;

  if (dto.shipment_id) {
    const shipment = await this.getShipment(dto.shipment_id);
    if (shipment.shipment_type === 'INBOUND_CUSTOMER') {
      ownerType = 'CUSTOMER';
      ownerId = shipment.customer_id;
    }
  }

  return this.transactionRepository.save({
    material_id: dto.material_id,
    quantity: dto.quantity,
    transaction_type: 'RECEIPT',
    owner_type: ownerType,
    owner_id: ownerId,
    shipment_id: dto.shipment_id,
    // ...
  });
}
```

**Validation Rules:**
- Receipts from customer shipments → `owner_type = 'CUSTOMER'`, `owner_id = customer_id`
- Receipts from supplier POs → `owner_type = 'COMPANY'`, `owner_id = NULL`
- Allocations inherit ownership from order type (CONSIGNMENT vs TURNKEY)
- Consumption transactions preserve ownership from allocation

**Stock View After Implementation:**
```
Material: 10K Resistor

┌─────────────────────────────────────────────────────────┐
│ Owner          │ Quantity │ Available for               │
├─────────────────────────────────────────────────────────┤
│ COMPANY        │ 2,000    │ Turnkey orders (any)        │
│ Customer A     │ 1,000    │ Customer A's orders ONLY    │
│ Customer B     │ 500      │ Customer B's orders ONLY    │
└─────────────────────────────────────────────────────────┘

Customer A's consignment order needs 800 resistors:
  → Can allocate from Customer A's 1,000 ✅
  → Cannot see Customer B's 500 ✅
  → Cannot see Company's 2,000 ✅ (unless policy allows)
```

**Endpoints Affected:**
- `GET /inventory/stock` - Add `?owner_type=` and `?owner_id=` filters
- `GET /inventory/stock/:materialId` - Return breakdown by owner
- `POST /inventory/transaction` - Accept and validate `owner_type`, `owner_id`
- `POST /inventory/allocate/:orderId` - Auto-determine from order type

**This step is REQUIRED before go-live with consignment customers.**

---

#### 3.1 Purchase Orders Module ✅ COMPLETE (Jan 20, 2026)

**Purpose:** Track material purchases from suppliers.

**Schema:**
```sql
CREATE TABLE purchase_orders (
  id UUID PRIMARY KEY,
  po_number VARCHAR(50) UNIQUE NOT NULL,
  supplier_id UUID REFERENCES suppliers(id),  -- Note: suppliers table needed
  status VARCHAR(20) NOT NULL,  -- DRAFT, SUBMITTED, CONFIRMED, RECEIVED, CLOSED, CANCELLED
  order_date DATE NOT NULL,
  expected_date DATE,
  total_amount DECIMAL(12,2),
  currency VARCHAR(3) DEFAULT 'USD',
  notes TEXT,
  created_by VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE purchase_order_lines (
  id UUID PRIMARY KEY,
  purchase_order_id UUID REFERENCES purchase_orders(id),
  material_id UUID REFERENCES materials(id),
  quantity_ordered DECIMAL(12,4) NOT NULL,
  quantity_received DECIMAL(12,4) DEFAULT 0,
  unit_cost DECIMAL(12,4),
  line_number INT,
  notes TEXT
);
```

**Endpoints:**
- `POST /purchase-orders` - Create PO
- `GET /purchase-orders` - List with filters (status, supplier, date range)
- `GET /purchase-orders/:id` - Get PO with lines
- `PATCH /purchase-orders/:id` - Update PO
- `POST /purchase-orders/:id/lines` - Add line item
- `PATCH /purchase-orders/:id/receive` - Record receipt against PO (now creates inspections)

#### 3.1.1 Receiving Inspection with AML Validation ✅ COMPLETE (Jan 20, 2026)

**Purpose:** Validate received items BEFORE moving to available inventory. Prevents incorrect parts from entering stock.

**Flow:**
```
PO Receive → Inspection (PENDING) → Validate (IPN, MPN vs AML) → Approve → Release to Inventory
```

**New Entities:**
- `ApprovedManufacturer` - Tracks approved manufacturer/MPN combinations per material (AML)
- `ReceivingInspection` - Staging area for received items pending validation

**Status Workflows:**
- AML: PENDING → APPROVED → SUSPENDED → OBSOLETE
- Inspection: PENDING → IN_PROGRESS → APPROVED/REJECTED/ON_HOLD → RELEASED

**Validation Logic:**
1. **IPN Validation** - Compare received IPN with material's internal_part_number
2. **MPN Validation** - Check if manufacturer/MPN is on the Approved Manufacturer List
3. **Quantity Documentation** - Record variance from expected quantity

**Endpoints (22 new):**
- `/aml` - AML CRUD + status transitions (approve, suspend, reinstate, obsolete) + validation
- `/receiving-inspections` - Workflow (validate, approve, reject, hold, release) + bulk operations

**Key Behavior Change:**
- PO receiving now creates `ReceivingInspection` records instead of direct inventory transactions
- Inventory transactions only created when inspections are released (RELEASED status)

#### 3.2 Work Orders Module (~4 hours)

**Purpose:** Track production work for customer orders.

**Schema:**
```sql
CREATE TABLE work_orders (
  id UUID PRIMARY KEY,
  wo_number VARCHAR(50) UNIQUE NOT NULL,
  order_id UUID REFERENCES orders(id) NOT NULL,
  status VARCHAR(20) NOT NULL,  -- CREATED, RELEASED, IN_PROGRESS, COMPLETED, CLOSED, CANCELLED
  quantity_to_build INT NOT NULL,
  quantity_completed INT DEFAULT 0,
  quantity_scrapped INT DEFAULT 0,
  start_date DATE,
  due_date DATE,
  completed_date DATE,
  notes TEXT,
  created_by VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Endpoints:**
- `POST /work-orders` - Create WO from order
- `GET /work-orders` - List with filters
- `GET /work-orders/:id` - Get WO details
- `PATCH /work-orders/:id/status` - Update status
- `POST /work-orders/:id/complete` - Record completion
- `POST /work-orders/:id/scrap` - Record scrap

#### 3.3 Shipments & Packing Slips Module (~3 hours)

**Purpose:** Track inbound shipments and customer-provided packing slips for consignment jobs.

**Schema:**
```sql
CREATE TABLE shipments (
  id UUID PRIMARY KEY,
  shipment_number VARCHAR(50) UNIQUE NOT NULL,
  shipment_type VARCHAR(20) NOT NULL,  -- INBOUND_CUSTOMER, INBOUND_SUPPLIER, OUTBOUND
  order_id UUID REFERENCES orders(id),  -- For consignment shipments
  customer_id UUID REFERENCES customers(id),
  supplier_id UUID,  -- FK when suppliers table exists
  status VARCHAR(20) NOT NULL,  -- EXPECTED, RECEIVED, INSPECTED, APPROVED, REJECTED
  expected_date DATE,
  received_date DATE,
  received_by VARCHAR(100),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE packing_slips (
  id UUID PRIMARY KEY,
  slip_number VARCHAR(50) NOT NULL,
  shipment_id UUID REFERENCES shipments(id) NOT NULL,
  source VARCHAR(20) NOT NULL,  -- CUSTOMER_PROVIDED, SUPPLIER_PROVIDED, INTERNAL
  source_filename VARCHAR(255),
  received_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(shipment_id, slip_number)
);
```

**Endpoints:**
- `POST /shipments` - Create shipment
- `GET /shipments` - List with filters
- `GET /shipments/:id` - Get shipment details
- `PATCH /shipments/:id/receive` - Mark as received
- `POST /shipments/:id/packing-slips` - Attach packing slip

#### 3.4 Update Inventory Transaction References (~2 hours)

**Migration:** Add proper FK relationships and enforce references.

```sql
-- Add shipment_id to inventory_transactions
ALTER TABLE inventory_transactions
ADD COLUMN shipment_id UUID REFERENCES shipments(id),
ADD COLUMN purchase_order_line_id UUID REFERENCES purchase_order_lines(id),
ADD COLUMN work_order_id UUID REFERENCES work_orders(id);

-- Add PACKING_SLIP to reference_type enum
ALTER TYPE reference_type_enum ADD VALUE 'PACKING_SLIP';
ALTER TYPE reference_type_enum ADD VALUE 'SHIPMENT';

-- Add constraint: RECEIPT transactions must have a reference
-- (enforced in application layer for flexibility)
```

**Validation Rules:**
- `RECEIPT` transactions MUST have one of: `shipment_id`, `purchase_order_line_id`, or `reference_type = MANUAL` with reason
- `CONSUMPTION` transactions SHOULD have `work_order_id`
- `ISSUE_TO_WO` transactions MUST have `work_order_id`

#### 3.5 Kit List Import & Comparison (~5 hours)

**Purpose:** Import customer-provided kit lists and compare against actual receiving records for discrepancy reporting.

**Schema:**
```sql
CREATE TABLE kit_lists (
  id UUID PRIMARY KEY,
  shipment_id UUID REFERENCES shipments(id) NOT NULL,
  source_filename VARCHAR(255),
  import_date TIMESTAMPTZ DEFAULT NOW(),
  status VARCHAR(20) NOT NULL,  -- IMPORTED, COMPARING, COMPARED, APPROVED, REJECTED
  comparison_date TIMESTAMPTZ,
  compared_by VARCHAR(100),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE kit_list_items (
  id UUID PRIMARY KEY,
  kit_list_id UUID REFERENCES kit_lists(id) NOT NULL,
  line_number INT,
  -- Customer-provided data (as imported)
  customer_part_number VARCHAR(100),
  internal_part_number VARCHAR(100),
  manufacturer_part_number VARCHAR(100),
  manufacturer VARCHAR(100),
  quantity_claimed DECIMAL(12,4) NOT NULL,
  -- Matching results
  material_id UUID REFERENCES materials(id),  -- Matched material (null if not found)
  match_status VARCHAR(20),  -- MATCHED, NOT_FOUND, AMBIGUOUS
  match_confidence VARCHAR(20),  -- EXACT, PARTIAL, MANUAL
  -- Comparison results (populated after comparison)
  quantity_received DECIMAL(12,4),
  quantity_variance DECIMAL(12,4),
  variance_type VARCHAR(20),  -- NONE, OVER, SHORT, MISSING_FROM_RECEIPT, MISSING_FROM_KIT
  variance_notes TEXT
);

-- Index for fast lookups during matching
CREATE INDEX idx_kit_list_items_ipn ON kit_list_items(internal_part_number);
CREATE INDEX idx_kit_list_items_mpn ON kit_list_items(manufacturer_part_number);
```

**Import Service:**
```typescript
interface KitListImportResult {
  kit_list_id: string;
  total_lines: number;
  matched: number;
  not_found: number;
  ambiguous: number;
  items: KitListItem[];
}

async importKitList(
  shipmentId: string,
  file: Buffer,
  columnMapping: ColumnMapping
): Promise<KitListImportResult>;
```

**Comparison Service:**
```typescript
interface DiscrepancyReport {
  kit_list_id: string;
  shipment_id: string;
  comparison_date: Date;
  summary: {
    total_lines: number;
    matched_exact: number;
    quantity_variances: number;
    missing_from_receipt: number;
    missing_from_kit_list: number;
    total_discrepancies: number;
  };
  discrepancies: Array<{
    line_number: number;
    internal_part_number: string;
    manufacturer_part_number: string;
    quantity_claimed: number;
    quantity_received: number;
    variance: number;
    variance_type: 'OVER' | 'SHORT' | 'MISSING_FROM_RECEIPT' | 'MISSING_FROM_KIT';
  }>;
}

async compareKitListToReceiving(kitListId: string): Promise<DiscrepancyReport>;
async exportDiscrepancyReport(kitListId: string, format: 'CSV' | 'PDF'): Promise<Buffer>;
```

**Endpoints:**
- `POST /kit-lists/import` - Import kit list from file
- `GET /kit-lists/:id` - Get kit list with items
- `POST /kit-lists/:id/match` - Re-run material matching
- `PATCH /kit-lists/:id/items/:itemId` - Manual match correction
- `POST /kit-lists/:id/compare` - Run comparison against receipts
- `GET /kit-lists/:id/discrepancies` - Get discrepancy report
- `GET /kit-lists/:id/discrepancies/export` - Export report (CSV/PDF)

#### Phase 3 Implementation Order

| Step | Component | Dependencies | Effort | Priority |
|------|-----------|--------------|--------|----------|
| **3.0** | **Ownership Dimension** | None | **4 hrs** | **🔴 CRITICAL** |
| ~~3.1~~ | ~~Purchase Orders module~~ | ~~Suppliers table~~ | ✅ Done | ✅ Complete |
| 3.2 | Work Orders module | Orders module | 4 hrs | High |
| 3.3 | Shipments + Packing Slips | Customers, Orders, Step 3.0 | 3 hrs | High |
| 3.4 | Update inventory_transactions refs | Steps 3.1-3.3 | 2 hrs | High |
| 3.5 | Kit List Import + Comparison | Steps 3.3-3.4, BOM Import patterns | 5 hrs | Medium |
| 3.6 | Frontend: Document management UI | Steps 3.1-3.4 | 6 hrs | Medium |
| 3.7 | Frontend: Kit list wizard + report | Step 3.5 | 4 hrs | Medium |

**Total Phase 3 Effort:** ~32 hours (backend + frontend)

**⚠️ IMPORTANT:** Step 3.0 (Ownership Dimension) is **REQUIRED before go-live with consignment customers**. Without it, cross-customer material contamination is possible.

#### Document Reference Flow

```
                                    ┌─────────────────┐
                                    │ Customer Order  │
                                    │ (CONSIGNMENT)   │
                                    └────────┬────────┘
                                             │
              ┌──────────────────────────────┼──────────────────────────────┐
              │                              │                              │
              ▼                              ▼                              ▼
    ┌─────────────────┐           ┌─────────────────┐           ┌─────────────────┐
    │   Work Order    │           │    Shipment     │           │ Purchase Order  │
    │   (Production)  │           │(Customer Sends) │           │ (We Buy Parts)  │
    └────────┬────────┘           └────────┬────────┘           └────────┬────────┘
             │                             │                             │
             │                    ┌────────┴────────┐                    │
             │                    │                 │                    │
             │                    ▼                 ▼                    │
             │          ┌─────────────┐   ┌─────────────┐                │
             │          │Packing Slip │   │  Kit List   │                │
             │          │ (attached)  │   │ (imported)  │                │
             │          └──────┬──────┘   └──────┬──────┘                │
             │                 │                 │                       │
             │                 │    ┌────────────┘                       │
             │                 │    │ Compare                            │
             │                 ▼    ▼                                    │
             │        ┌─────────────────────┐                            │
             └───────►│ Inventory Receipts  │◄───────────────────────────┘
                      │ (transactions)      │
                      └─────────────────────┘
                                │
                                ▼
                      ┌─────────────────────┐
                      │ Discrepancy Report  │
                      │ (sent to customer)  │
                      └─────────────────────┘
```

---

### Phase 4: Lot & Location Tracking (Shop Floor Visibility)

Enable operators to find specific reels/lots and their physical locations. Required for shop floor operations.

#### 4.1 Locations Module (~3 hours)

**Purpose:** Track physical storage locations (warehouse, zones, aisles, shelves, bins, floor areas).

**Schema:**
```sql
CREATE TABLE locations (
  id UUID PRIMARY KEY,
  location_code VARCHAR(50) UNIQUE NOT NULL,  -- e.g., "WH1-A-01-03-B"
  location_type VARCHAR(20) NOT NULL,  -- WAREHOUSE, ZONE, AISLE, SHELF, BIN, FLOOR
  parent_id UUID REFERENCES locations(id),  -- Hierarchical structure
  name VARCHAR(100),
  description TEXT,
  is_pickable BOOLEAN DEFAULT true,  -- Can items be picked from here?
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for hierarchy traversal
CREATE INDEX idx_locations_parent ON locations(parent_id);
CREATE INDEX idx_locations_type ON locations(location_type);

-- Example data:
-- WH1 (WAREHOUSE) → WH1-A (ZONE) → WH1-A-01 (AISLE) → WH1-A-01-03 (SHELF) → WH1-A-01-03-B (BIN)
-- FLOOR-PROD (FLOOR) - Production floor WIP area
```

**Endpoints:**
- `GET /locations` - List all locations (tree or flat)
- `GET /locations/:id` - Get location with path
- `POST /locations` - Create location
- `PATCH /locations/:id` - Update location
- `GET /locations/:id/contents` - List all lots at this location

#### 4.2 Material Lots (Reels) Module (~4 hours)

**Purpose:** Track individual reels/lots with quantity, location, and status.

**Schema:**
```sql
CREATE TABLE material_lots (
  id UUID PRIMARY KEY,
  material_id UUID REFERENCES materials(id) NOT NULL,
  lot_number VARCHAR(50) NOT NULL,  -- Reel barcode / lot ID

  -- Current state
  location_id UUID REFERENCES locations(id),
  quantity_original DECIMAL(12,4) NOT NULL,
  quantity_remaining DECIMAL(12,4) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE',
    -- AVAILABLE: In stock, ready for use
    -- RESERVED: Allocated to an order
    -- IN_USE: On production floor (WIP)
    -- DEPLETED: Fully consumed
    -- QUARANTINE: Quality hold
    -- EXPIRED: Past expiry date

  -- Ownership (from Phase 3.0)
  owner_type VARCHAR(20) NOT NULL DEFAULT 'COMPANY',
  owner_id UUID REFERENCES customers(id),

  -- Source traceability
  shipment_id UUID REFERENCES shipments(id),
  purchase_order_line_id UUID REFERENCES purchase_order_lines(id),
  supplier_lot_number VARCHAR(100),
  manufacturer_lot_number VARCHAR(100),
  date_code VARCHAR(20),  -- e.g., "2425" = 2024 week 25

  -- Dates
  received_date DATE NOT NULL,
  expiry_date DATE,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(material_id, lot_number)
);

-- Indexes for common queries
CREATE INDEX idx_material_lots_material ON material_lots(material_id);
CREATE INDEX idx_material_lots_location ON material_lots(location_id);
CREATE INDEX idx_material_lots_status ON material_lots(status);
CREATE INDEX idx_material_lots_owner ON material_lots(owner_type, owner_id);
CREATE INDEX idx_material_lots_lot_number ON material_lots(lot_number);
```

**Endpoints:**
- `GET /lots` - List lots with filters (material_id, status, location, owner)
- `GET /lots/:id` - Get lot details with location path
- `GET /lots/by-number/:lotNumber` - Find by barcode scan
- `POST /lots` - Create lot (usually via receipt)
- `PATCH /lots/:id` - Update lot (location, status)
- `PATCH /lots/:id/move` - Move lot to new location
- `POST /lots/:id/adjust` - Adjust quantity (cycle count)

#### 4.3 Link Inventory Transactions to Lots (~2 hours)

**Migration:** Add proper FK constraints to existing columns.

```sql
-- Add FKs to pre-wired columns
ALTER TABLE inventory_transactions
ADD CONSTRAINT fk_inventory_transactions_location
FOREIGN KEY (location_id) REFERENCES locations(id);

ALTER TABLE inventory_transactions
ADD CONSTRAINT fk_inventory_transactions_lot
FOREIGN KEY (lot_id) REFERENCES material_lots(id);

-- Update allocations to support lot-specific reservations
ALTER TABLE inventory_allocations
ADD CONSTRAINT fk_inventory_allocations_lot
FOREIGN KEY (lot_id) REFERENCES material_lots(id);
```

**Service Changes:**
- Receipts create `material_lots` records
- Consumption transactions decrement `lot.quantity_remaining`
- Lot movements create MOVE transactions

#### 4.4 Shop Floor Lookup Service (~2 hours)

**Purpose:** Simple queries for operators to find materials.

**Service:**
```typescript
interface ReelSearchResult {
  ipn: string;
  description: string;
  total_available: number;
  reels: Array<{
    lot_number: string;
    quantity_remaining: number;
    location_code: string;
    location_path: string;  // "Warehouse 1 > Zone A > Shelf 3 > Bin B"
    status: string;
    owner: string;  // "COMPANY" or customer name
    work_order?: string;  // If IN_USE
  }>;
}

async findReelsByIPN(
  ipn: string,
  options?: {
    excludeLotId?: string;  // "Find another reel"
    ownerType?: string;
    ownerId?: string;
    statusFilter?: string[];
  }
): Promise<ReelSearchResult>;

async findLotByBarcode(lotNumber: string): Promise<LotDetails>;

async getLocationContents(locationId: string): Promise<LotSummary[]>;
```

**Endpoints:**
- `GET /shop-floor/search?ipn=XXX` - Find reels by IPN
- `GET /shop-floor/scan/:barcode` - Scan reel barcode
- `GET /shop-floor/location/:code` - What's at this location?

#### 4.5 Operator Lookup UI (~3 hours)

**Purpose:** Simple, touch-friendly interface for shop floor.

**Features:**
- Large search box (barcode scanner compatible)
- Quick results showing reel locations
- Visual indicators: ✅ In Stock, ⚠️ In Use, 🔒 Reserved, ❌ Depleted
- Location path breadcrumbs
- Owner badge (Company vs Customer name)

**UI Mockup:**
```
┌─────────────────────────────────────────────────────────────┐
│  🔍 FIND MATERIAL                              [Scan Mode] │
│  ┌─────────────────────────────────────────────┐           │
│  │ RES-10K-0402                                │ [Search]  │
│  └─────────────────────────────────────────────┘           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  10K Resistor 0402 5%                                       │
│  Total Available: 8,500 units (3 reels)                     │
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ 📦 REEL-2024-001                                        ││
│  │    4,500 remaining                                      ││
│  │    📍 WH1 > Zone A > Aisle 3 > Shelf 2 > Bin B         ││
│  │    🏢 Company Stock                         ✅ Available ││
│  └─────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────┐│
│  │ 📦 REEL-2024-003                                        ││
│  │    2,800 remaining                                      ││
│  │    📍 WH1 > Zone A > Aisle 3 > Shelf 2 > Bin C         ││
│  │    👤 Customer: Acme Corp                   ✅ Available ││
│  └─────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────┐│
│  │ 🔧 REEL-2024-007                                        ││
│  │    1,200 remaining                                      ││
│  │    📍 Production Floor - Line 2                         ││
│  │    👤 Customer: Acme Corp      ⚠️ In Use (WO-2024-042) ││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### Phase 4 Implementation Order

| Step | Component | Dependencies | Effort |
|------|-----------|--------------|--------|
| 4.1 | Locations module | None | 3 hrs |
| 4.2 | Material Lots module | 4.1 | 4 hrs |
| 4.3 | Link inventory transactions | 4.1, 4.2 | 2 hrs |
| 4.4 | Shop floor lookup service | 4.2 | 2 hrs |
| 4.5 | Operator lookup UI | 4.4 | 3 hrs |

**Total Phase 4 Effort:** ~14 hours (backend + frontend)

#### Phase 4 Prerequisites

| Prerequisite | Reason |
|--------------|--------|
| Phase 3.0 (Ownership) | Lots need owner_type/owner_id |
| Phase 3.3 (Shipments) | Lots link to shipments for traceability |
| Phase 3.1 (Purchase Orders) | Lots link to PO lines for purchased materials |

#### Lot Lifecycle Flow

```
Receipt (PO or Shipment)
         │
         ▼
   ┌───────────┐
   │ AVAILABLE │ ◄─────────────────────────────────┐
   │ (in stock)│                                   │
   └─────┬─────┘                                   │
         │                                         │
         │ Allocate to order                       │ Return from floor
         ▼                                         │
   ┌───────────┐                                   │
   │ RESERVED  │                                   │
   └─────┬─────┘                                   │
         │                                         │
         │ Issue to work order                     │
         ▼                                         │
   ┌───────────┐      Partial use                  │
   │  IN_USE   │ ─────────────────────────────────►│
   │(on floor) │                                   │
   └─────┬─────┘                                   │
         │                                         │
         │ Fully consumed                          │
         ▼                                         │
   ┌───────────┐                                   │
   │ DEPLETED  │                                   │
   └───────────┘                                   │
```

---

### Phase 5: Quoting Module (Vendor Pricing Integration)

**Purpose:** Extract pricing, availability, and specifications from major electronic component distributors to create competitive quotes.

**Supported Vendors:**
| Vendor | API | Key Features |
|--------|-----|--------------|
| **Digi-Key** | ✅ developer.digikey.com | Product search, price breaks, stock, specs, MSL |
| **Mouser** | ✅ api.mouser.com | Search API, pricing, availability |
| **Arrow** | ✅ developers.arrow.com | Pricing, inventory, specs |

#### 5.1 Vendor Master Table (~1 hour)

```sql
CREATE TABLE vendors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(20) UNIQUE NOT NULL,    -- 'DIGIKEY', 'MOUSER', 'ARROW'
  name VARCHAR(100) NOT NULL,
  api_base_url VARCHAR(255),
  api_key_env_var VARCHAR(50),         -- env var name storing API key
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Seed data
INSERT INTO vendors (code, name, api_base_url, api_key_env_var) VALUES
  ('DIGIKEY', 'Digi-Key Electronics', 'https://api.digikey.com', 'DIGIKEY_API_KEY'),
  ('MOUSER', 'Mouser Electronics', 'https://api.mouser.com', 'MOUSER_API_KEY'),
  ('ARROW', 'Arrow Electronics', 'https://api.arrow.com', 'ARROW_API_KEY');
```

#### 5.2 Quotes & Quote Lines Tables (~2 hours)

```sql
CREATE TYPE quote_status AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED');

CREATE TABLE quotes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quote_number VARCHAR(50) UNIQUE NOT NULL,
  order_id UUID REFERENCES orders(id),     -- optional link to order
  customer_id UUID REFERENCES customers(id),
  status quote_status DEFAULT 'DRAFT',
  notes TEXT,
  valid_until TIMESTAMP,
  created_by VARCHAR(100),                 -- actor who created quote
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE quote_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL,
  material_id UUID REFERENCES materials(id),
  vendor_id UUID REFERENCES vendors(id),

  -- Part identification
  vendor_part_number VARCHAR(100),
  manufacturer_pn VARCHAR(100) NOT NULL,
  manufacturer VARCHAR(100),
  description TEXT,

  -- Specifications
  msl_level VARCHAR(10),                   -- '1', '2', '2a', '3', '4', '5', '5a', '6'
  datasheet_url VARCHAR(500),

  -- Pricing (price breaks as JSONB)
  price_breaks JSONB NOT NULL DEFAULT '[]',
  -- Format: [{"qty": 1, "unit_price": 0.50}, {"qty": 100, "unit_price": 0.42}, ...]

  -- Selected pricing
  selected_qty INTEGER,
  selected_unit_price DECIMAL(12,6),
  extended_price DECIMAL(14,2) GENERATED ALWAYS AS (selected_qty * selected_unit_price) STORED,

  -- Availability
  stock_available INTEGER,
  lead_time_days INTEGER,

  -- Metadata
  fetched_at TIMESTAMP,                    -- when pricing was retrieved
  created_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(quote_id, line_number)
);

CREATE INDEX idx_quote_lines_quote ON quote_lines(quote_id);
CREATE INDEX idx_quote_lines_material ON quote_lines(material_id);
CREATE INDEX idx_quotes_customer ON quotes(customer_id);
CREATE INDEX idx_quotes_status ON quotes(status);
```

#### 5.3 Vendor Price Cache (~1 hour)

**Purpose:** Avoid rate limits and improve response time by caching vendor API responses.

```sql
CREATE TABLE vendor_price_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_id UUID NOT NULL REFERENCES vendors(id),
  manufacturer_pn VARCHAR(100) NOT NULL,

  -- Full API response stored for flexibility
  response_data JSONB NOT NULL,

  -- Extracted key fields for quick access
  unit_price_1 DECIMAL(12,6),              -- price at qty 1
  stock_available INTEGER,
  msl_level VARCHAR(10),

  fetched_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,

  UNIQUE(vendor_id, manufacturer_pn)
);

CREATE INDEX idx_vendor_cache_mpn ON vendor_price_cache(manufacturer_pn);
CREATE INDEX idx_vendor_cache_expires ON vendor_price_cache(expires_at);
```

#### 5.4 Vendor API Integration Service (~8-12 hours)

**Interface:**
```typescript
// src/modules/quoting/interfaces/vendor-api.interface.ts
export interface PriceBreak {
  qty: number;
  unitPrice: number;
}

export interface VendorPriceResult {
  vendorPartNumber: string;
  manufacturerPn: string;
  manufacturer: string;
  description: string;
  mslLevel?: string;
  priceBreaks: PriceBreak[];
  stockAvailable: number;
  leadTimeDays?: number;
  datasheetUrl?: string;
  packaging?: string;              // 'Tape & Reel', 'Cut Tape', 'Tube', etc.
}

export interface VendorApiService {
  getVendorCode(): string;
  searchByMpn(manufacturerPn: string): Promise<VendorPriceResult[]>;
  searchByKeyword(keyword: string, limit?: number): Promise<VendorPriceResult[]>;
  isConfigured(): boolean;         // check if API credentials are set
}
```

**Implementation pattern:**
```typescript
// src/modules/quoting/services/digikey-api.service.ts
@Injectable()
export class DigiKeyApiService implements VendorApiService {
  private readonly apiKey: string;
  private readonly clientId: string;
  private readonly baseUrl = 'https://api.digikey.com/v4';

  constructor(private readonly httpService: HttpService) {
    this.apiKey = process.env.DIGIKEY_API_KEY || '';
    this.clientId = process.env.DIGIKEY_CLIENT_ID || '';
  }

  getVendorCode(): string {
    return 'DIGIKEY';
  }

  isConfigured(): boolean {
    return !!this.apiKey && !!this.clientId;
  }

  async searchByMpn(manufacturerPn: string): Promise<VendorPriceResult[]> {
    // OAuth2 token flow + API call
    // Parse response into VendorPriceResult format
    // Extract price breaks, MSL, stock, etc.
  }
}
```

**Similar implementations for:**
- `MouserApiService`
- `ArrowApiService`

#### 5.5 Quoting Service & Controller (~4 hours)

**Service methods:**
```typescript
// src/modules/quoting/quoting.service.ts
@Injectable()
export class QuotingService {
  // Fetch pricing from all configured vendors (parallel)
  async getPricingComparison(
    manufacturerPns: string[]
  ): Promise<Map<string, VendorPriceResult[]>>;

  // Create quote from pricing comparison
  async createQuote(dto: CreateQuoteDto): Promise<Quote>;

  // Auto-select best pricing per line (lowest cost at qty)
  async autoSelectBestPricing(quoteId: string, targetQty: number): Promise<Quote>;

  // Export quote to PDF/Excel
  async exportQuote(quoteId: string, format: 'pdf' | 'xlsx'): Promise<Buffer>;
}
```

**Endpoints:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /quoting/vendors | List configured vendors |
| POST | /quoting/pricing/compare | Compare pricing across vendors |
| GET | /quoting/pricing/search | Search vendors by MPN or keyword |
| POST | /quoting | Create new quote |
| GET | /quoting | List quotes (with filters) |
| GET | /quoting/:id | Get quote details |
| PUT | /quoting/:id | Update quote |
| PUT | /quoting/:id/lines | Update quote lines |
| POST | /quoting/:id/auto-select | Auto-select best pricing |
| POST | /quoting/:id/send | Mark quote as sent |
| GET | /quoting/:id/export | Export to PDF/Excel |
| DELETE | /quoting/:id | Delete draft quote |

#### 5.6 Quoting Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│                        QUOTING WORKFLOW                         │
└─────────────────────────────────────────────────────────────────┘

1. INPUT: User provides list of manufacturer part numbers
          (from BOM, manual entry, or order materials)
                            │
                            ▼
2. FETCH: System queries all configured vendors in parallel
          ┌─────────────────┼─────────────────┐
          ▼                 ▼                 ▼
      [Digi-Key]        [Mouser]          [Arrow]
          │                 │                 │
          └─────────────────┼─────────────────┘
                            ▼
3. CACHE: Store responses (expires in 24h)
                            │
                            ▼
4. COMPARE: Present side-by-side comparison
          ┌────────────────────────────────────────────┐
          │ MPN: CAP-100UF-16V                         │
          │ ┌──────────┬──────────┬──────────┐         │
          │ │ Digi-Key │ Mouser   │ Arrow    │         │
          │ ├──────────┼──────────┼──────────┤         │
          │ │ $0.42/ea │ $0.45/ea │ $0.40/ea │ ◄── Best│
          │ │ Stock: 5K│ Stock: 2K│ Stock: 8K│         │
          │ │ LT: 0d   │ LT: 0d   │ LT: 3d   │         │
          │ └──────────┴──────────┴──────────┘         │
          └────────────────────────────────────────────┘
                            │
                            ▼
5. SELECT: User picks vendor per line (or auto-select)
                            │
                            ▼
6. QUOTE: Generate quote document with totals
          - Line items with selected vendors
          - Price break optimization
          - Lead time summary
          - Total cost
```

#### Phase 5 Implementation Order

| Step | Component | Dependencies | Effort |
|------|-----------|--------------|--------|
| 5.1 | Vendors table + migration | None | 1 hr |
| 5.2 | Quotes + quote_lines tables | 5.1 | 2 hrs |
| 5.3 | Vendor price cache | 5.1 | 1 hr |
| 5.4 | Vendor API services | 5.1, 5.3 | 8-12 hrs |
| 5.5 | Quoting service + controller | 5.2, 5.4 | 4 hrs |

**Total Phase 5 Effort:** ~16-20 hours

#### Phase 5 Prerequisites

| Prerequisite | Reason |
|--------------|--------|
| Materials table | Quote lines reference materials |
| Customers table | Quotes can be linked to customers |
| Orders table (optional) | Quotes can be linked to orders |
| Vendor API credentials | Must register at developer portals |

#### Vendor API Registration

| Vendor | Portal | Auth Method |
|--------|--------|-------------|
| Digi-Key | developer.digikey.com | OAuth2 + Client ID |
| Mouser | api.mouser.com | API Key |
| Arrow | developers.arrow.com | API Key |

**Environment variables needed:**
```env
# Digi-Key
DIGIKEY_CLIENT_ID=your_client_id
DIGIKEY_CLIENT_SECRET=your_client_secret
DIGIKEY_API_KEY=your_api_key

# Mouser
MOUSER_API_KEY=your_api_key

# Arrow
ARROW_API_KEY=your_api_key
```

---

### Phase 6: Label Printing (Dymo Integration)

**Purpose:** Print labels upon receiving inventory using existing Dymo label templates and locally-connected Dymo printers.

**Architecture:** Browser-based printing using DYMO Label Framework (JavaScript SDK). The backend provides label data; the frontend loads templates and prints.

```
┌─────────────────────────────────────────────────────────────────┐
│                     LABEL PRINTING FLOW                         │
└─────────────────────────────────────────────────────────────────┘

1. User receives inventory in frontend
                    │
                    ▼
2. Frontend calls: POST /api/inventory/receive
   Backend returns: { transactionId, materialId, qty, ... }
                    │
                    ▼
3. Frontend calls: GET /api/labels/receiving/:transactionId
   Backend returns: { ipn, mpn, qty, lot, location, barcode, ... }
                    │
                    ▼
4. Frontend uses DYMO Label Framework:
   - Load .label template file
   - Substitute fields with label data
   - Print to connected Dymo printer
                    │
                    ▼
5. Label prints on local Dymo printer
```

#### 6.1 Label Data Endpoint (~2 hours)

**Purpose:** Return structured data for label printing. Does NOT generate the label - just provides the data.

```typescript
// src/modules/labels/dto/receiving-label.dto.ts
export interface ReceivingLabelData {
  transactionId: string;
  printDate: string;

  // Material info
  internalPartNumber: string;
  manufacturerPn: string;
  manufacturer: string;
  description: string;

  // Receipt info
  quantity: number;
  lotNumber: string;           // Phase 4
  dateReceived: string;

  // Location
  locationCode: string;        // Phase 4 - e.g., 'WH1-A3-S2-B4'
  locationPath: string;        // Phase 4 - e.g., 'Warehouse 1 > Zone A > Shelf 2 > Bin 4'

  // Ownership (for consignment)
  ownerType: 'COMPANY' | 'CUSTOMER';  // Phase 3.0
  customerName?: string;

  // Barcode
  barcodeValue: string;        // lot number or transaction ID
  barcodeType: 'CODE128' | 'QR' | 'DATAMATRIX';
}
```

```typescript
// src/modules/labels/labels.controller.ts
@Controller('labels')
export class LabelsController {
  constructor(
    private readonly labelsService: LabelsService,
  ) {}

  @Get('receiving/:transactionId')
  async getReceivingLabelData(
    @Param('transactionId', ParseUUIDPipe) transactionId: string,
  ): Promise<ReceivingLabelData> {
    return this.labelsService.getReceivingLabelData(transactionId);
  }

  @Post('receiving/batch')
  async getBatchReceivingLabels(
    @Body() dto: { transactionIds: string[] },
  ): Promise<ReceivingLabelData[]> {
    return this.labelsService.getBatchReceivingLabels(dto.transactionIds);
  }

  @Get('material/:materialId')
  async getMaterialLabelData(
    @Param('materialId', ParseUUIDPipe) materialId: string,
  ): Promise<MaterialLabelData> {
    return this.labelsService.getMaterialLabelData(materialId);
  }

  @Get('lot/:lotId')
  async getLotLabelData(
    @Param('lotId', ParseUUIDPipe) lotId: string,
  ): Promise<LotLabelData> {
    return this.labelsService.getLotLabelData(lotId);
  }
}
```

```typescript
// src/modules/labels/labels.service.ts
@Injectable()
export class LabelsService {
  constructor(
    @InjectRepository(InventoryTransaction)
    private readonly transactionRepo: Repository<InventoryTransaction>,
    @InjectRepository(Material)
    private readonly materialRepo: Repository<Material>,
  ) {}

  async getReceivingLabelData(transactionId: string): Promise<ReceivingLabelData> {
    const transaction = await this.transactionRepo.findOne({
      where: { id: transactionId },
      relations: ['material', 'lot', 'lot.location'],  // Phase 4 relations
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    const material = transaction.material;
    const lot = transaction.lot;  // Phase 4

    return {
      transactionId: transaction.id,
      printDate: new Date().toISOString(),

      internalPartNumber: material.internal_part_number,
      manufacturerPn: material.manufacturer_pn || '',
      manufacturer: material.manufacturer || '',
      description: material.description || '',

      quantity: transaction.quantity,
      lotNumber: lot?.lot_number || `TXN-${transaction.id.slice(0, 8)}`,
      dateReceived: transaction.created_at.toISOString().split('T')[0],

      locationCode: lot?.location?.code || 'RECEIVING',
      locationPath: this.buildLocationPath(lot?.location),

      ownerType: transaction.owner_type || 'COMPANY',  // Phase 3.0
      customerName: transaction.customer?.name,

      barcodeValue: lot?.lot_number || transaction.id,
      barcodeType: 'CODE128',
    };
  }

  private buildLocationPath(location?: Location): string {
    if (!location) return 'Unassigned';

    const parts: string[] = [];
    let current: Location | null = location;

    while (current) {
      parts.unshift(current.name);
      current = current.parent;
    }

    return parts.join(' > ');
  }
}
```

#### 6.2 Label Templates Configuration (~1 hour)

**Purpose:** Store template mappings so the system knows which template fields to populate.

```typescript
// src/modules/labels/label-templates.config.ts
export interface LabelFieldMapping {
  templateObjectName: string;  // Name in Dymo template
  dataField: keyof ReceivingLabelData;
}

export interface LabelTemplateConfig {
  templateName: string;
  templateFile: string;        // Path to .label file
  labelType: 'RECEIVING' | 'MATERIAL' | 'LOT' | 'SHIPPING';
  fieldMappings: LabelFieldMapping[];
}

// Example configuration - user customizes to match their templates
export const DEFAULT_LABEL_TEMPLATES: LabelTemplateConfig[] = [
  {
    templateName: 'Receiving Label',
    templateFile: 'receiving.label',
    labelType: 'RECEIVING',
    fieldMappings: [
      { templateObjectName: 'IPN', dataField: 'internalPartNumber' },
      { templateObjectName: 'MPN', dataField: 'manufacturerPn' },
      { templateObjectName: 'DESC', dataField: 'description' },
      { templateObjectName: 'QTY', dataField: 'quantity' },
      { templateObjectName: 'LOT', dataField: 'lotNumber' },
      { templateObjectName: 'DATE', dataField: 'dateReceived' },
      { templateObjectName: 'LOC', dataField: 'locationCode' },
      { templateObjectName: 'OWNER', dataField: 'customerName' },
      { templateObjectName: 'BARCODE', dataField: 'barcodeValue' },
    ],
  },
];
```

#### 6.3 Frontend DYMO Integration (~3 hours)

**Purpose:** Load templates, substitute data, print to connected Dymo printers.

```typescript
// src/lib/dymo-print.service.ts
import * as dymo from 'dymojs';

export class DymoPrintService {
  private framework: any;

  async initialize(): Promise<boolean> {
    try {
      // Check if DYMO Label Framework is available
      this.framework = dymo.label.framework;
      await this.framework.init();
      return true;
    } catch (error) {
      console.error('DYMO Framework not available:', error);
      return false;
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const printers = await this.getPrinters();
      return printers.length > 0;
    } catch {
      return false;
    }
  }

  async getPrinters(): Promise<DymoPrinter[]> {
    const printers = await this.framework.getPrinters();
    return printers
      .filter((p: any) => p.isConnected)
      .map((p: any) => ({
        name: p.name,
        modelName: p.modelName,
        isConnected: p.isConnected,
        isTwinTurbo: p.isTwinTurbo,
      }));
  }

  async printReceivingLabel(
    printerName: string,
    templateContent: string,  // .label file content as XML string
    data: ReceivingLabelData,
    fieldMappings: LabelFieldMapping[],
    copies: number = 1,
  ): Promise<void> {
    // Load label from XML content
    const label = this.framework.openLabelXml(templateContent);

    // Substitute all mapped fields
    for (const mapping of fieldMappings) {
      const value = data[mapping.dataField];
      if (value !== undefined && value !== null) {
        label.setObjectText(mapping.templateObjectName, String(value));
      }
    }

    // Print specified number of copies
    for (let i = 0; i < copies; i++) {
      await label.print(printerName);
    }
  }

  async printBatchLabels(
    printerName: string,
    templateContent: string,
    dataArray: ReceivingLabelData[],
    fieldMappings: LabelFieldMapping[],
  ): Promise<void> {
    for (const data of dataArray) {
      await this.printReceivingLabel(printerName, templateContent, data, fieldMappings, 1);
    }
  }
}

interface DymoPrinter {
  name: string;
  modelName: string;
  isConnected: boolean;
  isTwinTurbo: boolean;
}
```

#### 6.4 Print Dialog Component (~2 hours)

```typescript
// React component example
interface PrintDialogProps {
  transactionId: string;
  onClose: () => void;
}

function ReceivingPrintDialog({ transactionId, onClose }: PrintDialogProps) {
  const [printers, setPrinters] = useState<DymoPrinter[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<string>('');
  const [copies, setCopies] = useState(1);
  const [labelData, setLabelData] = useState<ReceivingLabelData | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);

  useEffect(() => {
    // Load printers and label data on mount
    async function init() {
      const dymoService = new DymoPrintService();
      await dymoService.initialize();

      const availablePrinters = await dymoService.getPrinters();
      setPrinters(availablePrinters);
      if (availablePrinters.length > 0) {
        setSelectedPrinter(availablePrinters[0].name);
      }

      const data = await api.get(`/labels/receiving/${transactionId}`);
      setLabelData(data);
    }
    init();
  }, [transactionId]);

  async function handlePrint() {
    if (!selectedPrinter || !labelData) return;

    setIsPrinting(true);
    try {
      const dymoService = new DymoPrintService();
      const template = await loadTemplate('receiving.label');

      await dymoService.printReceivingLabel(
        selectedPrinter,
        template,
        labelData,
        DEFAULT_LABEL_TEMPLATES[0].fieldMappings,
        copies,
      );

      onClose();
    } catch (error) {
      console.error('Print failed:', error);
    } finally {
      setIsPrinting(false);
    }
  }

  return (
    <Dialog>
      <h2>Print Receiving Label</h2>

      {/* Preview */}
      <LabelPreview data={labelData} />

      {/* Printer selection */}
      <Select value={selectedPrinter} onChange={setSelectedPrinter}>
        {printers.map(p => (
          <Option key={p.name} value={p.name}>{p.name}</Option>
        ))}
      </Select>

      {/* Copies */}
      <Input type="number" min={1} max={100} value={copies} onChange={setCopies} />

      {/* Actions */}
      <Button onClick={handlePrint} disabled={isPrinting}>
        {isPrinting ? 'Printing...' : `Print ${copies} Label(s)`}
      </Button>
      <Button variant="secondary" onClick={onClose}>Cancel</Button>
    </Dialog>
  );
}
```

#### 6.5 Auto-Print on Receive (Optional) (~1 hour)

**Purpose:** Automatically trigger print dialog after successful receipt.

```typescript
// In receiving form component
async function handleReceive(formData: ReceiveFormData) {
  // 1. Submit receipt to backend
  const result = await api.post('/inventory/receive', formData);

  // 2. Check user preference for auto-print
  const userPrefs = await getUserPreferences();

  if (userPrefs.autoPrintOnReceive) {
    // 3. Open print dialog automatically
    openPrintDialog(result.transactionId);
  } else {
    // 3. Show success with print button
    showSuccessToast(
      'Received successfully',
      <Button onClick={() => openPrintDialog(result.transactionId)}>
        Print Label
      </Button>
    );
  }
}
```

#### Phase 6 Implementation Order

| Step | Component | Dependencies | Effort |
|------|-----------|--------------|--------|
| 6.1 | Labels module + endpoints | Phase 3.0, Phase 4 | 2 hrs |
| 6.2 | Template configuration | 6.1 | 1 hr |
| 6.3 | Frontend DYMO service | Phase 1 (Frontend) | 3 hrs |
| 6.4 | Print dialog component | 6.3 | 2 hrs |
| 6.5 | Auto-print on receive | 6.4 | 1 hr |

**Total Phase 6 Effort:** ~9 hours

#### Phase 6 Prerequisites

| Prerequisite | Reason |
|--------------|--------|
| Phase 1 (Frontend) | Print UI runs in browser |
| Phase 3.0 (Ownership) | Customer name on consignment labels |
| Phase 4 (Lots & Locations) | Lot number and location on labels |
| DYMO Label Software | Must be installed on user's workstation |
| Dymo printer | Connected via USB |
| Existing .label templates | User's templates with defined object names |

#### Supported Label Types

| Label Type | Trigger Point | Data Source |
|------------|--------------|-------------|
| **Receiving** | After inventory receipt | `inventory_transactions` + `material_lots` |
| **Material** | On demand | `materials` table |
| **Lot/Reel** | After lot creation or on demand | `material_lots` |
| **Location** | After location setup | `locations` table |
| **Shipping** | Before shipment (Phase 3.3) | `shipments` table |

#### Template Field Reference

Common Dymo template object names to map:

| Object Name | Data Field | Example Value |
|-------------|------------|---------------|
| `IPN` | internalPartNumber | `RES-10K-0402` |
| `MPN` | manufacturerPn | `RC0402FR-0710KL` |
| `DESC` | description | `10K Ohm 1% 0402` |
| `QTY` | quantity | `5000` |
| `LOT` | lotNumber | `LOT-2026-0042` |
| `DATE` | dateReceived | `2026-01-16` |
| `LOC` | locationCode | `WH1-A3-S2-B4` |
| `OWNER` | customerName | `Acme Corp` |
| `BARCODE` | barcodeValue | `LOT-2026-0042` |

**Note:** Map these to match the actual object names in your existing Dymo templates.

---

**Current Status**: Backend is ~98% complete for MVP. Frontend is ~99% complete.

**Backend (13 modules, ~122 endpoints):**
- Full CRUD for Materials, Products, Customers, Suppliers
- Complete BOM management with revisions, diffing, and copy
- Order lifecycle with automatic allocation handling
- Ledger-based inventory with bucket support (RAW/WIP/FG/IN_TRANSIT)
- **Purchase Orders module** with full lifecycle (DRAFT→SUBMITTED→CONFIRMED→RECEIVED→CLOSED)
- MRP requirements and shortage calculations **now factor in quantity_on_order**
- **Audit system with full event tracking** (tested Jan 16, 2026)
- **Receiving Inspection module** with AML validation
- **Approved Manufacturer List module** with status workflow

**Frontend (Next.js 14 + shadcn/ui):**
- Dashboard with stats cards, recent orders, shortages
- Full CRUD pages: Materials, Products, Customers, Suppliers
- Orders page with computed Material Status feature
- Purchase Orders page with line items and receiving workflow
- Inventory page with stock levels, transactions, adjustments
- MRP/Shortages page with requirements analysis
- Receiving Inspection page with validation workflow
- AML page with status workflow
- Audit Log page with filterable events
- BOM Viewer page with revision comparison/diff
- BOM Import wizard with CSV + Excel support
- BOM Validation page for comparing uploaded files against stored revisions
- Reusable DataTable component with search/pagination
- API client with TypeScript types
- Collapsible sidebar navigation, header with breadcrumbs

Architecture has been reviewed and refined:
- Unified traceability model (single source of truth)
- Documented bucket transition rules for Phase 3
- Documented allocation state semantics for stock calculations
- Ownership dimension designed for future consignment support
- **Costing foundation** (`unit_cost` captured on transactions)
- **Audit trail** (all order/inventory events tracked)
- **Four-quantity stock model** (`quantity_on_hand`, `quantity_allocated`, `quantity_available`, `quantity_on_order`)

Seed data available for testing. Frontend is feature-complete for MVP (only Settings page placeholder remains).

### Order Lifecycle Testing ✅ VERIFIED
Full end-to-end testing completed on January 13, 2026:

| Test | Result |
|------|--------|
| MRP Requirements | Shows all materials needed for order |
| Order Availability Check | Correctly identifies shortages |
| Allocate Materials | All BOM materials allocated successfully |
| PENDING → CONFIRMED | Transition successful |
| CONFIRMED → IN_PRODUCTION | Transition successful |
| IN_PRODUCTION → COMPLETED | Allocations auto-consumed |
| CONSUMPTION Transactions | Created automatically on completion |
| Cancel Order | Status changed to CANCELLED |
| Deallocate on Cancel | All allocations released |
| Invalid Transition | CANCELLED → IN_PRODUCTION rejected with error |

The allocation system supports:
- Multiple concurrent orders without overselling
- X-ray count workflow for updating inventory after production
- Automatic cleanup when orders are cancelled or completed
- Status transition validation (prevents invalid state changes)

### Architecture Review ✅ COMPLETE (January 14, 2026)

External feedback was reviewed and incorporated:

| Issue Identified | Resolution |
|-----------------|------------|
| **Dual truth sources** (material_batches + batch_inventory vs ledger) | Unified on ledger as single source of truth; `material_lots` is metadata only |
| **Bucket semantics undefined** | Added transition rules table (RAW→WIP via ISSUE_TO_WO, etc.) |
| **Allocation state math unclear** | Documented which states affect "available" vs "committed" |
| **Consignment not addressed** | Added ownership dimension design (COMPANY/CONSIGNMENT/CUSTOMER) |

Key decisions:
- `inventory_summary` is explicitly cache-only, can be rebuilt from transactions
- Bucket transitions will be enforced in service layer when Phase 3 is implemented
- Ownership dimension is designed but deferred until consignment tracking is needed

### Future-Proofing Infrastructure ✅ COMPLETE (January 15, 2026)

Schema and infrastructure added to enable future features without costly retrofitting:

#### 1. Costing Foundation
**Problem:** Cost data is temporal. If not captured at transaction time, it's lost forever.

**Solution implemented:**
- Added `unit_cost` column to `inventory_transactions` (nullable DECIMAL(12,4))
- Added `costing_method` enum to `materials` (FIFO, WEIGHTED_AVG, STANDARD, SPECIFIC)
- Added `standard_cost` column to `materials` for standard costing

**Usage:** Capture `unit_cost` on RECEIPT transactions when cost is known. Costing engine can be built later; data is preserved now.

#### 2. Audit Events System
**Problem:** Compliance and accountability require knowing who did what, when.

**Solution implemented:**
- Created `audit_events` table (append-only)
- Created `AuditModule` with `AuditService` (global, injectable anywhere)
- Wired audit emitters to Orders, BOM, and Inventory modules
- 6 API endpoints for querying audit history

**Audit Events Tracked:**
| Module | Events |
|--------|--------|
| Orders | ORDER_CREATED, ORDER_STATUS_CHANGED, ORDER_SHIPPED, ORDER_CANCELLED, ORDER_DELETED |
| BOM | BOM_REVISION_CREATED, BOM_REVISION_ACTIVATED, BOM_REVISION_DELETED |
| Inventory | INVENTORY_ADJUSTED, INVENTORY_RECEIVED, INVENTORY_CONSUMED, INVENTORY_SCRAPPED, ORDER_ALLOCATED, ORDER_DEALLOCATED |

**Audit API Endpoints:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /audit | Get recent audit events |
| GET | /audit/query | Query with filters (entity_type, actor, date range) |
| GET | /audit/entity/:type/:id | Get history for specific entity |
| GET | /audit/actor/:actor | Get events by actor |
| GET | /audit/type/:eventType | Get events by type |
| GET | /audit/stats/by-type | Get event counts by type |

#### 3. Pricing Support
**Problem:** Margin calculation requires order pricing data.

**Solution implemented:**
- Added `quoted_price` column to `orders` (nullable DECIMAL(12,2))
- Added `currency` column to `orders` (VARCHAR(3), default 'USD')

**Usage:** Capture pricing when orders are created. Margin reports can be built later.

#### 4. Allocation Reason Tracking
**Problem:** Regulatory compliance may require knowing why allocations were changed.

**Solution implemented:**
- Added `reason` column to `inventory_allocations` (nullable TEXT)

**Future Features Enabled:**
| Feature | Infrastructure Ready? | Notes |
|---------|----------------------|-------|
| FIFO Costing | ✅ Yes | `unit_cost` + timestamps enable FIFO |
| Weighted Avg Costing | ✅ Yes | `unit_cost` data available |
| Standard Costing | ✅ Yes | `standard_cost` + `costing_method` |
| Margin Reports | ✅ Yes | `quoted_price` + `unit_cost` |
| User Accountability | ✅ Yes | `actor` field in audit_events |
| E-Signatures | ⚠️ Partial | Add hash column when needed |
| Change Approval Workflows | ⚠️ Partial | Add approval tables when needed |
| Regulatory Compliance | ✅ Yes | Full audit trail in place |

### Audit System Testing ✅ VERIFIED (January 16, 2026)

All audit endpoints tested and working correctly:

| Endpoint | Test Result |
|----------|-------------|
| `GET /audit` | ✅ Returns all events (most recent first) |
| `GET /audit/entity/:type/:id` | ✅ Returns entity history |
| `GET /audit/type/:eventType` | ✅ Filters by event type |
| `GET /audit/query?filters` | ✅ Supports entity_type, event_type filters |
| `GET /audit/stats/by-type` | ✅ Returns event counts by type |
| `GET /audit/actor/:actor` | ✅ Returns events by actor |

**Events Captured During Testing:**
| Event Type | Entity Type | Verified |
|------------|-------------|----------|
| `ORDER_CREATED` | order | ✅ Captured with full order details |
| `ORDER_STATUS_CHANGED` | order | ✅ Captured old/new status transition |
| `INVENTORY_RECEIVED` | inventory_transaction | ✅ Captured with `unit_cost` field |

**Key Observations:**
- State changes correctly capture `old_value` and `new_value`
- Metadata enrichment working (order_number, bucket captured)
- `unit_cost` field recorded on inventory receipts (costing foundation)
- Events ordered chronologically (DESC by `created_at`)

### Architectural Decisions Locked In
| Decision | Rationale |
|----------|-----------|
| **Migrations-first** | No schema sync; all changes via TypeORM migrations for reproducibility |
| **Soft delete everywhere** | Records marked with `deleted_at` instead of hard delete for audit/compliance |
| **Partial unique indexes** | All unique constraints use `WHERE deleted_at IS NULL` to prevent duplicate accumulation |
| **Traceability-first design** | Supplier lot → work order → finished goods tracking from day one |
| **Append-only transactions** | Consumption and adjustment records are never modified |
| **Ledger-based inventory** | Stock derived from `inventory_transactions` table, not a mutable quantity field |
| **Stable BOM line keys** | `bom_line_key` field enables reliable diffing across revisions |
| **Single active revision source** | `products.active_bom_revision_id` is authoritative; `bom_revisions.is_active` kept in sync transactionally |
| **Four-quantity stock model** | `quantity_on_hand`, `quantity_allocated`, `quantity_available`, `quantity_on_order` for accurate MRP planning |
| **Allocation lifecycle** | Allocations auto-deallocate on cancel, auto-consume on complete |
| **Optimistic locking** | `@VersionColumn()` on allocations prevents race conditions |
| **Inventory dimensions** | Schema pre-wired for location, lot, bucket; nullable columns enable phased adoption |
| **Lot-level tracking (Phase 4)** | Individual reels tracked via `material_lots` table with location, status, and ownership |
| **Hierarchical locations (Phase 4)** | Self-referential `locations` table supports Warehouse > Zone > Aisle > Shelf > Bin structure |
| **Bucket-based inventory** | RAW/WIP/FG/IN_TRANSIT buckets distinguish material state without separate tables |
| **Single source of truth** | Ledger (`inventory_transactions`) is the only truth; `inventory_summary` is cache only |
| **Ownership dimension (Phase 3.0)** | COMPANY/CUSTOMER owner types on inventory prevent cross-customer contamination; CRITICAL for consignment |
| **Capture cost at transaction time** | `unit_cost` on transactions enables FIFO costing without data loss |
| **Append-only audit events** | All significant state changes emit audit events for compliance and accountability |
| **Global audit service** | AuditService is globally injectable; any module can emit audit events without explicit imports |
| **Fail-fast env validation** | Missing required config (DATABASE_URL) fails immediately on startup with clear error message |
| **Health check endpoints** | `/health`, `/health/live`, `/health/ready` for load balancers, K8s probes, and monitoring |
| **Vendor price caching (Phase 5)** | Cache API responses to avoid rate limits; 24h expiry; stale-while-revalidate pattern |
| **JSONB price breaks (Phase 5)** | Store variable-length price tiers in JSONB rather than separate table; vendor APIs return different tier counts |
| **Browser-based label printing (Phase 6)** | DYMO Label Framework runs in browser; backend provides data only, not label generation |
| **Template field mapping (Phase 6)** | Configurable mapping between Dymo template object names and label data fields; supports user's existing templates |
| **PO status workflow** | DRAFT→SUBMITTED→CONFIRMED→PARTIALLY_RECEIVED→RECEIVED→CLOSED; only open POs (SUBMITTED/CONFIRMED/PARTIALLY_RECEIVED) count toward quantity_on_order |
| **PO receiving creates inventory** | Receiving against PO creates inventory transaction with reference; supports partial receipts |

### Schema Refinements ✅ COMPLETE
All high-priority schema refinements have been applied:

| Migration | Status | Description |
|-----------|--------|-------------|
| Add `bom_line_key` to `bom_items` | ✅ Done | Stable identity for BOM diffing |
| Add partial unique indexes | ✅ Done | Soft delete correctness for materials, products, orders |
| Create `inventory_transactions` table | ✅ Done | Ledger model for inventory |
| Create `inventory_summary` table | Deferred | Optional cache; not needed at MVP scale |
| Add inventory dimensions | ✅ Done | Phase 1: location_id, lot_id, bucket columns (nullable) |

---

## Concurrency & Multi-User Support

### Current State: ✅ MVP-Ready

The architecture supports concurrent users with the following safeguards already in place:

| Feature | Implementation | Protection |
|---------|---------------|------------|
| **Optimistic Locking** | `@VersionColumn()` on `inventory_allocations` | Prevents lost updates on same record |
| **Database Transactions** | `dataSource.transaction()` in allocation ops | Atomic multi-step operations |
| **Partial Unique Index** | `(material_id, order_id) WHERE status='ACTIVE'` | Prevents duplicate allocations |
| **Unique Constraints** | `order_number`, `internal_part_number`, etc. | Database enforces uniqueness |
| **Append-Only Ledger** | Inventory transactions are INSERT-only | No update conflicts on stock |
| **PostgreSQL ACID** | Underlying database | Transaction isolation guaranteed |

### Edge Cases (Low Risk at MVP Scale)

| Scenario | Risk | Current Behavior | Impact |
|----------|------|------------------|--------|
| Simultaneous order creation | Low | Unique constraint may reject one | User retries, no data loss |
| Simultaneous allocation of same material | Medium | Could over-allocate | Planning discrepancy |
| Simultaneous edit of same allocation | Low | Optimistic lock rejects stale write | User retries, no data loss |

### Production Hardening (When Needed)

Apply these fixes when scaling to high-concurrency production (many simultaneous users):

#### 1. Database Sequence for Order Numbers
**Problem:** `generateOrderNumber()` has read-then-write race condition.

**Solution:** Use PostgreSQL sequence for guaranteed uniqueness.

```sql
-- Migration: Create sequence
CREATE SEQUENCE order_number_seq START 1;

-- Usage in service
const seq = await queryRunner.query("SELECT nextval('order_number_seq')");
const orderNumber = `ORD-${dateStr}-${seq.padStart(4, '0')}`;
```

#### 2. Pessimistic Locking for Allocations
**Problem:** `allocateForOrder()` reads available stock before transaction, allowing over-commit.

**Solution:** Use `SELECT FOR UPDATE` inside transaction.

```typescript
async allocateForOrder(orderId: string, createdBy?: string): Promise<OrderAllocationResult> {
  return await this.dataSource.transaction(async (manager) => {
    // Lock material rows to prevent concurrent allocation
    const stockLevels = await manager.query(`
      SELECT t.material_id, COALESCE(SUM(t.quantity), 0) as quantity_on_hand
      FROM inventory_transactions t
      WHERE t.material_id = ANY($1)
      GROUP BY t.material_id
      FOR UPDATE
    `, [materialIds]);

    // Lock existing allocations
    const allocations = await manager.query(`
      SELECT material_id, COALESCE(SUM(quantity), 0) as allocated
      FROM inventory_allocations
      WHERE material_id = ANY($1) AND status = 'ACTIVE'
      GROUP BY material_id
      FOR UPDATE
    `, [materialIds]);

    // Now safe to calculate available and allocate
    // ... rest of allocation logic
  });
}
```

#### 3. Retry Logic for Optimistic Lock Failures
**Problem:** Optimistic lock throws error on conflict.

**Solution:** Add retry wrapper for user-friendly handling.

```typescript
async updateAllocationWithRetry(id: string, dto: UpdateAllocationDto, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await this.updateAllocation(id, dto);
    } catch (error) {
      if (error.name === 'OptimisticLockVersionMismatchError' && attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 100 * attempt));
        continue;
      }
      throw error;
    }
  }
}
```

### Implementation Priority

| Fix | When to Implement | Effort |
|-----|-------------------|--------|
| Database sequence for orders | Before high-volume go-live | 1 hour |
| Pessimistic locking for allocations | When concurrent allocation issues reported | 2 hours |
| Retry logic | Nice-to-have for UX | 1 hour |

**Recommendation:** These hardening steps are NOT required for MVP. Implement when:
- More than 10 concurrent users regularly
- High-frequency order/allocation operations
- Users report duplicate or conflict errors

---

## Inventory System V2 Roadmap

The inventory system is designed for phased enhancement. Phase 1 is complete; subsequent phases add capabilities when needed.

### Current State (Phase 1) ✅ COMPLETE

**Schema is future-proofed** with nullable dimension columns:

```
inventory_transactions:
  - material_id (required)
  - location_id (nullable) → Phase 2: FK to locations
  - lot_id (nullable) → Phase 2: FK to material_lots
  - bucket: RAW | WIP | FG | IN_TRANSIT (default: RAW)
  - ownership_type (nullable) → Future: COMPANY | CONSIGNMENT | CUSTOMER

inventory_allocations:
  - material_id, order_id, quantity, status (existing)
  - location_id (nullable) → Phase 2: Reserve from specific location
  - lot_id (nullable) → Phase 2: Reserve specific lot/reel
  - status: ACTIVE | PICKED | ISSUED | CONSUMED | CANCELLED
  - ownership_type (nullable) → Future: Track consignment allocations separately
```

**Ownership Types (Future - Add When Needed):**
- `COMPANY` - Company-owned inventory (default)
- `CONSIGNMENT` - Customer-provided materials (don't charge for usage)
- `CUSTOMER` - Customer-specific stock (reserved for specific customer)

**Note**: Ownership dimension is documented but NOT yet in schema. Add via migration when consignment tracking becomes a priority. This avoids premature complexity while preserving the design path.

**Transaction Types Available:**
- `ADJUSTMENT`, `RECEIPT`, `CONSUMPTION`, `RETURN`, `SCRAP` (MVP)
- `MOVE`, `ISSUE_TO_WO`, `RETURN_FROM_WO`, `SHIPMENT` (Ready for Phase 3)

**Inventory Buckets:**
- `RAW` - Raw materials in stock (default)
- `WIP` - Work in progress (on production floor)
- `FG` - Finished goods
- `IN_TRANSIT` - In transit between locations

**Bucket Transition Rules (Enforce in Phase 3):**

| From Bucket | To Bucket | Via Transaction Type | Description |
|-------------|-----------|---------------------|-------------|
| RAW | WIP | `ISSUE_TO_WO` | Issue materials to production floor |
| WIP | RAW | `RETURN_FROM_WO` | Return unused materials from production |
| WIP | FG | `RECEIPT` (production) | Finished goods from production |
| WIP | SCRAP | `SCRAP` | Scrap defective WIP |
| RAW | SCRAP | `SCRAP` | Scrap raw materials |
| RAW | IN_TRANSIT | `MOVE` | Transfer out to another location |
| IN_TRANSIT | RAW | `MOVE` | Transfer in from another location |
| FG | IN_TRANSIT | `SHIPMENT` | Ship finished goods |

**Rules:**
- `RECEIPT` (from PO) always enters as `RAW`
- `CONSUMPTION` always deducts from `WIP` (materials must be issued before consumed)
- `ADJUSTMENT` can target any bucket (cycle count corrections)
- `IN_TRANSIT` must always pair with a corresponding `MOVE` transaction at destination

### Phase 2: Locations & Lots (WHEN NEEDED)

**Trigger**: When you need to track WHERE inventory is or enforce lot traceability.

**New Tables:**
```
warehouses
  - id, name, timezone, is_default

locations
  - id, warehouse_id, name
  - type: RECEIVING | STOCK | QC_HOLD | PRODUCTION | SHIPPING | SCRAP
  - is_active

material_lots
  - id, material_id, lot_code, date_code
  - supplier_id (optional)
  - received_at, expiry_at (optional)
  - attributes JSON (msl, manufacturer, etc.)
```

**Changes:**
- Add FK constraints from inventory_transactions to locations/lots
- Update stock queries to filter by location/lot
- Update receipt workflow to optionally create lots
- Receiving location → QC → Stock location flow

### Phase 3: Work Orders & Pick Lists (PRODUCTION EXECUTION)

**Trigger**: When you need formal shop floor execution, not just planning.

**New Tables:**
```
work_orders
  - id, order_id, status, quantity, started_at, completed_at

pick_lists
  - id, work_order_id, status: DRAFT | RELEASED | IN_PROGRESS | DONE
  - assigned_to (optional)

pick_list_lines
  - id, pick_list_id, material_id, allocation_id
  - qty_required, qty_picked
  - lot_id, from_location_id, from_bin_id, to_location_id
```

**Allocation Lifecycle (Full):**
```
ACTIVE → PICKED → ISSUED → CONSUMED
           ↓         ↓
      CANCELLED  CANCELLED
```

**Allocation State Semantics for Stock Calculations:**

| Status | In RAW "Available"? | Counts as "Committed"? | Where is Material? |
|--------|---------------------|------------------------|-------------------|
| ACTIVE | No (reduces available) | Yes | Still in RAW stock |
| PICKED | No | Yes | Staged for issue |
| ISSUED | No (left RAW entirely) | Yes | In WIP bucket |
| CONSUMED | No | No | Deducted from WIP |
| CANCELLED | Yes (released back) | No | Back in RAW stock |

**Stock Calculation Rules:**
```sql
-- RAW Available = RAW On-Hand - Active Allocations
-- (PICKED/ISSUED don't reduce RAW available because material has moved to staging/WIP)

-- For shortage reporting:
quantity_committed = SUM(allocations WHERE status IN ('ACTIVE', 'PICKED', 'ISSUED'))

-- For RAW available:
quantity_available = quantity_on_hand(RAW) - SUM(allocations WHERE status = 'ACTIVE')
```

**Workflows:**
1. **Picking**: Generate pick list from BOM → Pick from bins → MOVE transactions → Mark PICKED
2. **Issue to WIP**: ISSUE_TO_WO transactions → RAW@STOCK to WIP@PRODUCTION → Mark ISSUED
3. **Consume**: CONSUME transactions from WIP → Mark CONSUMED
4. **Backflush**: On WO complete, auto-consume issued materials

### Phase 4: Full WMS (BINS, SERIALS, COSTING)

**Trigger**: Multiple warehouse locations, regulatory requirements, or cost tracking.

**New Tables:**
```
bins
  - id, location_id, code, is_pickable, is_putaway, capacity

material_serials (if serial-controlled)
  - id, material_id, serial_number, lot_id
```

**Features:**
- Bin-level tracking and picking
- Serial number tracking for high-value components
- Barcode scanning integration
- Inventory costing (FIFO, weighted average)

### Invariants (Apply to All Phases)

| Rule | Enforcement |
|------|-------------|
| No negative on-hand in any dimension slice | DB constraint + service validation |
| Allocation cannot exceed available at creation | Service validation |
| Lot-controlled materials require lot_id for consumption | Service validation (Phase 2+) |
| Every state transition posts transactions | Append-only ledger |
| Optimistic locking on allocations | `@VersionColumn()` |

---

## Goal

Build the **minimum viable product** for a manufacturing ERP focused on:
1. **Order Entry** - Create orders with customer, product, quantity, and order type
2. **Material Requirements** - Calculate what materials are needed for each order
3. **Shortage Visibility** - Show what materials are missing across all orders

## Key Business Requirement: BOM Management

**Problem**: Bills of Materials (BOMs) are frequently revised through Engineering Change Orders (ECOs). Clients provide BOM updates in various formats, sometimes without notice.

**Solution**:
- Track BOM revisions with full history
- Standardized BOM import with flexible column mapping
- Import validation and preview before committing
- Clear audit trail of what changed, when, and from where

## Technology Stack

- **Backend**: NestJS (TypeScript)
- **Frontend**: Next.js (TypeScript) with App Router and Tailwind CSS
- **Database**: PostgreSQL 16 with TypeORM 0.3.x
- **Deployment**: Docker Compose

### Development Environment (Current Setup)
- **Runtime**: Node.js (v25.x dev, LTS for production)
- **Database**: PostgreSQL in Docker (WSL2 backend on Windows)
- **Backend**: Running locally (hybrid model)
- **Target Deployment**: Windows Server (Docker-based)

## Data Model (10 Tables)

### 1. products ✅ IMPLEMENTED
Final products that can be ordered.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| name | VARCHAR | Product name |
| part_number | VARCHAR | Unique product identifier |
| description | TEXT | Optional description |
| active_bom_revision_id | UUID | FK to current active BOM revision (nullable) |
| created_at | TIMESTAMP | Auto-generated |
| updated_at | TIMESTAMP | Auto-updated |
| deleted_at | TIMESTAMP | Soft delete timestamp (nullable) |

### 2. materials ✅ IMPLEMENTED
Raw materials and parts used in production.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| internal_part_number | VARCHAR | Unique internal identifier (e.g., OR4531, C70201-0.1UF) |
| description | TEXT | Component description |
| value | VARCHAR | Component value (e.g., 10K, 0.1uF, BLUE) |
| package | VARCHAR | Package size (e.g., 0402, 0805, SOT-23) |
| manufacturer | VARCHAR | Manufacturer name |
| manufacturer_part_number | VARCHAR | MPN |
| unit | VARCHAR | Unit of measure (pcs, m, etc.) - default "pcs" |
| created_at | TIMESTAMP | Auto-generated |
| updated_at | TIMESTAMP | Auto-updated |
| deleted_at | TIMESTAMP | Soft delete timestamp (nullable) |

**Note**: `internal_part_number` is the primary lookup key for BOM imports.

**Partial Unique Index**: `CREATE UNIQUE INDEX ... ON materials(internal_part_number) WHERE deleted_at IS NULL`

This pattern applies to ALL tables with soft delete + unique constraints. Without partial indexes, soft-deleted records block reuse of unique values, leading to data accumulation issues. The partial index ensures uniqueness only among active (non-deleted) records.

### 3. customers ✅ IMPLEMENTED
Customer information.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| name | VARCHAR | Company name |
| contact_person | VARCHAR | Primary contact |
| email | VARCHAR | Contact email |
| phone | VARCHAR | Contact phone |
| address | TEXT | Shipping/billing address |
| created_at | TIMESTAMP | Auto-generated |
| updated_at | TIMESTAMP | Auto-updated |

### 4. bom_revisions ✅ IMPLEMENTED
Tracks versions of BOMs for each product. Each revision is a complete snapshot.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| product_id | UUID | FK to products |
| revision_number | VARCHAR | Version identifier (e.g., "A", "B", "1.0", "1.1") |
| revision_date | DATE | When this revision was created |
| change_summary | TEXT | Description of what changed (ECO notes) |
| source | ENUM | 'MANUAL', 'IMPORT_CLIENT', 'IMPORT_INTERNAL' |
| source_filename | VARCHAR | Original filename if imported (nullable) |
| is_active | BOOLEAN | Whether this is the current active revision |
| created_at | TIMESTAMP | Auto-generated |

**Unique constraint**: (product_id, revision_number)

**Active Revision Strategy**: The system maintains two indicators of "active" revision:
1. `products.active_bom_revision_id` - **Authoritative source of truth**
2. `bom_revisions.is_active` - Denormalized for query convenience

These MUST be kept in sync transactionally. When activating a revision:
1. Set `is_active = false` on all other revisions for the product
2. Set `is_active = true` on the target revision
3. Update `products.active_bom_revision_id` to the target revision ID

All three operations happen in a single transaction. Code should read from `products.active_bom_revision_id` for authoritative state.

### 5. bom_items ✅ IMPLEMENTED
Bill of Materials line items - linked to a specific revision.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| bom_revision_id | UUID | FK to bom_revisions |
| material_id | UUID | FK to materials |
| bom_line_key | VARCHAR | Stable identity for diffing (e.g., material_id or "R1-R6" designator group) |
| line_number | INTEGER | Line item number from BOM |
| reference_designators | TEXT | Component references (e.g., "R1, R2, R3, R4, R5, R6") |
| quantity_required | DECIMAL | How many units of material per product |
| resource_type | ENUM | 'SMT', 'TH', 'MECH', 'PCB', 'DNP' |
| polarized | BOOLEAN | Whether component is polarity-sensitive |
| scrap_factor | DECIMAL | Expected waste % (default 0) |
| notes | TEXT | Optional notes |

**Note**: `reference_designators` stores the full string of designators for traceability.

**Note**: `bom_line_key` provides stable identity across revisions for diffing. Generated as `{material_id}` by default, or `{material_id}:{first_designator}` when the same material appears multiple times with different designator groups. This enables accurate "what changed" reports without relying on line numbers which shift between revisions.

### 6. bom_import_mappings
Stores column mapping configurations for different client BOM formats. Users can create new mappings when onboarding clients.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| name | VARCHAR | Mapping profile name (e.g., "Acme Corp Format") |
| customer_id | UUID | FK to customers (nullable - can be generic) |
| description | TEXT | Notes about this format |
| column_mappings | JSONB | Maps source columns to system fields |
| file_type | ENUM | 'CSV', 'XLSX', 'XLS' |
| has_header_row | BOOLEAN | Whether first row is headers |
| skip_rows | INTEGER | Number of rows to skip at start (default 0) |
| multi_row_designators | BOOLEAN | Whether designators span multiple rows (default false) |
| ignore_columns | JSONB | Array of source columns to ignore during import |
| created_at | TIMESTAMP | Auto-generated |
| updated_at | TIMESTAMP | Auto-updated |

**Example column_mappings JSONB**:
```json
{
  "internal_part_number": "Component P/N",
  "description": "Description",
  "quantity": "Qty",
  "reference_designator": "Ref Des",
  "manufacturer": "Mfr",
  "manufacturer_part_number": "MPN",
  "notes": "Comments"
}
```

### 7. orders ✅ IMPLEMENTED
Customer orders for products.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| order_number | VARCHAR | Auto-generated (ORD-YYYYMMDD-####) |
| po_number | VARCHAR | Customer Purchase Order number (e.g., PO-2500583, P17771) |
| wo_number | VARCHAR | Work Order number (e.g., BX20-583) - nullable |
| customer_id | UUID | FK to customers |
| product_id | UUID | FK to products |
| bom_revision_id | UUID | FK to bom_revisions (locked at order creation) |
| quantity | INTEGER | Number of units ordered |
| quantity_shipped | INTEGER | Number of units shipped (default 0) |
| balance | INTEGER | Remaining units to ship (computed: quantity - quantity_shipped) |
| due_date | DATE | When order is due |
| order_type | ENUM | 'TURNKEY' or 'CONSIGNMENT' |
| status | ENUM | 'PENDING', 'CONFIRMED', 'IN_PRODUCTION', 'SHIPPED', 'COMPLETED', 'CANCELLED' |
| notes | TEXT | Custom specifications |
| created_at | TIMESTAMP | Auto-generated |
| updated_at | TIMESTAMP | Auto-updated |

**Important**: `bom_revision_id` captures the BOM at order time. If the BOM is later revised, existing orders keep their original BOM.

### 8. inventory_transactions (Ledger Model)
Append-only transaction log for inventory movements. Stock is **derived** by summing transactions, not stored as a mutable field.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| material_id | UUID | FK to materials |
| transaction_type | ENUM | 'ADJUSTMENT', 'RECEIPT', 'CONSUMPTION', 'RETURN', 'SCRAP' |
| quantity | DECIMAL | Signed quantity (+/- for in/out) |
| reference_type | VARCHAR | What triggered this (e.g., 'MANUAL', 'WORK_ORDER', 'PO_RECEIPT', 'CYCLE_COUNT') |
| reference_id | UUID | FK to related record (nullable) |
| reason | TEXT | Human-readable reason for adjustment |
| created_at | TIMESTAMP | When transaction occurred |
| created_by | VARCHAR | User who made the change (nullable for MVP) |

**Why Ledger Model?**
- Aligns with "append-only transactions" principle
- Full audit trail of every stock movement
- Natural extension to batch/lot tracking later
- No "current quantity" to get out of sync
- Supports traceability: can trace any quantity change to its source

**Calculating Current Stock:**
```sql
SELECT material_id, SUM(quantity) as quantity_on_hand
FROM inventory_transactions
WHERE material_id = :id
GROUP BY material_id
```

**Performance**: For MVP scale, this query is fast. For larger scale, add a materialized view or cached `inventory_summary` table that's updated transactionally.

### 8a. inventory_allocations ✅ IMPLEMENTED
Material reservations per order. Prevents overselling when multiple orders are open simultaneously.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| material_id | UUID | FK to materials |
| order_id | UUID | FK to orders |
| quantity | DECIMAL | Reserved quantity |
| status | ENUM | 'ACTIVE', 'CONSUMED', 'CANCELLED' |
| version | INTEGER | Optimistic locking version |
| created_at | TIMESTAMP | When allocation was created |
| updated_at | TIMESTAMP | When allocation was last modified |
| consumed_at | TIMESTAMP | When allocation was consumed (nullable) |

**Partial Unique Index**: `CREATE UNIQUE INDEX ... ON inventory_allocations(material_id, order_id) WHERE status = 'ACTIVE'`

**Three-Quantity Stock Model:**
```sql
-- quantity_on_hand: Total physical inventory
SELECT SUM(quantity) FROM inventory_transactions WHERE material_id = :id

-- quantity_allocated: Reserved for orders
SELECT SUM(quantity) FROM inventory_allocations WHERE material_id = :id AND status = 'ACTIVE'

-- quantity_available: What can be allocated to new orders
quantity_available = quantity_on_hand - quantity_allocated
```

**Allocation Lifecycle:**
| Order Status Change | Allocation Action |
|---------------------|-------------------|
| → CANCELLED | `deallocateForOrder()` - Release all allocations back to available |
| → COMPLETED | `consumeAllocationsForOrder()` - Create CONSUMPTION transactions, mark as CONSUMED |
| Order deleted | `deallocateForOrder()` - Release before soft delete |

**X-Ray Count Workflow:**
When counting inventory after production:
```typescript
POST /inventory/stock/:materialId/adjust
{
  "quantity": 1500,        // New absolute count
  "reference_type": "CYCLE_COUNT",
  "reason": "X-ray count after production run"
}
// System calculates delta and creates ADJUSTMENT transaction
```

### 8b. inventory_summary (Denormalized Cache)
Optional performance optimization - cached current stock levels.

| Column | Type | Description |
|--------|------|-------------|
| material_id | UUID | FK to materials (unique, PK) |
| quantity_on_hand | DECIMAL | Current stock (sum of transactions) |
| last_transaction_id | UUID | FK to last processed transaction |
| updated_at | TIMESTAMP | When cache was last updated |

**Note**: This table is purely a cache. The `inventory_transactions` table is the source of truth. If discrepancies occur, recalculate from transactions.

### 9. bom_validations
Audit trail of BOM validation checks.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| product_id | UUID | FK to products |
| bom_revision_id | UUID | FK to bom_revisions (what we compared against) |
| source_filename | VARCHAR | Original filename |
| validated_at | TIMESTAMP | When validation was performed |
| validated_by | VARCHAR | User who performed validation (nullable for MVP) |
| result | ENUM | 'PASSED', 'FAILED' |
| total_items_checked | INTEGER | Number of line items in uploaded file |
| matched_count | INTEGER | Items that matched exactly |
| discrepancy_count | INTEGER | Items with issues |
| discrepancies | JSONB | Detailed list of discrepancies |
| notes | TEXT | Optional notes |
| created_at | TIMESTAMP | Auto-generated |

## BOM Workflows

### Two Distinct Workflows

| Workflow | Purpose | Outcome |
|----------|---------|---------|
| **Import** | Client sends new/updated BOM → Create new revision | New BOM revision created |
| **Validate** | Client sends BOM → Verify it matches our records | Pass/Fail report with discrepancies |

### Why Validation Matters

- Clients sometimes send outdated BOMs with orders
- Changes may not be communicated properly
- Catching discrepancies early prevents production errors
- Provides audit trail of what client sent vs what we have

---

## BOM Import Workflow

### Import Process

```
1. Upload File (CSV/Excel)
        ↓
2. Select/Create Column Mapping
        ↓
3. Parse & Validate
   - Match part numbers to existing materials
   - Flag unknown materials (create or skip?)
   - Validate quantities are numeric
        ↓
4. Preview Changes
   - Show what will be added/changed/removed
   - Highlight differences from previous revision
        ↓
5. Confirm & Create Revision
   - Create new bom_revision record
   - Create bom_items for all lines
   - Optionally set as active revision
```

### Handling Unknown Materials

When importing a BOM with materials not in the system, they are **automatically created** using data from the import:

| Field | Source |
|-------|--------|
| `internal_part_number` | IPN from import (required) |
| `manufacturer` | Manufacturer column if mapped |
| `manufacturer_pn` | MPN column if mapped |
| `description` | Notes column if mapped |

The preview step shows "New Materials (will be created)" in blue, and the success toast reports how many materials were created.

### Standard Fields for Import

The system expects these fields (column mapping translates source to these):

| System Field | Required | Description |
|--------------|----------|-------------|
| internal_part_number | Yes | Internal part number (e.g., OR4531, C70201-0.1UF) |
| quantity | Yes | Quantity per assembly |
| reference_designator | No | Component reference (R1, C5, U3, etc.) |
| resource_type | No | SMT, TH, MECH, PCB, DNP |
| description | No | Component description |
| manufacturer | No | Manufacturer name |
| manufacturer_part_number | No | MPN |
| value | No | Component value (e.g., 10K, 0.1uF) |
| notes | No | Line item notes |
| polarized | No | TRUE/FALSE for polarity-sensitive parts |

### Real-World BOM Format Examples

**Format A (Simple)** - One row per component:
```
INTERNAL Part Number | REOURCE TYPE | Quantity | Value | Designator | Description | Manufacturer | MPN
OR4531               | TH           | 1        |       | J2         | 164 Position...| Samtec      | PCIE-164...
OR2486               | SMT          | 6        | 3K74  | R1-R6      | Resistor...    | Stackpole   | RMCF0402...
```

**Format B (Complex)** - Designators span multiple rows:
```
Item | Quantity | Reference                    | Part        | INTERNAL P/N   | RESOURCE TYPE
3    | 110      | C1,C3,C18,C31,C32,C48,      | 0.1uF-0201  | C70201-0.1UF   | SMT
     |          | C49,C50,C51,C54,C55,C56,    |             |                |
     |          | C57,C59,C60,C65,C66,C67,    |             |                |
     |          | (continues for 110 refs)    |             |                |
4    | 8        | C1_LMX,C2pLMK,C4_LMX,...    | 100pF       | CP0402-100PF   | SMT
```

### Import Parsing Logic

**Handle multi-row designators:**
```typescript
// When parsing BOM with multi-row designators:
// 1. If row has Item # and Quantity → start new BOM line
// 2. If row has only Reference data → append to previous line's designators
// 3. Concatenate all reference designators for the line

interface ParsedBomLine {
  lineNumber: number;
  quantity: number;
  partNumber: string;
  designators: string[];  // Collected from multiple rows
  resourceType: string;
  // ...other fields
}
```

**Handle quantity formats:**
```typescript
// Parse quantities with comma separators and decimals
function parseQuantity(value: string): number {
  // "3,328" → 3328
  // "110" → 110
  // "0.5" → 0.5
  // "1,234.56" → 1234.56
  const normalized = value.replace(/,/g, '').trim();
  const parsed = parseFloat(normalized);
  if (isNaN(parsed)) {
    throw new Error(`Invalid quantity: "${value}"`);
  }
  return parsed;
}
```

**Important**: Always use `parseFloat` for quantities, never `parseInt`. The schema uses `DECIMAL` types which support fractional quantities (e.g., 0.5 meters of wire, 2.5% scrap factor). Using `parseInt` would silently truncate decimals, causing data loss.

---

## BOM Validation Workflow

### Purpose

Validate that a client-provided BOM matches what's in the system **without creating a new revision**. This catches discrepancies before they cause production issues.

### Validation Process

```
1. Upload File (CSV/Excel)
        ↓
2. Select Column Mapping & Target Product/Revision
        ↓
3. Parse & Compare Against Active BOM
        ↓
4. Generate Validation Report
   - ✅ PASS: BOMs are identical
   - ❌ FAIL: Discrepancies found
        ↓
5. Save Validation Record (audit trail)
```

### Discrepancy Types

| Type | Description | Severity |
|------|-------------|----------|
| **Missing in Upload** | Material in our BOM but not in client file | Critical |
| **Extra in Upload** | Material in client file but not in our BOM | Critical |
| **Quantity Mismatch** | Same material, different quantity | Critical |
| **Ref Des Mismatch** | Same material, different reference designator | Warning |
| **Unknown Material** | Part number in client file not in our database | Critical |

### Validation Report Output

```
BOM VALIDATION REPORT
=====================
Product: PCB Assembly Model A
Compared Against: Rev B (Active)
Validation Date: 2025-01-10
Source File: client_bom_2025.xlsx
Result: ❌ FAILED (3 discrepancies)

DISCREPANCIES:
┌─────────────────┬──────────────┬──────────────┬──────────────┐
│ Part Number     │ Issue        │ Our BOM      │ Client BOM   │
├─────────────────┼──────────────┼──────────────┼──────────────┤
│ RES-10K-0402    │ Qty Mismatch │ 20           │ 25           │
│ CAP-47UF-0805   │ Missing      │ 5            │ (not listed) │
│ IC-NEW-PART     │ Unknown      │ (not in DB)  │ 3            │
└─────────────────┴──────────────┴──────────────┴──────────────┘

MATCHED ITEMS: 15 of 18
```

### When to Use Validation vs Import

| Scenario | Use |
|----------|-----|
| Client sends updated BOM, wants us to use new version | **Import** |
| Client sends BOM with order, need to verify it matches | **Validate** |
| Received materials, want to confirm against BOM | **Validate** |
| Annual BOM audit with client | **Validate** |
| Client claims BOM hasn't changed, want to verify | **Validate** |

## Project Structure

```
erp/
├── backend/
│   ├── src/
│   │   ├── app.module.ts
│   │   ├── main.ts
│   │   ├── entities/
│   │   │   ├── product.entity.ts
│   │   │   ├── material.entity.ts
│   │   │   ├── customer.entity.ts
│   │   │   ├── bom-revision.entity.ts
│   │   │   ├── bom-item.entity.ts
│   │   │   ├── bom-import-mapping.entity.ts
│   │   │   ├── bom-validation.entity.ts
│   │   │   ├── order.entity.ts
│   │   │   ├── inventory-transaction.entity.ts
│   │   │   └── inventory-summary.entity.ts
│   │   ├── modules/
│   │   │   ├── products/
│   │   │   ├── materials/
│   │   │   ├── customers/
│   │   │   ├── bom/
│   │   │   │   ├── bom.controller.ts
│   │   │   │   ├── bom.service.ts
│   │   │   │   ├── bom-import.service.ts      # Import logic
│   │   │   │   ├── bom-import.controller.ts   # Import endpoints
│   │   │   │   ├── bom-validation.service.ts  # Validation logic
│   │   │   │   ├── bom-validation.controller.ts
│   │   │   │   └── dto/
│   │   │   ├── orders/
│   │   │   ├── inventory/
│   │   │   └── mrp/
│   │   └── database/
│   │       └── migrations/
│   ├── package.json
│   └── .env
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx                    # Dashboard
│   │   │   ├── orders/
│   │   │   │   ├── page.tsx                # Order list
│   │   │   │   └── new/page.tsx            # New order form
│   │   │   ├── products/page.tsx
│   │   │   ├── materials/page.tsx
│   │   │   ├── customers/page.tsx
│   │   │   ├── bom/
│   │   │   │   ├── page.tsx                # BOM list by product
│   │   │   │   ├── [productId]/page.tsx    # BOM revisions for product
│   │   │   │   ├── import/page.tsx         # BOM import wizard
│   │   │   │   ├── validate/page.tsx       # BOM validation wizard
│   │   │   │   ├── validations/page.tsx    # Validation history
│   │   │   │   └── mappings/page.tsx       # Manage import mappings
│   │   │   ├── inventory/page.tsx
│   │   │   └── shortages/page.tsx
│   │   ├── components/
│   │   │   ├── ui/
│   │   │   └── bom/
│   │   │       ├── BomImportWizard.tsx     # Multi-step import
│   │   │       ├── BomValidationWizard.tsx # Multi-step validation
│   │   │       ├── ColumnMapper.tsx        # Drag-drop column mapping
│   │   │       ├── ImportPreview.tsx       # Show changes before commit
│   │   │       ├── ValidationReport.tsx    # Display validation results
│   │   │       └── RevisionDiff.tsx        # Compare two revisions
│   │   ├── lib/
│   │   │   └── api.ts
│   │   └── types/
│   │       └── index.ts
│   ├── package.json
│   └── .env.local
├── docker-compose.yml
└── IMPLEMENTATION_PLAN_MVP.md
```

## API Endpoints

### Products
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /products | List all products |
| GET | /products/:id | Get single product with active BOM |
| POST | /products | Create product |
| PATCH | /products/:id | Update product |
| DELETE | /products/:id | Delete product |

### Materials
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /materials | List all materials |
| GET | /materials/:id | Get single material |
| POST | /materials | Create material |
| POST | /materials/bulk | Create multiple materials |
| PATCH | /materials/:id | Update material |
| DELETE | /materials/:id | Delete material |

### Customers
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /customers | List all customers |
| GET | /customers/:id | Get single customer |
| POST | /customers | Create customer |
| PATCH | /customers/:id | Update customer |
| DELETE | /customers/:id | Delete customer |

### BOM Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /bom/product/:productId | Get all revisions for a product |
| GET | /bom/revision/:revisionId | Get specific revision with items |
| GET | /bom/revision/:revisionId/items | Get items for a revision |
| POST | /bom/revision | Create new revision manually |
| PATCH | /bom/revision/:revisionId | Update revision metadata |
| POST | /bom/revision/:revisionId/activate | Set as active revision |
| GET | /bom/revision/:id1/diff/:id2 | Compare two revisions |

### BOM Import
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /bom/import/upload | Upload file, return parsed preview |
| POST | /bom/import/validate | Validate parsed data against materials |
| POST | /bom/import/commit | Create revision from validated import |
| GET | /bom/import/mappings | List all import mappings |
| GET | /bom/import/mappings/:id | Get specific mapping |
| POST | /bom/import/mappings | Create import mapping |
| PATCH | /bom/import/mappings/:id | Update mapping |
| DELETE | /bom/import/mappings/:id | Delete mapping |

### BOM Validation
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /bom/validate/upload | Upload file & select product, return comparison |
| POST | /bom/validate/compare | Compare parsed BOM against specific revision |
| POST | /bom/validate/save | Save validation result to history |
| GET | /bom/validations | List all validation records |
| GET | /bom/validations/:id | Get specific validation with full report |
| GET | /bom/validations/product/:productId | Get validations for a product |

### Orders
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /orders | List all orders (with filters: status, customer, product, due_date) |
| GET | /orders/:id | Get single order with BOM snapshot |
| POST | /orders | Create order (locks BOM revision) |
| PATCH | /orders/:id | Update order |
| DELETE | /orders/:id | Soft delete order (deallocates materials) |
| PATCH | /orders/:id/status | Update order status (validates transitions, handles allocations) |
| POST | /orders/:id/ship | Ship quantity (auto-completes when fully shipped) |
| POST | /orders/:id/cancel | Cancel order (deallocates all materials) |
| GET | /orders/stats | Get order statistics by status |
| GET | /orders/active | Get active orders (PENDING, CONFIRMED, IN_PRODUCTION) |

### Inventory (Ledger-Based + Allocations)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /inventory | List all materials with current stock levels (on_hand, allocated, available) |
| GET | /inventory/:materialId | Get stock level for specific material |
| GET | /inventory/:materialId/transactions | Get transaction history for material |
| POST | /inventory/transaction | Record inventory transaction (adjustment, receipt, etc.) |
| GET | /inventory/low-stock | Get materials below threshold |
| POST | /inventory/stock/:materialId/adjust | Adjust stock to absolute value (X-ray count workflow) |
| POST | /inventory/allocation | Create material allocation for an order |
| PATCH | /inventory/allocation/:id | Update allocation quantity |
| DELETE | /inventory/allocation/:id | Cancel an allocation |
| GET | /inventory/allocations/order/:orderId | Get all allocations for an order |
| GET | /inventory/allocations/material/:materialId | Get all allocations for a material |
| POST | /inventory/allocate-for-order | Allocate all BOM materials for an order |
| DELETE | /inventory/allocations/order/:orderId | Deallocate all materials for an order |
| POST | /inventory/allocation/:id/consume | Consume an allocation (create CONSUMPTION transaction) |

### MRP (Material Requirements Planning)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /mrp/order/:orderId | Get material requirements for an order |
| GET | /mrp/shortages | Get all material shortages across orders (uses available qty) |
| GET | /mrp/requirements | Get summary of all material requirements for active orders |
| GET | /mrp/order/:orderId/availability | Check material availability for specific order |

## Core Logic

### MRP Calculation

```typescript
// For each BOM item in an order's locked revision:
required_quantity = order_quantity × bom_quantity × (1 + scrap_factor / 100)

// Example:
// Order: 100 units of "PCB Assembly" using BOM Rev B
// BOM Rev B: 5 resistors per assembly, 2% scrap factor
// Required: 100 × 5 × 1.02 = 510 resistors
```

### Shortage Calculation

```typescript
// For each material across all active orders:
total_required = sum of required_quantity from all orders

// Get current stock from transaction ledger
quantity_on_hand = SUM(inventory_transactions.quantity) WHERE material_id = X

// Get allocated quantity (reserved for orders)
quantity_allocated = SUM(inventory_allocations.quantity) WHERE material_id = X AND status = 'ACTIVE'

// Available for new allocations
quantity_available = quantity_on_hand - quantity_allocated

// Shortage based on what's actually available
shortfall = total_required - quantity_available

// If shortfall > 0, material needs to be procured
```

**Note**: Shortage calculation uses `quantity_available` (not just on-hand) to account for materials already reserved by other orders. This prevents overselling when multiple orders are open simultaneously.

### BOM Revision on Order Creation

```typescript
// When creating an order:
async createOrder(dto: CreateOrderDto) {
  const product = await this.productRepo.findOne(dto.productId);

  if (!product.activeBomRevisionId) {
    throw new BadRequestException('Product has no active BOM revision');
  }

  return this.orderRepo.save({
    ...dto,
    bomRevisionId: product.activeBomRevisionId, // Lock the BOM
    orderNumber: await this.generateOrderNumber(),
    status: 'PENDING'
  });
}
```

## Implementation Steps

### Step 1: Project Setup ✅ COMPLETE
1. ✅ Create project folders (`backend/`, `frontend/`)
2. ✅ Initialize NestJS backend with TypeORM
3. ⬚ Initialize Next.js frontend with Tailwind CSS
4. ✅ Create `docker-compose.yml` with PostgreSQL
5. ✅ Configure environment variables

### Step 2: Database & Entities 🔄 IN PROGRESS (7 of 10 tables)
1. ✅ Materials entity with soft delete + partial unique index
2. ✅ Products entity with soft delete + partial unique index
3. ✅ Customers entity with soft delete
4. ✅ BomRevision entity with BomSource enum
5. ✅ BomItem entity with ResourceType enum + bom_line_key
6. ✅ Order entity with OrderType/OrderStatus enums + partial unique index
7. ✅ InventoryTransaction entity (ledger model)
8. ⬚ InventorySummary entity (optional cache - deferred)
9. ⬚ BomImportMapping entity
10. ⬚ BomValidation entity
11. ✅ All migrations generated and applied (10 migrations)
12. ✅ bom_line_key column added to bom_items
13. ✅ Partial unique indexes for soft delete tables
14. ✅ Seed script with sample data (4 customers, 20 materials, 4 products, 5 orders)

### Step 3: Backend Modules 🔄 IN PROGRESS (9 of 10 complete)
Build modules in this order:
1. ✅ **Materials** - CRUD + bulk create + restore (7 endpoints)
2. ✅ **Products** - CRUD + restore (6 endpoints)
3. ✅ **Customers** - CRUD + search + restore (6 endpoints)
4. ✅ **BOM** - Revisions, items, activation, diff, copy + audit events (15 endpoints)
5. ✅ **Inventory** - Ledger-based transactions + stock queries + allocations + audit events (18 endpoints)
6. ✅ **MRP** - Calculate requirements + shortages + availability (4 endpoints)
7. ✅ **Orders** - CRUD + status + shipping + filtering + stats + audit events (13 endpoints)
8. ✅ **Audit** - Event queries, entity history, actor history, stats (6 endpoints)
9. ✅ **Health** - Health check, liveness probe, readiness probe (3 endpoints)
10. ⬚ **BOM Import** - File parsing, validation, mapping ← **NEXT**

### Step 4: Frontend Pages
1. **Layout** - Navigation sidebar, header
2. **Dashboard** - Stats cards, recent orders
3. **Materials page** - List, create, edit (needed for BOM import)
4. **Products page** - List, create, edit
5. **Customers page** - List, create, edit
6. **BOM pages**:
   - Product BOM list (show all products with revision info)
   - Revision history for a product
   - Manual BOM editor
   - **Import wizard** (key feature)
   - Import mapping manager
7. **Inventory page** - View stock, adjust quantities
8. **Orders page** - List orders with BOM revision info
9. **New Order page** - Order form (shows active BOM revision)
10. **Shortages page** - Material shortage report

### Step 5: BOM Import Feature
1. File upload component (CSV, Excel)
2. Column mapping UI (drag-drop or dropdown)
3. Validation preview (show matched/unmatched materials)
4. Diff view (what's changing from previous revision)
5. Confirm and create revision

### Step 6: Polish
1. Loading states and error handling
2. Form validation
3. Toast notifications
4. Responsive design

## Sample Data (Based on Real-World Formats)

### Customers
| Name | Contact | Notes |
|------|---------|-------|
| TelcoBridge | - | Multiple PO formats |
| Carma | - | Assembly labor orders |
| UgoWork | - | Serial number tracking |
| ISC | - | High volume, multiple configs |

### Products (Assemblies)
| Part Number | Name | Active BOM |
|-------------|------|------------|
| 2015-90061-2A | TelcoBridge Board Rev 2A | Rev 2A |
| 2015-90132-1CA | TelcoBridge Board Rev 1CA | Rev 1CA |
| 2100-0072-1-P | ISC Controller CFG: A | Rev 1.0 |
| BB_BROOKLYN_V1_3 | Brooklyn Main Board V1.3 | Rev B |

### Materials
| Internal P/N | Description | Value | Package | Manufacturer |
|--------------|-------------|-------|---------|--------------|
| C70201-0.1UF | Capacitor, Ceramic, 0.1uF, 0201 | 0.1uF | 0201 | - |
| C50201-1UF-16V | Capacitor, Ceramic, 1uF, 16V, 0201 | 1uF | 0201 | - |
| C50402-4.7UF-6.3V | Capacitor, Ceramic, 4.7uF, 6.3V, 0402 | 4.7uF | 0402 | - |
| R0402-10K | Resistor, 10K, 1%, 0402 | 10K | 0402 | - |
| R0201-49.9R | Resistor, 49.9R, 1%, 0201 | 49.9R | 0201 | - |
| OR4531 | 164 Position Female Connector PCI Express | - | TH | Samtec |
| OR2486 | Resistor, 3K74, 1/16W, 1%, 0402 | 3K74 | 0402 | Stackpole |
| BLM15HG601SN1D | Ferrite Bead 60ohm 0402 | 60ohm | 0402 | Murata |
| 2N7002 | N-Channel MOSFET | - | SOT-23 | Various |
| 800397 | PCB Brooklyn V1.3 | - | PCB | - |

### Sample BOM (Brooklyn V1.3, Rev B)
| Line | Internal P/N | Ref Des | Qty | Resource | Polarized |
|------|--------------|---------|-----|----------|-----------|
| 1 | 800397 | BB_BROOKLYN_V1_3 | 1 | PCB | FALSE |
| 2 | C70201-0.1UF | C1,C3,C18,C31,C32... (110 total) | 110 | SMT | FALSE |
| 3 | C50201-1UF-16V | C2,C39,C58,C73... (164 total) | 164 | SMT | FALSE |
| 4 | R0402-10K | R69,R74,R75,R76... (134 total) | 134 | SMT | FALSE |
| 5 | OR4531 | J2 | 1 | TH | TRUE |
| 6 | OR4532 | J1 | 1 | TH | TRUE |
| 7 | - | (DNI items) | 126 | DNP | - |

### Sample Import Mappings

**Format A - Simple (like SAMPLE BOM.xlsx):**
```json
{
  "name": "Standard Simple BOM",
  "fileType": "XLSX",
  "hasHeaderRow": true,
  "skipRows": 0,
  "columnMappings": {
    "internal_part_number": "INTERNAL Part Number",
    "resource_type": "REOURCE TYPE",
    "quantity": "Quantity",
    "value": "Value",
    "reference_designator": "Designator",
    "description": "Description",
    "manufacturer": "Manufacturer",
    "manufacturer_part_number": "Manufacturer Part Number",
    "polarized": "POLARIZED"
  }
}
```

**Format B - Complex Multi-Row (like SAMPLE BOM (2).xlsx):**
```json
{
  "name": "Multi-Row Designator Format",
  "fileType": "XLSX",
  "hasHeaderRow": true,
  "skipRows": 0,
  "multiRowDesignators": true,
  "columnMappings": {
    "line_number": "Item",
    "quantity": "Quantity",
    "reference_designator": "Reference",
    "value": "Part",
    "internal_part_number": "INTERNAL P/N",
    "notes": "Notes",
    "resource_type": "RESOURCE TYPE",
    "polarized": "POLARIZED"
  }
}
```

**Format C - French ERP Export (like SAMPLE BOM (3).xlsx):**
```json
{
  "name": "French ERP Export Format",
  "fileType": "XLSX",
  "hasHeaderRow": true,
  "skipRows": 6,
  "columnMappings": {
    "line_number": "Item",
    "quantity": "Qté/Carte",
    "reference_designator": "Location",
    "internal_part_number": "N/P",
    "manufacturer": "Manufacturier",
    "manufacturer_part_number": "No Manufacturier",
    "description": "Description"
  },
  "ignoreColumns": ["Qté requise", "Qté allouée", "Qté manquante"]
}
```

**Note**: The French format includes MRP data (qty required, allocated, missing) which we ignore during import - we only need the BOM structure.

---

### Adding New Client Formats

The import mapping system is designed to be **self-service** and **extensible**. When onboarding a new client:

1. **Upload a sample BOM** from the client
2. **Create a new mapping** via the Mapping Manager UI:
   - Name the mapping (e.g., "Acme Corp BOM Format")
   - Optionally link it to the customer record
   - Set file type (CSV, XLSX, XLS)
   - Set header row and skip rows
   - Map each source column to a system field using drag-drop or dropdowns
   - Enable special parsing options (multi-row designators, etc.)
3. **Test the mapping** with a preview before saving
4. **Reuse the mapping** for all future imports from that client

Mappings are stored in the database (`bom_import_mappings` table), not hardcoded. Users can create, edit, duplicate, and delete mappings as needed.

**Common variations to handle:**
| Variation | How to Handle |
|-----------|---------------|
| Different column names | Map columns in `columnMappings` |
| Extra header rows | Set `skipRows` |
| Multi-row designators | Enable `multiRowDesignators` flag |
| Embedded whitespace in cells | Parser auto-normalizes |
| MRP/shortage columns | Add to `ignoreColumns` |
| Different quantity formats | Parser handles commas, decimals |
| Missing columns | Unmapped fields become null |

### Sample Inventory
| UID | Internal P/N | Qty On Hand | Package |
|-----|--------------|-------------|---------|
| 000007294 | CX70603-0.1UF | 3,328 | TR |
| 000008087 | C50402-4.7UF-6.3V | 7,221 | TR |
| 000008100 | R0402-10K | 4,375 | TR |
| 000008101 | R0402-10K | 10,000 | TR |
| 000007821 | 2N7002 | 2,790 | TR |
| 000007969 | BLM15HG601SN1D | 2,456 | TR |

### Sample Orders
| Customer | PO# | WO# | Item# | Qty | Balance | Due Date | Status |
|----------|-----|-----|-------|-----|---------|----------|--------|
| TelcoBridge | PO-2500583 | BX20-583 | 2015-90061-2A | 20 | 0 | Oct 27, 2025 | shipped |
| ISC | P17771 | - | 2100-0142-3-P CFG: A | 160 | 60 | Sep 22, 2025 | shipped |
| UgoWork | PO08623 | - | 1220-0003-02-A01 | 150 | 0 | Jun 30, 2025 | shipped |

## Success Criteria

- [ ] Can create an order with customer, product, quantity, due date, and order type
- [ ] Order captures the active BOM revision at creation time
- [ ] After creating an order, can see material requirements with quantities
- [ ] Can view shortage report showing materials needed across all orders
- [ ] Can manually adjust inventory levels
- [ ] **Can import BOM from CSV/Excel file**
- [ ] **Can create and save column mappings for different formats**
- [ ] **Can preview import changes before committing**
- [ ] **Can view BOM revision history for a product**
- [ ] **Can compare two BOM revisions (diff view)**
- [ ] **Can validate client-provided BOM against active revision**
- [ ] **Validation report shows discrepancies (missing, extra, quantity mismatch)**
- [ ] **Can view validation history for audit trail**
- [ ] Dashboard shows order count and low stock alerts
- [ ] All data persists in PostgreSQL

## What's NOT Included (Future Phases)

- User authentication/authorization
- ~~Batch/lot tracking~~ → **Now included in traceability design**
- Kitting workflow
- ~~Purchase orders~~ → **Now included in traceability design**
- ~~Suppliers~~ → **Now included in traceability design**
- NCR/quality management
- Shipment tracking
- ~~Consignment inventory separation~~ → **Ownership dimension designed, implementation deferred**
- Multi-level BOMs (sub-assemblies)
- Production workflow
- ECO approval workflow (revisions are immediate, no approval chain)

---

## Traceability Model (Design Locked In)

The design has evolved to include **full traceability from day one**. This adds complexity but avoids costly rework later.

### Single Source of Truth: The Ledger

**CRITICAL**: Stock is ALWAYS derived from `inventory_transactions`. There is no separate mutable quantity store.

- `material_lots` table tracks lot metadata (supplier lot code, date code, expiry, etc.)
- Stock per lot is derived by summing transactions with that `lot_id`
- `inventory_summary` is explicitly a **cache** that can be rebuilt from transactions

This avoids the classic ERP problem of dual truth sources becoming un-auditable.

### Additional Entities for Traceability

These tables support the traceability model and will be implemented after core CRUD is complete:

#### Supply Side
| Table | Purpose |
|-------|---------|
| `supplier_purchase_orders` | Track POs sent to suppliers |
| `supplier_po_lines` | Line items on supplier POs |
| `material_lots` | Each received lot/reel/tray with metadata (Phase 2) |

#### Manufacturing Side
| Table | Purpose |
|-------|---------|
| `work_orders` | Production work orders (Phase 3) |

#### Optional (Later)
| Table | Purpose |
|-------|---------|
| `material_serials` | Per-unit serial number tracking |

### Traceability Flow

```
Supplier PO → Receive → Material Lot → inventory_transactions (lot_id)
                                ↓
                        Work Order → CONSUMPTION transactions → Finished Goods
```

### Design Principles

- **Receiving-time traceability**: Each lot links to supplier PO, supplier lot code, and optional barcode/reel ID
- **Consumption-time traceability**: CONSUMPTION transactions are append-only (never modified)
- **Forward/backward trace**: Can trace from supplier lot → finished goods, or finished goods → supplier lot
- **Ledger is truth**: Stock queries always derive from transaction sums, never from mutable fields

---

## Next Steps After MVP

Once MVP is stable, expand in this order:
1. **ECO workflow** - Approval process for BOM changes
2. **Inventory separation** - Split company vs consignment inventory
3. ~~**Suppliers** - Track material sources~~ → Included in traceability design
4. ~~**Batch tracking** - Lot numbers and traceability~~ → Included in traceability design
5. **Users & roles** - Authentication and permissions
6. **Kitting** - Material preparation for production
7. **NCR** - Quality management
8. **Shipments** - Fulfillment and documents
9. **Serial-level traceability** - Per-unit tracking (if required)
