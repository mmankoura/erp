# Manufacturing ERP System - Implementation Plan

## Overview

Building a greenfield ERP system for manufacturing assemblies with:
- **Order dashboard** for entering new orders with customer details, product, quantity, due date, and custom specifications
- **BOM management** (1-2 level Bill of Materials)
- **Material requirement calculation** based on orders and BOMs
- **Inventory tracking** for raw materials and parts

**MVP Focus:** Core order-to-requirements workflow with PostgreSQL database from the start.

## Business Models

The system supports two distinct business relationship models that must be specified at order entry:

### 1. Turnkey Orders
- **Definition**: Company purchases all materials and completes assembly for the client
- **Material ownership**: Company owns materials until delivery
- **Pricing model**: Materials + Labor + Overhead + Markup
- **Material sourcing**: Company procures materials from suppliers
- **Inventory impact**: Materials pulled from company inventory (or purchased)
- **Purchase orders**: Generated for material procurement
- **Kitting**: Materials sourced from company warehouse inventory
- **Invoicing**: Bill customer for materials, labor, and overhead

### 2. Consignment Orders
- **Definition**: Client provides all materials; company performs assembly labor only
- **Material ownership**: Client owns materials throughout process
- **Pricing model**: Labor + Overhead + Markup (NO material costs)
- **Material sourcing**: Client ships materials directly to company
- **Inventory impact**: Consignment materials tracked separately (not company inventory)
- **Purchase orders**: NOT generated (client responsible for procurement)
- **Kitting**: Materials sourced from consignment/customer-owned inventory
- **Invoicing**: Bill customer for labor and overhead ONLY

### Order Type Selection
- **Order entry requirement**: User MUST select order type (Turnkey or Consignment) when creating order
- **Order type locked**: Cannot change order type after order is created (data integrity)
- **Material requirements**: Calculated differently based on order type
- **System behavior**: Workflows adjust automatically based on order_type field

## Technology Stack

- **Backend**: NestJS (TypeScript)
- **Frontend**: Next.js (TypeScript) with App Router and Tailwind CSS
- **Database**: PostgreSQL with TypeORM
- **Architecture**: Monorepo with backend and frontend
- **Deployment**: Docker Compose
- **ORM**: TypeORM for database migrations and entity management
- **Validation**: class-validator and class-transformer for DTOs

## Data Model

### PostgreSQL Database Tables

Each entity is stored in a PostgreSQL table:

1. **products** - Final products that can be ordered
   - Columns: id (UUID/SERIAL), name, description, unit, created_at, updated_at

2. **materials** - Raw materials and parts used in production
   - Columns: id (UUID/SERIAL), name, description, unit, reorder_level, created_at, updated_at

3. **material_batches** - Batch/lot tracking for traceability (CRITICAL for NCR)
   - Columns: id (UUID/SERIAL), batch_number (VARCHAR, unique), lot_number (VARCHAR), material_id (FK), supplier_id (FK), po_id (FK), received_quantity (DECIMAL), remaining_quantity (DECIMAL), inspection_status (ENUM: 'PENDING', 'PASSED', 'FAILED', 'QUARANTINED'), received_date, expiration_date (nullable), location (VARCHAR), quality_certificate_url (VARCHAR), notes, created_at, updated_at
   - **Purpose**: Track each physical batch/lot received from supplier
   - **Inventory tracking**: Inventory quantities reference specific batches
   - **NCR linkage**: NCRs link to specific batch_id (not just material_id)

4. **bom_items** - Bill of Materials (links products to materials with quantities)
   - Columns: id (UUID/SERIAL), product_id (FK), material_id (FK), quantity_required, scrap_factor, resource_type (ENUM: 'SMT', 'TH', 'MECH'), notes

5. **customers** - Customer information
   - Columns: id (UUID/SERIAL), name, contact_person, email, phone, address

6. **users** - **CORE REQUIREMENT** for audit trails and role-based access
   - Columns: id (UUID/SERIAL), username (VARCHAR, unique), email (VARCHAR, unique), password_hash (VARCHAR), first_name, last_name, is_active (BOOLEAN, default true), created_at, updated_at, last_login
   - **Purpose**: User authentication and identity for audit trails
   - **CRITICAL**: All NCR, kit, shipment, and transaction operations MUST reference user_id (created_by, approved_by, etc.)

7. **roles** - **CORE REQUIREMENT** for quality system separation of duties
   - Columns: id (UUID/SERIAL), name (VARCHAR, unique), description (TEXT), created_at, updated_at
   - **Predefined roles**:
     - **Admin**: Full system access, configuration
     - **Quality Manager**: Can open/close NCRs, approve use-as-is, override severity
     - **Quality Inspector**: Can open NCRs, cannot close or override
     - **Production Supervisor**: Can issue kits, manage production, cannot modify NCRs
     - **Warehouse Staff**: Can receive materials, adjust inventory, cannot access quality
     - **Sales Representative**: Can create orders/quotes, cannot access production/quality

8. **user_roles** - Many-to-many relationship between users and roles
   - Columns: id (UUID/SERIAL), user_id (FK to users), role_id (FK to roles), assigned_at, assigned_by (FK to users)
   - **Purpose**: Users can have multiple roles
   - **Audit trail**: Track who assigned role and when

9. **suppliers** - Supplier information (needed for material_batches)
   - Columns: id (UUID/SERIAL), name, contact_person, email, phone, address, payment_terms, quality_rating, created_at, updated_at

10. **orders** - Customer orders for products
   - Columns: id (UUID/SERIAL), order_number, customer_id (FK), product_id (FK), quantity, due_date, order_type (ENUM: 'TURNKEY', 'CONSIGNMENT'), custom_specifications, status, created_at

11. **material_batches** - Batch/lot tracking for traceability (CRITICAL for NCR)
   - Columns: id (UUID/SERIAL), batch_number (VARCHAR, unique), lot_number (VARCHAR), material_id (FK), supplier_id (FK), po_id (FK), received_quantity (DECIMAL), remaining_quantity (DECIMAL), inspection_status (ENUM: 'PENDING', 'PASSED', 'FAILED', 'QUARANTINED'), received_date, expiration_date (nullable), location (VARCHAR), quality_certificate_url (VARCHAR), notes, created_at, updated_at
   - **Purpose**: Track each physical batch/lot received from supplier
   - **Inventory tracking**: Inventory quantities reference specific batches
   - **NCR linkage**: NCRs link to specific batch_id (not just material_id)

12. **kits** - **First-class entities** for production kitting (CRITICAL for inventory consumption tracking)
   - Columns: id (UUID/SERIAL), kit_number (VARCHAR, unique, auto-generated: ORDER-###-SMT/TH/MECH), order_id (FK), work_order_id (FK, nullable), resource_type (ENUM: 'SMT', 'TH', 'MECH'), status (ENUM: 'PENDING', 'IN_PROGRESS', 'COMPLETE', 'ISSUED_TO_PRODUCTION', 'CONSUMED', 'CANCELLED'), location (VARCHAR), created_by (FK to users), created_at, issued_by (FK to users, nullable), issued_at (TIMESTAMP, nullable), consumed_at (TIMESTAMP, nullable), notes
   - **Purpose**: Track kitting lifecycle and inventory consumption
   - **CRITICAL**: Kit issuance triggers inventory state transition (ALLOCATED → PICKED)
   - **Status flow**: PENDING → IN_PROGRESS (materials being pulled) → COMPLETE (all materials pulled) → ISSUED_TO_PRODUCTION → CONSUMED (production finished)

13. **kit_items** - **Line items** for kits (CRITICAL for batch traceability)
   - Columns: id (UUID/SERIAL), kit_id (FK), material_id (FK), **material_batch_id (FK, REQUIRED)**, quantity_required (DECIMAL), quantity_issued (DECIMAL), quantity_returned (DECIMAL), **is_consumed (BOOLEAN, default false)**, notes
   - **Purpose**: Record which specific batches were used in each kit
   - **CRITICAL**: material_batch_id is REQUIRED (NOT NULL) - enables batch traceability for recalls
   - **Traceability chain**: Product → Kit → Kit Items → Material Batch → Supplier
   - **Inventory impact**: When kit status = 'COMPLETE', inventory transitions: ALLOCATED → PICKED for each batch

14. **batch_inventory** - Batch-level inventory tracking (replaces material-level inventory) - **SOURCE OF TRUTH**
   - Columns: id (UUID/SERIAL), batch_id (FK to material_batches, unique), inventory_type (ENUM: 'COMPANY', 'CONSIGNMENT'), customer_id (FK, nullable), order_id (FK, nullable), quantity_available, quantity_allocated, quantity_picked, quantity_quarantined, quantity_consumed, quantity_scrapped, last_updated, version (for optimistic locking)
   - **Purpose**: Track inventory at batch level (not material level) for complete traceability
   - **Invariant**: `quantity_available + quantity_allocated + quantity_picked + quantity_quarantined ≥ 0`
   - **Total remaining**: Must match material_batches.remaining_quantity

15. **inventory_transactions** - **IMMUTABLE EVENT LOG** for audit trail (NOT source of truth)
   - Columns: id (UUID/SERIAL), material_id (FK), material_batch_id (FK), inventory_type (ENUM: 'COMPANY', 'CONSIGNMENT'), customer_id (FK, nullable), order_id (FK, nullable), kit_id (FK, nullable), **ncr_id (FK, nullable)**, transaction_type (ENUM), from_state (ENUM), to_state (ENUM), quantity, reference_type (ENUM: 'ORDER', 'KIT', 'NCR', 'RECEIPT', 'ADJUSTMENT'), reference_id (UUID), created_by (user ID), created_at (timestamp, immutable), notes (text), digital_signature (hash for tamper detection)
   - **Purpose**: Audit trail ONLY - inventory table is source of truth
   - **Validation**: Transaction recorded AFTER inventory state change succeeds
   - **IMMUTABILITY**: NO UPDATE OR DELETE operations allowed (enforced by database permissions)
   - **NCR Requirement**: All NCR-related inventory changes MUST reference ncr_id (NOT NULL when reference_type = 'NCR')

**Future Enhancement Tables (Quality Management):**

11. **ncr (Non-Conformance Reports)** - Track quality issues and defects
   - Columns: id (UUID/SERIAL), ncr_number (VARCHAR, unique), **material_batch_id (FK, REQUIRED)**, material_id (FK), supplier_id (FK, nullable), order_id (FK, nullable), kit_id (FK, nullable), customer_id (FK, nullable), severity (ENUM: 'CRITICAL', 'MAJOR', 'MINOR'), status (ENUM: 'OPEN', 'UNDER_INVESTIGATION', 'CORRECTIVE_ACTION', 'CLOSED', 'REJECTED'), affected_quantity (DECIMAL), disposition (ENUM: 'SCRAP', 'REWORK', 'USE_AS_IS', 'RETURN_TO_SUPPLIER'), defect_description (TEXT), root_cause (TEXT), corrective_action (TEXT), preventive_action (TEXT), created_by (FK to users), created_at, closed_by (FK to users), closed_at
   - **CRITICAL**: material_batch_id is REQUIRED (NOT NULL) - NCR MUST link to specific batch

12. **rma (Return Merchandise Authorization)** - Track customer returns
   - Columns: id (UUID/SERIAL), rma_number, order_id (FK), **shipment_id (FK, nullable)**, customer_id (FK), product_id (FK), return_reason, status (ENUM: 'REQUESTED', 'APPROVED', 'REJECTED', 'IN_TRANSIT', 'RECEIVED', 'UNDER_INSPECTION', 'RESOLVED', 'CLOSED'), disposition (ENUM: 'REFUND', 'REPLACEMENT', 'REPAIR', 'REJECT'), ncr_id (FK, nullable, if defect found), warranty_status, requested_date, approved_date, received_date, resolved_date, created_at

**Future Enhancement Tables (Shipping & Logistics - IMMUTABLE EVENT MODEL):**

13. **shipments** - **IMMUTABLE shipment events** (snapshot of what was actually shipped)
   - Columns: id (UUID/SERIAL), shipment_number (VARCHAR, unique, auto-generated: SHIP-YYYYMMDD-####), order_id (FK), customer_id (FK), shipping_address (TEXT), billing_address (TEXT), carrier (VARCHAR), tracking_number (VARCHAR), shipping_method (VARCHAR), **shipped_by (FK to users)**, **shipped_at (TIMESTAMP, immutable)**, estimated_delivery_date, actual_delivery_date, status (ENUM: 'PENDING', 'PICKED', 'PACKED', 'SHIPPED', 'IN_TRANSIT', 'DELIVERED', 'FAILED'), **total_weight (DECIMAL)**, **total_value (DECIMAL, snapshot)**, notes, created_at, updated_at, **version (for optimistic locking)**
   - **Purpose**: Capture immutable snapshot of shipment event - what was shipped, when, by whom
   - **CRITICAL**: Once status = 'SHIPPED', record is locked and cannot be modified (except status updates for tracking)
   - **Order reference**: Links back to order, but order can be edited after shipment without affecting shipment record

14. **shipment_items** - **IMMUTABLE line items** for each shipment
   - Columns: id (UUID/SERIAL), shipment_id (FK), product_id (FK), **quantity_shipped (DECIMAL, immutable)**, **unit_price_snapshot (DECIMAL, immutable)**, **extended_price_snapshot (DECIMAL, immutable)**, **kit_id (FK, nullable)**, serial_numbers (TEXT, nullable), lot_numbers (TEXT, nullable), notes
   - **Purpose**: Record exact quantities and pricing AT THE TIME OF SHIPMENT
   - **IMMUTABILITY**: NO UPDATE OR DELETE operations allowed after shipment.status = 'SHIPPED'
   - **Price snapshot**: Captures unit price at moment of shipment (protects against later order edits)
   - **Traceability**: Links to kits used, enabling batch traceability to shipped products

15. **shipment_documents** - **IMMUTABLE documents** tied to shipment events
   - Columns: id (UUID/SERIAL), shipment_id (FK), document_type (ENUM: 'PACKING_SLIP', 'COMMERCIAL_INVOICE', 'BOL', 'CERTIFICATE_OF_CONFORMANCE', 'EXPORT_DECLARATION'), document_number (VARCHAR, unique per type), **generated_at (TIMESTAMP, immutable)**, **generated_by (FK to users)**, **document_version (INTEGER, default 1)**, file_url (VARCHAR), file_hash (VARCHAR, for tamper detection), **is_void (BOOLEAN, default false)**, void_reason (TEXT, nullable), voided_at (TIMESTAMP, nullable), voided_by (FK to users, nullable), replacement_document_id (FK to shipment_documents, nullable), notes, created_at
   - **Purpose**: Store immutable shipping documents tied to shipment event
   - **CRITICAL**: Documents are generated AT SHIPMENT and cannot be edited - only voided and replaced
   - **Versioning**: If correction needed, void original and create new version (audit trail preserved)
   - **Document types**:
     - **PACKING_SLIP**: List of items shipped with quantities (generated from shipment_items)
     - **COMMERCIAL_INVOICE**: Invoice with pricing (generated from shipment_items with price snapshots)
     - **BOL**: Bill of Lading for carrier
     - **CERTIFICATE_OF_CONFORMANCE**: Quality certificate
     - **EXPORT_DECLARATION**: For international shipments

### Key Relationships (Foreign Keys)

**Core Relationships:**
- **bom_items.product_id** → products.id (Many-to-One)
- **bom_items.material_id** → materials.id (Many-to-One)
- **orders.customer_id** → customers.id (Many-to-One)
- **orders.product_id** → products.id (Many-to-One)

**Kit Relationships (CRITICAL for Inventory Consumption & Traceability):**
- **kits.order_id** → orders.id (Many-to-One) - Which order this kit is for
- **kits.work_order_id** → work_orders.id (Many-to-One, nullable, future) - Production work order
- **kit_items.kit_id** → kits.id (Many-to-One) - Links items to kit
- **kit_items.material_id** → materials.id (Many-to-One) - Which material
- **kit_items.material_batch_id** → material_batches.id (Many-to-One, **NOT NULL**) - **CRITICAL: Which specific batch used**
- **inventory_transactions.kit_id** → kits.id (Many-to-One, nullable) - Links transaction to kit issuance/return
- **ncr.kit_id** → kits.id (Many-to-One, nullable) - If NCR found during kitting or production

**Batch Tracking (CRITICAL for Traceability):**
- **material_batches.material_id** → materials.id (Many-to-One) - Which material
- **material_batches.supplier_id** → suppliers.id (Many-to-One) - Where it came from
- **material_batches.po_id** → purchase_orders.id (Many-to-One, future)
- **batch_inventory.batch_id** → material_batches.id (One-to-One, unique) - Inventory per batch
- **batch_inventory.customer_id** → customers.id (Many-to-One, nullable) - For consignment
- **batch_inventory.order_id** → orders.id (Many-to-One, nullable) - For consignment

**Audit Trail:**
- **inventory_transactions.material_id** → materials.id (Many-to-One)
- **inventory_transactions.material_batch_id** → material_batches.id (Many-to-One) - **REQUIRED for traceability**
- **inventory_transactions.customer_id** → customers.id (Many-to-One, nullable)
- **inventory_transactions.order_id** → orders.id (Many-to-One, nullable)
- **inventory_transactions.ncr_id** → ncr.id (Many-to-One, nullable) - Links transaction to NCR

**Future Enhancement Relationships (Quality Management):**
- **ncr.material_batch_id** → material_batches.id (Many-to-One, **NOT NULL**) - **CRITICAL: NCR MUST link to batch**
- **ncr.material_id** → materials.id (Many-to-One) - Derived from batch
- **ncr.supplier_id** → suppliers.id (Many-to-One, nullable) - Derived from batch
- **ncr.order_id** → orders.id (Many-to-One, nullable) - If defect found in production
- **rma.order_id** → orders.id (Many-to-One) - Original order
- **rma.shipment_id** → shipments.id (Many-to-One, nullable) - Links to actual shipment
- **rma.customer_id** → customers.id (Many-to-One)
- **rma.product_id** → products.id (Many-to-One)
- **rma.ncr_id** → ncr.id (Many-to-One, nullable) - Links RMA to NCR if defect found

**Future Enhancement Relationships (Shipping & Logistics - IMMUTABLE EVENT MODEL):**
- **shipments.order_id** → orders.id (Many-to-One) - Links to order (order can be edited after shipment)
- **shipments.customer_id** → customers.id (Many-to-One) - Customer snapshot
- **shipment_items.shipment_id** → shipments.id (Many-to-One) - Links items to shipment
- **shipment_items.product_id** → products.id (Many-to-One) - Product shipped
- **shipment_items.kit_id** → kits.id (Many-to-One, nullable) - Traceability to kit used (enables batch traceability)
- **shipment_documents.shipment_id** → shipments.id (Many-to-One) - Documents tied to shipment event
- **shipment_documents.replacement_document_id** → shipment_documents.id (Many-to-One, nullable, self-reference) - Links voided document to replacement

## Batch Traceability Model (Critical for NCR & Recalls)

### Batch-Level Tracking

**Key Principle**: Inventory tracked at **batch level**, not material level

**Why**:
- NCRs link to specific batches (not generic materials)
- Recalls identify which batches are affected
- Supplier quality tracking per batch
- Full traceability: Finished Product → Kit → Batch → Supplier

**Data Flow**:
```
1. Material received from supplier
   → Create material_batches record (batch_number, supplier_id, received_quantity)
   → Create batch_inventory record (quantity_available = received_quantity)

2. NCR created on batch
   → NCR.material_batch_id = specific batch
   → batch_inventory.quantity_quarantined updated for THAT batch only

3. Kitting pulls from batch
   → Kit_items record which batch_id used
   → batch_inventory updated for that batch
   → Complete traceability chain established

4. Recall scenario
   → Query: Which products used batch X?
   → SELECT product FROM kits WHERE batch_id = X
   → Full list of affected products
```

### Batch Entity Relationships

```
material_batches
├── material_id → Which material type
├── supplier_id → Where it came from
├── received_quantity → How much arrived
├── remaining_quantity → How much left (calculated from batch_inventory)
├── inspection_status → PENDING/PASSED/FAILED/QUARANTINED
└── expiration_date → For time-sensitive materials

batch_inventory (one per batch)
├── batch_id → Links to specific batch
├── quantity_available → Ready to use from THIS batch
├── quantity_quarantined → NCR hold for THIS batch
└── version → Optimistic locking

inventory_transactions
├── material_batch_id → REQUIRED - which batch moved
├── ncr_id → Links NCR to batch transaction
└── digital_signature → Immutable audit
```

## Inventory State Model (Formal Specification)

### State Model: Batch-Level Stateful with Event Audit

**Source of Truth**: `batch_inventory` table (stateful quantities PER BATCH)
**Audit Trail**: `inventory_transactions` table (event log for compliance)
**Batch Metadata**: `material_batches` table (supplier, inspection status, expiration)

### Inventory States

Material quantity exists in exactly ONE state at any time:

1. **AVAILABLE** - In warehouse, ready to allocate
2. **ALLOCATED** - Reserved for specific order, not yet physically pulled
3. **PICKED** - Physically pulled and added to kit
4. **QUARANTINED** - Held due to NCR, cannot be used
5. **CONSUMED** - Used in production (removed from inventory)
6. **SCRAPPED** - Discarded due to defect/damage (removed from inventory)

### State Transition Diagram

```
RECEIVE → AVAILABLE
           ↓
       ALLOCATED (reserve for order)
           ↓
        PICKED (physical pull for kit)
           ↓
       CONSUMED (used in production)

AVAILABLE/ALLOCATED/PICKED → QUARANTINED (NCR created)
                                ↓
                    AVAILABLE (NCR closed: use-as-is)
                    CONSUMED (NCR closed: rework complete)
                    SCRAPPED (NCR closed: scrap)
                    RETURNED (NCR closed: return to supplier)
```

### Valid State Transitions

| From State | To State | Trigger | Validation |
|------------|----------|---------|------------|
| (none) | AVAILABLE | Material received | qty > 0 |
| AVAILABLE | ALLOCATED | Order confirmed | qty_available ≥ qty_requested |
| ALLOCATED | AVAILABLE | Order cancelled | Order not in production |
| ALLOCATED | PICKED | Kit created | Kitting starts |
| PICKED | ALLOCATED | Kit cancelled | Before production starts |
| PICKED | CONSUMED | Production complete | Kit closed |
| AVAILABLE | QUARANTINED | NCR created | NCR references material batch |
| ALLOCATED | QUARANTINED | NCR created | NCR references material batch |
| PICKED | QUARANTINED | NCR created | NCR references material batch |
| QUARANTINED | AVAILABLE | NCR closed: use-as-is | Engineering approval required |
| QUARANTINED | CONSUMED | NCR closed: rework complete | Rework WO complete |
| QUARANTINED | SCRAPPED | NCR closed: scrap | Disposition = scrap |
| QUARANTINED | (removed) | NCR closed: return | Disposition = return to supplier |

### Atomic State Transition Implementation

All state transitions MUST be implemented as database transactions with optimistic locking:

```typescript
async transitionInventoryState(
  materialId: string,
  quantity: number,
  fromState: InventoryState,
  toState: InventoryState,
  reference: { type: string, id: string }
) {
  return await this.dataSource.transaction(async manager => {
    // 1. Lock inventory record with optimistic locking
    const inventory = await manager.findOne(Inventory, {
      where: { material_id: materialId },
      lock: { mode: 'optimistic', version: currentVersion }
    })

    if (!inventory) throw new NotFoundException('Material not found')

    // 2. Validate transition is allowed
    if (!isValidTransition(fromState, toState)) {
      throw new InvalidStateTransitionException(
        `Cannot transition from ${fromState} to ${toState}`
      )
    }

    // 3. Check sufficient quantity in source state
    const sourceQty = inventory[`quantity_${fromState.toLowerCase()}`]
    if (sourceQty < quantity) {
      throw new InsufficientQuantityException(
        `Insufficient ${fromState} quantity: need ${quantity}, have ${sourceQty}`
      )
    }

    // 4. Perform atomic state change
    inventory[`quantity_${fromState.toLowerCase()}`] -= quantity
    inventory[`quantity_${toState.toLowerCase()}`] += quantity
    inventory.version++ // Optimistic lock

    // 5. Validate invariants
    const total = inventory.quantity_available + inventory.quantity_allocated
                + inventory.quantity_picked + inventory.quantity_quarantined
    if (total < 0) {
      throw new InvariantViolationException('Negative inventory detected')
    }

    // 6. Save inventory (will fail if version conflict)
    await manager.save(inventory)

    // 7. Record IMMUTABLE event in audit log AFTER successful state change
    const transaction = {
      material_id: materialId,
      material_batch_id: materialBatchId,
      inventory_type: inventoryType,
      from_state: fromState,
      to_state: toState,
      quantity: quantity,
      reference_type: reference.type,
      reference_id: reference.id,
      ncr_id: reference.type === 'NCR' ? reference.id : null,  // REQUIRED for NCR
      created_by: currentUser.id,
      created_at: new Date(),
      notes: reference.notes
    }

    // Generate digital signature (tamper detection)
    transaction.digital_signature = generateSignature(transaction)

    await manager.save(InventoryTransaction, transaction)

    return inventory
  })
}

// Digital signature for immutability verification
function generateSignature(transaction: InventoryTransaction): string {
  const data = [
    transaction.material_id,
    transaction.from_state,
    transaction.to_state,
    transaction.quantity,
    transaction.reference_id,
    transaction.created_by,
    transaction.created_at.toISOString()
  ].join('|')

  return crypto.createHash('sha256').update(data).digest('hex')
}
```

### Concurrency Control

**Optimistic Locking**:
- `version` column incremented on every update
- Concurrent updates detected and retried
- Prevents lost updates and race conditions

**Example**:
```sql
UPDATE inventory
SET quantity_available = quantity_available - 10,
    quantity_allocated = quantity_allocated + 10,
    version = version + 1
WHERE material_id = ?
  AND version = ?  -- Optimistic lock check
```

If version mismatch → Transaction fails → Retry with fresh data

### Invariant Enforcement

**Database Check Constraints**:
```sql
-- All quantities must be non-negative
ALTER TABLE inventory ADD CONSTRAINT positive_quantities CHECK (
  quantity_available >= 0 AND
  quantity_allocated >= 0 AND
  quantity_picked >= 0 AND
  quantity_quarantined >= 0
);

-- Consumed and scrapped are cumulative counters (always increasing)
ALTER TABLE inventory ADD CONSTRAINT cumulative_counters CHECK (
  quantity_consumed >= 0 AND
  quantity_scrapped >= 0
);
```

### Reconciliation & Validation

**Daily Reconciliation Job**:
- Sum all transactions by material and state
- Compare to current stateful quantities
- Alert if discrepancies found (should never happen if transactions are atomic)

**Query for Validation**:
```sql
-- This should always return 0 rows (no discrepancies)
SELECT
  i.material_id,
  i.quantity_available AS current_available,
  COALESCE(SUM(CASE WHEN t.to_state = 'AVAILABLE' THEN t.quantity ELSE 0 END), 0) -
  COALESCE(SUM(CASE WHEN t.from_state = 'AVAILABLE' THEN t.quantity ELSE 0 END), 0) AS calculated_available
FROM inventory i
LEFT JOIN inventory_transactions t ON i.material_id = t.material_id
GROUP BY i.material_id, i.quantity_available
HAVING i.quantity_available != calculated_available
```

### Database Constraints

- All foreign keys have ON DELETE RESTRICT to prevent orphaned records
- inventory.material_id is UNIQUE (one inventory record per material)
- orders.order_number is UNIQUE
- Auto-incrementing primary keys (SERIAL) or UUIDs
- **Optimistic locking**: version column prevents concurrent update conflicts
- **Non-negative quantities**: Check constraints on all quantity columns

**Immutability Enforcement (Regulatory Compliance):**

```sql
-- inventory_transactions table is APPEND-ONLY (no updates or deletes)
REVOKE UPDATE, DELETE ON inventory_transactions FROM app_user;
GRANT INSERT, SELECT ON inventory_transactions TO app_user;

-- NCR transactions MUST reference NCR ID
ALTER TABLE inventory_transactions ADD CONSTRAINT ncr_reference_required CHECK (
  (reference_type != 'NCR') OR (ncr_id IS NOT NULL)
);

-- Digital signature for tamper detection (hash of transaction data)
ALTER TABLE inventory_transactions ADD CONSTRAINT digital_signature_not_null CHECK (
  digital_signature IS NOT NULL
);

-- created_at is immutable (set once, never changed)
CREATE TRIGGER prevent_transaction_timestamp_change
BEFORE UPDATE ON inventory_transactions
FOR EACH ROW
EXECUTE FUNCTION prevent_update();  -- Function that raises exception
```

**Batch Traceability Constraints (Critical):**
```sql
-- material_batches.batch_number must be unique across all batches
ALTER TABLE material_batches ADD CONSTRAINT unique_batch_number UNIQUE (batch_number);

-- material_batches.remaining_quantity cannot go negative
ALTER TABLE material_batches ADD CONSTRAINT positive_remaining_quantity CHECK (
  remaining_quantity >= 0 AND remaining_quantity <= received_quantity
);

-- batch_inventory.batch_id must be unique (one inventory record per batch)
ALTER TABLE batch_inventory ADD CONSTRAINT unique_batch_inventory UNIQUE (batch_id);

-- inventory_transactions MUST reference batch_id (NOT NULL)
ALTER TABLE inventory_transactions ADD CONSTRAINT batch_id_required CHECK (
  material_batch_id IS NOT NULL
);

-- NCR MUST reference batch_id (NOT NULL) - Non-negotiable for traceability
ALTER TABLE ncr ADD CONSTRAINT ncr_batch_required CHECK (
  material_batch_id IS NOT NULL
);
```

**Kit Constraints (CRITICAL for Inventory Consumption):**
```sql
-- kit_number must be unique
ALTER TABLE kits ADD CONSTRAINT unique_kit_number UNIQUE (kit_number);

-- kit_items MUST reference batch_id for traceability (NOT NULL)
ALTER TABLE kit_items ADD CONSTRAINT kit_batch_required CHECK (
  material_batch_id IS NOT NULL
);

-- kit_items quantities must be non-negative
ALTER TABLE kit_items ADD CONSTRAINT kit_item_quantities_non_negative CHECK (
  quantity_required >= 0 AND
  quantity_issued >= 0 AND
  quantity_returned >= 0
);

-- Quantity issued cannot exceed quantity required
ALTER TABLE kit_items ADD CONSTRAINT kit_issued_within_required CHECK (
  quantity_issued <= quantity_required
);

-- Quantity returned cannot exceed quantity issued
ALTER TABLE kit_items ADD CONSTRAINT kit_returned_within_issued CHECK (
  quantity_returned <= quantity_issued
);

-- Consumed items CANNOT be returned (business rule)
ALTER TABLE kit_items ADD CONSTRAINT cannot_return_consumed_items CHECK (
  (is_consumed = false) OR (quantity_returned = 0)
);

-- Kit status transitions (enforced by application logic, not DB constraint)
-- Valid transitions:
--   PENDING → IN_PROGRESS → COMPLETE → ISSUED_TO_PRODUCTION → CONSUMED
--   Any state → CANCELLED (explicit cancellation flow)
```

**Future Enhancement Constraints (Quality Management):**
- ncr.ncr_number is UNIQUE
- rma.rma_number is UNIQUE
- **NCR system-enforced constraints**:
  - NCR status cannot be changed to CLOSED without disposition being set
  - NCR with severity = CRITICAL on an order → Order cannot be shipped (check constraint)
  - Quarantined quantity must be ≥ 0 and ≤ quantity_on_hand
  - NCR closure triggers automatic inventory adjustment based on disposition
  - **NCR.material_batch_id is NOT NULL** - Cannot create NCR without batch reference

**Future Enhancement Constraints (Shipping & Logistics - IMMUTABLE EVENT MODEL):**

```sql
-- Shipment numbers must be unique
ALTER TABLE shipments ADD CONSTRAINT unique_shipment_number UNIQUE (shipment_number);

-- Shipment items are IMMUTABLE once shipment is marked as SHIPPED
-- Enforced by application logic: before UPDATE on shipment_items, check if shipment.status = 'SHIPPED', if so, raise exception
CREATE TRIGGER prevent_shipped_item_modification
BEFORE UPDATE ON shipment_items
FOR EACH ROW
EXECUTE FUNCTION prevent_modification_if_shipped();  -- Function that checks if parent shipment.status = 'SHIPPED'

-- Shipment items CANNOT be deleted (audit trail preservation)
REVOKE DELETE ON shipment_items FROM app_user;
GRANT INSERT, SELECT, UPDATE ON shipment_items TO app_user;  -- UPDATE only allowed before shipment

-- Shipment documents are IMMUTABLE (cannot update generated_at, generated_by, document_number)
-- Only is_void, void_reason, voided_at, voided_by can be updated
CREATE TRIGGER prevent_document_modification
BEFORE UPDATE ON shipment_documents
FOR EACH ROW
EXECUTE FUNCTION prevent_document_fields_change();  -- Function that blocks changes to immutable fields

-- Shipment documents CANNOT be deleted (audit trail preservation)
REVOKE DELETE ON shipment_documents FROM app_user;
GRANT INSERT, SELECT, UPDATE ON shipment_documents TO app_user;  -- UPDATE only for voiding

-- Document numbers must be unique within each document type
ALTER TABLE shipment_documents ADD CONSTRAINT unique_document_number_per_type
  UNIQUE (document_type, document_number);

-- Voided documents MUST have void_reason
ALTER TABLE shipment_documents ADD CONSTRAINT void_reason_required_when_void CHECK (
  (is_void = false) OR (void_reason IS NOT NULL AND voided_at IS NOT NULL AND voided_by IS NOT NULL)
);

-- Shipment items MUST have positive quantity
ALTER TABLE shipment_items ADD CONSTRAINT positive_shipped_quantity CHECK (
  quantity_shipped > 0
);

-- Shipment items price snapshots MUST be non-negative
ALTER TABLE shipment_items ADD CONSTRAINT non_negative_prices CHECK (
  unit_price_snapshot >= 0 AND extended_price_snapshot >= 0
);

-- File hash is required for tamper detection
ALTER TABLE shipment_documents ADD CONSTRAINT file_hash_required CHECK (
  file_hash IS NOT NULL
);
```

**System-Enforced Shipment Workflow:**

1. **Document Generation Timing**:
   - Documents are generated when `shipment.status` transitions to 'SHIPPED'
   - Triggered by backend validation in ShipmentService.markAsShipped()
   - Packing slip generated from shipment_items (quantities only)
   - Commercial invoice generated from shipment_items with unit_price_snapshot (pricing at shipment time)

2. **Immutability Enforcement**:
   - Once `shipment.status = 'SHIPPED'`:
     - shipment_items CANNOT be modified (trigger blocks updates)
     - shipment.shipped_at, shipped_by are locked (immutable fields)
     - shipment.total_value is locked (snapshot preserved)
   - Documents CANNOT be edited, only voided and replaced
   - Document void creates audit trail: original document + void record + replacement document

3. **Post-Shipment Corrections**:
   - **Order edits after shipment**: Order can be modified, but shipment record is unchanged
   - **Pricing corrections**: Void original invoice, generate corrected invoice (new version)
   - **Quantity discrepancies**: Create credit memo or debit memo (separate document, not invoice edit)
   - **Post-shipment NCRs**: Link NCR to shipment_id, RMA references shipment_id for returns

4. **Document Versioning**:
   - If document needs correction: Set `is_void = true`, `void_reason`, `voided_at`, `voided_by`
   - Generate new document with `document_version` incremented
   - Link new document to voided document via `replacement_document_id`
   - Customer receives corrected document, audit trail shows original + void + replacement

## Architectural Controls (System-Level Enforcement)

**CRITICAL**: The following architectural boundaries are enforced to prevent distributed God-objects and ensure long-term maintainability.

### **1. Hard Service Boundaries (Module Isolation)**

**Problem**: Nothing prevents cross-domain direct mutations (Orders updating Inventory directly, NCR bypassing InventoryService).

**Solution**: NestJS module dependency enforcement - **READ-ONLY cross-domain access**.

```typescript
// backend/src/modules/inventory/inventory.module.ts
@Module({
  imports: [TypeOrmModule.forFeature([Inventory, MaterialBatch, InventoryTransaction])],
  providers: [InventoryService],
  controllers: [InventoryController],
  exports: [InventoryService]  // Only service exported, NOT repositories
})
export class InventoryModule {}

// backend/src/modules/orders/orders.module.ts
@Module({
  imports: [
    TypeOrmModule.forFeature([Order]),
    InventoryModule,  // Import service ONLY
    // ❌ FORBIDDEN: Import Inventory repositories directly
  ],
  providers: [OrdersService],
  controllers: [OrdersController]
})
export class OrdersModule {}
```

**Enforcement Rules:**
1. **Inventory mutations**: ONLY via `InventoryService` (never direct repository access from other domains)
2. **MRP**: Read-only repository access (no mutations)
3. **NCR**: Requests inventory changes via `InventoryService`, doesn't perform them
4. **Orders**: Cannot update inventory directly, must call `InventoryService.transitionState()`

**Violation Detection**: TypeScript compiler + ESLint rule:
```json
{
  "no-restricted-imports": [
    "error",
    {
      "patterns": [
        {
          "group": ["**/inventory/*.repository"],
          "message": "Inventory repositories must only be used within InventoryModule. Use InventoryService instead."
        }
      ]
    }
  ]
}
```

---

### **2. System-Level Transaction Coordinator (Application Service Layer)**

**Problem**: No architectural place for multi-step workflows. Example failure: Order confirmed → Inventory allocated → NCR auto-open fails → inconsistent state.

**Solution**: Application Service Layer that owns transactions and coordinates domain services.

**Architecture**:
```
┌─────────────────────────────────────────┐
│     Application Service Layer           │  ← Owns Transactions
│  (OrderFulfillmentService, etc.)        │
├─────────────────────────────────────────┤
│     Domain Service Layer                │  ← Business Logic
│  (OrdersService, InventoryService,      │
│   NCRService, KitService)               │
├─────────────────────────────────────────┤
│     Repository Layer                    │  ← Data Access
│  (TypeORM Repositories)                 │
└─────────────────────────────────────────┘
```

**Implementation**: Create `backend/src/application-services/` directory

**Example: Order Fulfillment Workflow**

```typescript
// backend/src/application-services/order-fulfillment.service.ts
@Injectable()
export class OrderFulfillmentService {
  constructor(
    private ordersService: OrdersService,
    private inventoryService: InventoryService,
    private ncrService: NCRService,
    private dataSource: DataSource  // For transaction management
  ) {}

  /**
   * COORDINATED WORKFLOW: Confirm order and allocate inventory
   * All-or-nothing: If NCR check fails, rollback entire operation
   */
  async confirmOrderAndAllocate(orderId: string): Promise<Order> {
    return await this.dataSource.transaction(async (manager) => {
      // Step 1: Confirm order (delegates to domain service)
      const order = await this.ordersService.confirmOrder(orderId, manager)

      // Step 2: Check for open Critical NCRs (cross-domain validation)
      const criticalNCRs = await this.ncrService.getOpenCriticalNCRs(order.id, manager)
      if (criticalNCRs.length > 0) {
        throw new BusinessRuleException(
          `Cannot confirm order with open Critical NCR: ${criticalNCRs[0].ncr_number}`
        )
      }

      // Step 3: Allocate inventory (delegates to inventory domain)
      const requirements = await this.mrpService.calculateRequirements(orderId)
      for (const req of requirements) {
        await this.inventoryService.transitionState(
          req.materialId,
          req.quantity,
          'AVAILABLE',
          'ALLOCATED',
          { type: 'ORDER', id: orderId },
          manager  // Same transaction
        )
      }

      // All steps succeeded - transaction commits
      return order
    })
  }
}
```

**Key Principles**:
- ✅ Application services OWN transactions (not domain services)
- ✅ Domain services are STATELESS and accept `EntityManager` for transactions
- ✅ Failure in ANY step = ROLLBACK entire workflow
- ✅ No domain service directly calls another domain service (only via application service)

**Application Services to Create**:
1. `OrderFulfillmentService` - Confirm order + allocate inventory
2. `KitIssuanceService` - Create kit + transition inventory AVAILABLE → PICKED
3. `NCRWorkflowService` - Create NCR + quarantine inventory + notify stakeholders
4. `ShipmentProcessingService` - Mark shipped + generate documents + validate NCRs

---

### **3. Centralized Inventory State Arbiter (Single Source of Truth)**

**Problem**: Inventory state is distributed across domains (NCR quarantines, Kits consume, Logistics moves) with no single arbiter.

**Solution**: InventoryService is the ONLY authority for state transitions.

**Architecture**:
```
┌───────────────────────────────────────────────┐
│         InventoryService                      │
│  (SINGLE ARBITER - All mutations go here)    │
├───────────────────────────────────────────────┤
│  transitionState(material, qty, from, to)    │ ← ONLY method that changes state
│  • Validates transition is allowed            │
│  • Checks business rules                      │
│  • Creates immutable transaction log          │
│  • Returns success/failure                    │
└───────────────────────────────────────────────┘
         ▲           ▲           ▲
         │           │           │
    ┌────┴────┐  ┌──┴───┐  ┌───┴────┐
    │  Orders │  │ NCR  │  │  Kits  │  ← Request transitions, don't perform
    └─────────┘  └──────┘  └────────┘
```

**Implementation**:

```typescript
// backend/src/modules/inventory/inventory.service.ts
@Injectable()
export class InventoryService {

  /**
   * SINGLE POINT OF CONTROL for ALL inventory state transitions
   * No other service can mutate inventory state directly
   */
  async transitionState(
    materialId: string,
    quantity: number,
    fromState: InventoryState,
    toState: InventoryState,
    reference: { type: string, id: string },
    transactionManager?: EntityManager  // Optional for coordinated workflows
  ): Promise<void> {
    const manager = transactionManager || this.dataSource.createEntityManager()

    return await manager.transaction(async (txManager) => {
      // 1. Lock inventory record
      const inventory = await txManager.findOne(Inventory, {
        where: { material_id: materialId },
        lock: { mode: 'pessimistic_write' }  // Prevent concurrent modifications
      })

      // 2. Validate transition is allowed (state machine)
      if (!this.isValidTransition(fromState, toState)) {
        throw new InvalidStateTransitionException(
          `Cannot transition from ${fromState} to ${toState}`
        )
      }

      // 3. Apply business rules (this is WHERE enforcement happens)
      this.applyBusinessRules(inventory, fromState, toState, quantity, reference)

      // 4. Perform atomic state change
      inventory[`quantity_${fromState.toLowerCase()}`] -= quantity
      inventory[`quantity_${toState.toLowerCase()}`] += quantity

      // 5. Validate invariants
      this.validateInvariants(inventory)

      // 6. Save (pessimistic lock ensures no race conditions)
      await txManager.save(inventory)

      // 7. Create immutable audit event
      await txManager.save(InventoryTransaction, {
        material_id: materialId,
        from_state: fromState,
        to_state: toState,
        quantity,
        reference_type: reference.type,
        reference_id: reference.id,
        created_at: new Date()
      })
    })
  }

  /**
   * Business rules enforced HERE (not scattered across domains)
   */
  private applyBusinessRules(
    inventory: Inventory,
    fromState: InventoryState,
    toState: InventoryState,
    quantity: number,
    reference: { type: string, id: string }
  ): void {
    // Rule 1: Cannot transition FROM quarantined (except via NCR closure)
    if (fromState === 'QUARANTINED' && reference.type !== 'NCR') {
      throw new BusinessRuleException(
        'Quarantined inventory can only be released via NCR closure'
      )
    }

    // Rule 2: Cannot transition TO consumed if insufficient quantity
    const sourceQty = inventory[`quantity_${fromState.toLowerCase()}`]
    if (sourceQty < quantity) {
      throw new InsufficientInventoryException(
        `Only ${sourceQty} available in ${fromState} state, requested ${quantity}`
      )
    }

    // Rule 3: NCR quarantine requires NCR reference
    if (toState === 'QUARANTINED' && reference.type !== 'NCR') {
      throw new BusinessRuleException('Can only quarantine via NCR')
    }
  }

  /**
   * State machine: valid transitions only
   */
  private isValidTransition(from: InventoryState, to: InventoryState): boolean {
    const validTransitions = {
      AVAILABLE: ['ALLOCATED', 'QUARANTINED', 'SCRAPPED'],
      ALLOCATED: ['PICKED', 'AVAILABLE', 'QUARANTINED'],
      PICKED: ['CONSUMED', 'AVAILABLE', 'QUARANTINED'],
      QUARANTINED: ['AVAILABLE', 'SCRAPPED'],  // Only via NCR closure
      CONSUMED: [],  // Terminal state
      SCRAPPED: []   // Terminal state
    }

    return validTransitions[from]?.includes(to) || false
  }

  private validateInvariants(inventory: Inventory): void {
    // All quantities must be non-negative
    const total = inventory.quantity_available +
                  inventory.quantity_allocated +
                  inventory.quantity_picked +
                  inventory.quantity_quarantined

    if (total < 0) {
      throw new InvariantViolationException('Negative inventory detected')
    }
  }
}
```

**Enforcement**:
- ✅ NCR calls `inventoryService.transitionState(materialId, qty, 'AVAILABLE', 'QUARANTINED', {type: 'NCR', id: ncrId})`
- ✅ Kit calls `inventoryService.transitionState(materialId, qty, 'ALLOCATED', 'PICKED', {type: 'KIT', id: kitId})`
- ✅ Order allocation calls `inventoryService.transitionState(materialId, qty, 'AVAILABLE', 'ALLOCATED', {type: 'ORDER', id: orderId})`

**NO domain can bypass this - enforced by module boundaries (#1).**

---

## Cross-Domain Invariants (Application-Level Validation)

**CRITICAL**: Multiple status enums exist across domains (orders, NCRs, inventory, kits, shipments). Without cross-domain validation, contradictory states can occur. These invariants MUST be enforced in **application services**, not UI logic.

### **Invariant 1: Cannot Ship with Open Critical NCR**

**Rule**: Order cannot be marked as shipped if there are open Critical NCRs associated with it.

**Enforced in**: `ShipmentService.markAsShipped()`

```typescript
async markAsShipped(shipmentId: string) {
  // Query for open Critical NCRs on this order
  const criticalNCRs = await this.ncrRepository.find({
    where: {
      order_id: shipment.order_id,
      severity: 'CRITICAL',
      status: Not(In(['CLOSED', 'REJECTED']))
    }
  })

  if (criticalNCRs.length > 0) {
    throw new ForbiddenException(
      `Cannot ship order with open Critical NCR: ${criticalNCRs[0].ncr_number}. ` +
      `Close NCR or request executive override.`
    )
  }

  // ... proceed with shipment
}
```

### **Invariant 2: Cannot Close Order with Open NCRs**

**Rule**: Order status cannot be set to 'COMPLETED' if there are open NCRs (any severity).

**Enforced in**: `OrderService.updateStatus()`

```typescript
async updateStatus(orderId: string, newStatus: OrderStatus) {
  if (newStatus === 'COMPLETED') {
    // Check for ANY open NCRs on this order
    const openNCRs = await this.ncrRepository.count({
      where: {
        order_id: orderId,
        status: Not(In(['CLOSED', 'REJECTED']))
      }
    })

    if (openNCRs > 0) {
      throw new BusinessRuleException(
        `Cannot complete order with ${openNCRs} open NCR(s). ` +
        `All NCRs must be closed before order completion.`
      )
    }
  }

  // ... proceed with status update
}
```

### **Invariant 3: Cannot Consume Quarantined Inventory**

**Rule**: Inventory in QUARANTINED state cannot be transitioned to CONSUMED or PICKED.

**Enforced in**: `InventoryService.transitionInventoryState()`

```typescript
async transitionInventoryState(batchId, qty, fromState, toState, reference) {
  // Block transitions FROM quarantined (except via NCR closure)
  if (fromState === 'QUARANTINED' && reference.type !== 'NCR') {
    throw new BusinessRuleException(
      `Cannot transition quarantined inventory to ${toState}. ` +
      `Quarantined material can only be released via NCR closure.`
    )
  }

  // Block transitions TO consumed/picked if source state is quarantined
  if (fromState === 'QUARANTINED' && ['CONSUMED', 'PICKED'].includes(toState)) {
    throw new BusinessRuleException(
      `Cannot consume or pick quarantined inventory. NCR must be resolved first.`
    )
  }

  // ... proceed with state transition
}
```

### **Invariant 4: Cannot Issue Kit with Quarantined Materials**

**Rule**: Kit cannot be issued to production if any kit_item references quarantined batch inventory.

**Enforced in**: `KitService.issueToProduction()`

```typescript
async issueToProduction(kitId: string) {
  const kit = await this.kitRepository.findOne({
    where: { id: kitId },
    relations: ['items', 'items.batch', 'items.batch.inventory']
  })

  // Check for quarantined materials in kit
  const quarantinedItems = kit.items.filter(item =>
    item.batch.inventory.quantity_quarantined > 0
  )

  if (quarantinedItems.length > 0) {
    throw new BusinessRuleException(
      `Cannot issue kit ${kit.kit_number} to production. ` +
      `Contains quarantined materials: ${quarantinedItems.map(i => i.batch.batch_number).join(', ')}. ` +
      `Resolve NCRs before issuing kit.`
    )
  }

  // ... proceed with kit issuance
}
```

### **Invariant 5: Cannot Create Kit Without Sufficient Available Inventory**

**Rule**: Kit cannot be created if batch inventory does not have sufficient AVAILABLE or ALLOCATED quantity.

**Enforced in**: `KitService.createKit()`

```typescript
async createKit(data: CreateKitDto) {
  for (const item of data.items) {
    const batchInventory = await this.batchInventoryRepo.findOne({
      where: { batch_id: item.batchId }
    })

    // Check available + allocated (can pull from either)
    const availableQty = batchInventory.quantity_available + batchInventory.quantity_allocated

    if (availableQty < item.quantityRequired) {
      throw new InsufficientInventoryException(
        `Insufficient inventory for batch ${item.batchId}. ` +
        `Required: ${item.quantityRequired}, Available: ${availableQty}`
      )
    }
  }

  // ... proceed with kit creation
}
```

### **Invariant 6: Cannot Delete or Edit Consumed Kit**

**Rule**: Kit in CONSUMED status cannot be edited or deleted (production already complete).

**Enforced in**: `KitService.updateKit()` and `KitService.deleteKit()`

```typescript
async updateKit(kitId: string, updates: UpdateKitDto) {
  const kit = await this.kitRepository.findOne({ where: { id: kitId }})

  if (kit.status === 'CONSUMED') {
    throw new BusinessRuleException(
      `Cannot modify kit ${kit.kit_number} - already consumed in production. ` +
      `Use return flow to adjust inventory.`
    )
  }

  // ... proceed with update
}
```

### **Invariant 7: Cannot Cancel Order in Production**

**Rule**: Order status cannot be set to 'CANCELLED' if status is 'IN_PRODUCTION'.

**Enforced in**: `OrderService.cancelOrder()`

```typescript
async cancelOrder(orderId: string, reason: string) {
  const order = await this.orderRepository.findOne({ where: { id: orderId }})

  if (order.status === 'IN_PRODUCTION') {
    throw new BusinessRuleException(
      `Cannot cancel order ${order.order_number} - already in production. ` +
      `Production lock prevents cancellation. Request executive override if needed.`
    )
  }

  // ... proceed with cancellation
}
```

### **Invariant 8: NCR Closure Must Set Disposition**

**Rule**: NCR status cannot be changed to 'CLOSED' without disposition being set.

**Enforced in**: `NCRService.closeNCR()`

```typescript
async closeNCR(ncrId: string, data: CloseNCRDto) {
  if (!data.disposition) {
    throw new BadRequestException(
      `Cannot close NCR without disposition. ` +
      `Must select: SCRAP, REWORK, USE_AS_IS, or RETURN_TO_SUPPLIER.`
    )
  }

  if (data.disposition === 'USE_AS_IS' && !data.engineeringApproval) {
    throw new ForbiddenException(
      `Use-as-is disposition requires engineering approval.`
    )
  }

  // ... proceed with NCR closure
}
```

### **Cross-Domain Validation Summary**

| Domain 1 | Domain 2 | Invariant | Enforcement Point |
|----------|----------|-----------|-------------------|
| Order | NCR | Cannot ship with open Critical NCR | ShipmentService.markAsShipped() |
| Order | NCR | Cannot complete order with open NCRs | OrderService.updateStatus() |
| Inventory | NCR | Cannot consume quarantined inventory | InventoryService.transitionInventoryState() |
| Kit | Inventory | Cannot issue kit with quarantined materials | KitService.issueToProduction() |
| Kit | Inventory | Cannot create kit without sufficient inventory | KitService.createKit() |
| Kit | Production | Cannot edit/delete consumed kit | KitService.updateKit() |
| Order | Production | Cannot cancel order in production | OrderService.cancelOrder() |
| NCR | NCR | NCR closure must set disposition | NCRService.closeNCR() |

**Implementation Pattern**: All cross-domain validations are implemented in **application service layer** (not controllers, not UI). This ensures invariants hold regardless of entry point (API, background jobs, admin tools).

## Project Structure

```
erp/
├── backend/                    # NestJS API
│   ├── src/
│   │   ├── entities/           # TypeORM entities
│   │   │   ├── product.entity.ts
│   │   │   ├── material.entity.ts
│   │   │   ├── supplier.entity.ts
│   │   │   ├── material-batch.entity.ts
│   │   │   ├── bom-item.entity.ts
│   │   │   ├── customer.entity.ts
│   │   │   ├── order.entity.ts
│   │   │   ├── batch-inventory.entity.ts
│   │   │   └── inventory-transaction.entity.ts
│   │   ├── modules/
│   │   │   ├── products/       # Product management
│   │   │   │   ├── products.controller.ts
│   │   │   │   ├── products.service.ts
│   │   │   │   └── dto/
│   │   │   ├── materials/      # Material management
│   │   │   │   ├── materials.controller.ts
│   │   │   │   ├── materials.service.ts
│   │   │   │   └── dto/
│   │   │   ├── suppliers/      # Supplier management
│   │   │   │   ├── suppliers.controller.ts
│   │   │   │   ├── suppliers.service.ts
│   │   │   │   └── dto/
│   │   │   ├── material-batches/ # Batch/lot tracking
│   │   │   │   ├── material-batches.controller.ts
│   │   │   │   ├── material-batches.service.ts
│   │   │   │   └── dto/
│   │   │   ├── bom/            # BOM management
│   │   │   │   ├── bom.controller.ts
│   │   │   │   ├── bom.service.ts
│   │   │   │   └── dto/
│   │   │   ├── customers/      # Customer management
│   │   │   │   ├── customers.controller.ts
│   │   │   │   ├── customers.service.ts
│   │   │   │   └── dto/
│   │   │   ├── orders/         # Order management
│   │   │   │   ├── orders.controller.ts
│   │   │   │   ├── orders.service.ts
│   │   │   │   └── dto/
│   │   │   ├── inventory/      # Inventory tracking
│   │   │   │   ├── inventory.controller.ts
│   │   │   │   ├── inventory.service.ts
│   │   │   │   └── dto/
│   │   │   └── mrp/            # Material Requirements Planning (core logic)
│   │   │       ├── mrp.controller.ts
│   │   │       ├── mrp.service.ts
│   │   │       └── dto/
│   │   ├── database/           # Database configuration
│   │   │   ├── database.module.ts
│   │   │   └── migrations/     # TypeORM migrations
│   │   ├── config/
│   │   │   └── typeorm.config.ts
│   │   └── common/
│   └── package.json
├── frontend/                   # Next.js App
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx        # Dashboard
│   │   │   ├── orders/         # Order management pages
│   │   │   ├── products/       # Product pages
│   │   │   ├── materials/      # Material pages
│   │   │   ├── suppliers/      # Supplier pages
│   │   │   ├── inventory/      # Batch inventory pages
│   │   │   │   ├── page.tsx    # Batch inventory list (material/batch views)
│   │   │   │   └── receive/    # Material batch receiving
│   │   │   └── bom/            # BOM management pages
│   │   ├── components/
│   │   │   ├── ui/             # Reusable UI components
│   │   │   ├── forms/          # Form components
│   │   │   ├── tables/         # Table components
│   │   │   ├── layout/         # Layout components
│   │   │   └── dashboard/      # Dashboard widgets
│   │   ├── lib/
│   │   │   └── api.ts          # API client
│   │   ├── types/              # TypeScript types
│   │   └── hooks/              # Custom React hooks
│   └── package.json
├── docker-compose.yml          # PostgreSQL and backend services
└── .gitignore
```

## Key Workflows

### Workflow 1: Order Entry → Material Requirements (CORE MVP)

**User Journey:**
1. Navigate to Orders → New Order
2. Fill form: Customer, Product, Quantity, Due Date, **Order Type (Turnkey/Consignment)**, Custom Specifications
3. Submit order
4. System calculates and displays material requirements with shortfalls (behavior differs by order type)

**Technical Flow:**
1. Frontend: `POST /api/orders` (creates order with order_type)
2. Backend: `OrdersService.create()` saves order to database using TypeORM repository
3. Frontend: `GET /api/mrp/order/:orderId`
4. Backend: `MrpService.calculateOrderRequirements()`:
   - Queries order from orders table (with relations to customer and product)
   - Queries BOM items for the product (with relations to materials)
   - Calculates: `required_qty = order_qty × bom_qty × (1 + scrap_factor%)`
   - **If order_type = 'TURNKEY'**:
     - Queries company inventory for each material
     - Returns: `{materialId, name, requiredQty, availableQty (from company inventory), shortfall}`
     - Shortfall indicates materials to purchase
   - **If order_type = 'CONSIGNMENT'**:
     - Queries consignment_inventory for this customer/order
     - Returns: `{materialId, name, requiredQty, availableQty (from consignment inventory), shortfall}`
     - Shortfall indicates materials customer needs to provide
5. Frontend: Displays requirements table showing what's needed vs available
   - **Turnkey**: Shows materials to purchase from suppliers
   - **Consignment**: Shows materials customer must provide

**Critical Files:**
- `backend/src/entities/order.entity.ts` - Order entity definition
- `backend/src/entities/bom-item.entity.ts` - BOM entity with relations
- `backend/src/modules/mrp/mrp.service.ts` - Material requirements calculation
- `backend/src/modules/orders/orders.service.ts` - Order CRUD operations
- `frontend/src/components/forms/order-form.tsx` - Order entry form
- `frontend/src/app/orders/new/page.tsx` - New order page

### Workflow 2: Batch-Level Inventory Management

**User Journey:**
1. Navigate to Inventory page
2. Toggle view: Company Inventory (Turnkey) or Consignment Inventory (by Customer/Order)
3. Toggle view mode: Material-level aggregated view or Batch-level detailed view
4. **Company batch inventory**:
   - View all batches with supplier, inspection status, expiration dates
   - See batches below reorder level (aggregated), quarantined batches, batches nearing expiration
   - Filter by material, supplier, inspection status
5. **Consignment batch inventory**:
   - View by customer/order, track customer-provided material batches
   - See batch details including received date, inspection status
6. Manually adjust batch inventory using state transitions

**Technical Flow:**
1. Frontend: `GET /api/inventory/batches?type=company` or `GET /api/inventory/batches?type=consignment`
2. Backend: `InventoryService.getBatchInventory(type)`:
   - **If type='company'**:
     ```typescript
     await batchInventoryRepo.find({
       where: { inventory_type: 'COMPANY' },
       relations: ['batch', 'batch.material', 'batch.supplier']
     })
     ```
   - **If type='consignment'**:
     ```typescript
     await batchInventoryRepo.find({
       where: { inventory_type: 'CONSIGNMENT' },
       relations: ['batch', 'batch.material', 'customer', 'order']
     })
     ```
3. Frontend: Displays batch inventory table with filters, sorting, and drill-down capability
4. User makes manual adjustment on specific batch:
   - Frontend: `PATCH /api/inventory/batches/:batchId/adjust`
   - User selects state transition: From State (e.g., AVAILABLE) → To State (e.g., ALLOCATED)
5. Backend: `InventoryService.transitionInventoryState(batchId, qty, fromState, toState, reference)` (uses database transaction):
   - Locks batch_inventory record with optimistic locking (version column)
   - Validates state transition is allowed
   - Checks sufficient quantity in source state
   - Performs atomic state change: decrement fromState, increment toState
   - Validates invariants (non-negative quantities)
   - Saves batch_inventory (fails if version conflict)
   - Creates IMMUTABLE audit record in inventory_transactions with material_batch_id and digital_signature
   - Commits transaction or rollback on error
6. Frontend: Shows updated batch inventory with new state quantities

**Critical Files:**
- `backend/src/entities/material-batch.entity.ts` - Material batch entity
- `backend/src/entities/batch-inventory.entity.ts` - Batch-level inventory entity (SOURCE OF TRUTH)
- `backend/src/entities/inventory-transaction.entity.ts` - IMMUTABLE transaction entity with batch_id
- `backend/src/modules/inventory/inventory.service.ts` - Batch inventory management with state transitions
- `frontend/src/app/inventory/page.tsx` - Batch inventory list with material/batch toggle
- `frontend/src/components/forms/batch-inventory-adjustment-form.tsx` - State transition form

## Implementation Plan

### Phase 1: Project Setup & Database Infrastructure

**1.1 Initialize Project**
- Create monorepo structure (`backend/` and `frontend/` folders)
- Initialize NestJS backend:
  - `npm init` and install dependencies (NestJS, TypeORM, pg)
  - Setup basic app.module.ts
- Initialize Next.js frontend:
  - `npx create-next-app@latest` with TypeScript, App Router, Tailwind CSS
- Create environment files (.env for backend, .env.local for frontend)

**1.2 Database Setup**
- Create `docker-compose.yml` with PostgreSQL service:
  - PostgreSQL 16
  - Persistent volume for data
  - Exposed port for local development
- Configure TypeORM in NestJS:
  - Create `backend/src/config/typeorm.config.ts`
  - Setup database module with TypeORM
  - Configure migrations directory
- Create initial database connection and verify connectivity

**1.3 Environment Configuration**
- Backend `.env`:
  - DATABASE_HOST, DATABASE_PORT, DATABASE_USER, DATABASE_PASSWORD, DATABASE_NAME
  - PORT (API server port)
- Frontend `.env.local`:
  - NEXT_PUBLIC_API_URL (backend API URL)

**Deliverables:**
- Backend and frontend projects initialized
- PostgreSQL running in Docker
- Database connection established
- TypeORM configured and ready for entities

### Phase 2: Database Schema & TypeORM Entities

**2.1 Create TypeORM Entities (MVP FOCUS: Order Entry → MRP → Shortage Reports)**

**CORE MVP ENTITIES** (Implement First):

1. **product.entity.ts** - Product entity with timestamps
2. **material.entity.ts** - Material entity with reorder_level
3. **customer.entity.ts** - Customer entity
4. **bom-item.entity.ts** - BOM entity with Many-to-One relations to Product and Material, includes resource_type enum (SMT/TH/MECH) *for future kitting*
5. **order.entity.ts** - Order entity with relations to Customer and Product, includes order_type enum (TURNKEY/CONSIGNMENT), status
6. **inventory.entity.ts** - **SIMPLIFIED MVP** Material-level inventory (not batch-level yet) with columns: material_id (FK, unique), inventory_type (COMPANY/CONSIGNMENT), customer_id (FK, nullable), order_id (FK, nullable), quantity_on_hand, reorder_level

**FUTURE-READY ENTITIES** (Database Schema Only - Don't Implement Yet):

7. **supplier.entity.ts** - For future supplier management
8. **material-batch.entity.ts** - For future batch/lot tracking (enables NCR in future)
9. **batch-inventory.entity.ts** - For future batch-level inventory (replaces inventory.entity.ts when batches are implemented)
10. **kit.entity.ts** - For future three-phase kitting (SMT/TH/MECH)
11. **kit-item.entity.ts** - For future kit traceability
12. **user.entity.ts** - For future authentication/roles
13. **role.entity.ts** - For future RBAC
14. **user-role.entity.ts** - For future role assignments
15. **inventory-transaction.entity.ts** - For future immutable audit trail
16. **ncr.entity.ts** - For future quality management
17. **shipment.entity.ts** - For future shipping/documents

**Note**: Create tables 7-17 in migration but don't build modules/UI yet. This ensures the database can accommodate future features without schema changes.

Each entity should include:
- `@Entity()` decorator
- Primary key with `@PrimaryGeneratedColumn('uuid')` or `@PrimaryGeneratedColumn()`
- Proper column decorators (`@Column()`, `@CreateDateColumn()`, `@UpdateDateColumn()`)
- Relationship decorators (`@ManyToOne()`, `@OneToMany()`, `@OneToOne()`)
- Validation constraints (unique, not null, etc.)

**2.2 Generate and Run Migrations**
- Generate initial migration: `npm run typeorm migration:generate -- -n InitialSchema`
- Review migration file in `backend/src/database/migrations/`
- Run migration: `npm run typeorm migration:run`
- Verify schema in PostgreSQL database

**2.3 Seed Data Script (MVP FOCUS)**
- Create `backend/src/database/seeds/` directory
- Create seed script to populate **MVP data only**:
  - Sample products (e.g., "PCB Assembly Model A", "PCB Assembly Model B")
  - Sample materials (e.g., "Resistor 10K", "Capacitor 100uF", "IC Microcontroller", "PCB", "Enclosure")
  - Sample BOM items linking products to materials with resource_types (SMT/TH/MECH for future kitting)
  - Sample customers (e.g., "Acme Corp", "TechStart Inc.")
  - **Initial inventory records** for all materials (company inventory with quantity_on_hand)
- **Skip for MVP**: Users, roles, suppliers, batches, kits (create tables but don't seed)
- Run seed script to populate database

**Deliverables:**
- **6 MVP entities** created with proper relations (products, materials, customers, bom_items, orders, inventory)
- **11 future-ready entities** created (tables exist but empty)
- Database schema migrated successfully (all 17 tables created for future compatibility)
- Sample data seeded for MVP entities only
- Database ready for **MVP backend modules** (Order Entry, MRP, Shortage Reports)

### Phase 3: Backend Modules & Business Logic (MVP FOCUS)

**IMPORTANT: 3-Layer Architecture**
```
Controllers (HTTP)  →  Application Services (Transactions)  →  Domain Services (Business Logic)
```

**3.1 Project Structure Setup**

Create directory structure:
```
backend/src/
  ├── application-services/          # Transaction coordinators (Future - skip for MVP)
  │   └── .gitkeep
  ├── modules/                        # Domain services
  │   ├── products/
  │   ├── materials/
  │   ├── customers/
  │   ├── bom/
  │   ├── inventory/
  │   ├── orders/
  │   ├── mrp/
  │   └── reports/
  ├── common/                         # Shared code
  │   ├── exceptions/                 # Custom exceptions
  │   └── guards/                     # Future: Auth guards
```

**ESLint Configuration** (Enforce architectural boundaries):

Add to `backend/.eslintrc.js`:
```javascript
module.exports = {
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['**/inventory/*.repository', '**/inventory/*.entity'],
            message: 'Inventory repositories/entities must only be used within InventoryModule. Use InventoryService instead.'
          },
          {
            group: ['**/orders/*.repository'],
            message: 'Order repositories must only be used within OrdersModule. Use OrdersService instead.'
          }
        ]
      }
    ]
  }
}
```

**3.2 MVP Domain Services (Order Entry → MRP → Shortage Reports)**

For each module:
- Create DTOs (CreateDto, UpdateDto) with class-validator decorators
- Create **domain service** with TypeORM repository injection
- **CRITICAL**: Domain services accept optional `EntityManager` parameter for transaction participation
- Implement CRUD methods using repository (find, findOne, save, update, remove)
- Create controller with REST endpoints
- **Module exports SERVICE ONLY** (not repositories)
- Register module in app.module.ts with TypeORM forFeature([Entity])

**MVP Modules to Implement:**

1. **Products Module**
   - DTOs: CreateProductDto, UpdateProductDto
   - Service: Inject Repository<Product>
   - Endpoints: GET /products, POST /products, GET /products/:id, PATCH /products/:id, DELETE /products/:id

2. **Materials Module**
   - DTOs: CreateMaterialDto, UpdateMaterialDto
   - Service: Inject Repository<Material>
   - Endpoints: Standard CRUD for materials

3. **Customers Module**
   - DTOs: CreateCustomerDto, UpdateCustomerDto
   - Service: Inject Repository<Customer>
   - Endpoints: Standard CRUD for customers

4. **BOM Module**
   - DTOs: CreateBomItemDto (includes resource_type for future kitting), UpdateBomItemDto
   - Service: Inject Repository<BomItem>
   - Query BOM items by product_id (for getting product's BOM)
   - Endpoints: Standard CRUD + GET /bom/product/:productId

5. **Inventory Module** (SIMPLIFIED - Material-level for MVP, SINGLE ARBITER pattern)
   - DTOs: AdjustInventoryDto
   - Service: Inject Repository<Inventory>
   - **Module exports SERVICE ONLY** (enforces architectural boundary):
     ```typescript
     @Module({
       imports: [TypeOrmModule.forFeature([Inventory])],
       providers: [InventoryService],
       controllers: [InventoryController],
       exports: [InventoryService]  // ✅ Only service, NOT Repository<Inventory>
     })
     export class InventoryModule {}
     ```
   - Methods (accept optional EntityManager for transactions):
     - `getInventory(filters, manager?)` - Query inventory with filters (type, customer, order)
     - `adjustStock(materialId, quantity, type, reference, manager?)` - Manual inventory adjustments
     - `getAvailableByMaterial(materialId, manager?)` - Get available quantity
   - **Implementation pattern**:
     ```typescript
     @Injectable()
     export class InventoryService {
       async adjustStock(
         materialId: string,
         quantity: number,
         type: 'COMPANY' | 'CONSIGNMENT',
         reference: { type: string, id: string },
         transactionManager?: EntityManager  // ✅ Accept transaction from coordinator
       ): Promise<Inventory> {
         const manager = transactionManager || this.dataSource.manager

         return await manager.transaction(async (txManager) => {
           const inventory = await txManager.findOne(Inventory, {
             where: { material_id: materialId, inventory_type: type },
             lock: { mode: 'pessimistic_write' }  // Prevent race conditions
           })

           inventory.quantity_on_hand += quantity
           return await txManager.save(inventory)
         })
       }
     }
     ```
   - Endpoints:
     - GET /inventory?type=company (company-owned materials)
     - GET /inventory?type=consignment&customerId=X (customer-owned materials)
     - PATCH /inventory/:materialId/adjust (adjust inventory)

**3.2 Orders Module (CRITICAL - Entry Point)**

**File: `backend/src/modules/orders/orders.module.ts`**

```typescript
@Module({
  imports: [
    TypeOrmModule.forFeature([Order]),
    InventoryModule,  // ✅ Import service ONLY (not repositories)
  ],
  providers: [OrdersService],
  controllers: [OrdersController],
  exports: [OrdersService]
})
export class OrdersModule {}
```

**File: `backend/src/modules/orders/orders.service.ts`**

```typescript
@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private orderRepo: Repository<Order>,
    private inventoryService: InventoryService,  // ✅ Cross-domain via service
    private dataSource: DataSource
  ) {}

  async create(dto: CreateOrderDto): Promise<Order> {
    // Validate order_type is selected
    if (!dto.orderType || !['TURNKEY', 'CONSIGNMENT'].includes(dto.orderType)) {
      throw new BadRequestException('Order type must be TURNKEY or CONSIGNMENT')
    }

    // Auto-generate order number
    const orderNumber = await this.generateOrderNumber()

    const order = this.orderRepo.create({
      ...dto,
      orderNumber,
      status: 'PENDING'
    })

    return await this.orderRepo.save(order)
  }

  async confirmOrder(orderId: string, transactionManager?: EntityManager): Promise<Order> {
    const manager = transactionManager || this.dataSource.manager

    return await manager.transaction(async (txManager) => {
      const order = await txManager.findOne(Order, {
        where: { id: orderId },
        lock: { mode: 'pessimistic_write' }
      })

      if (order.status !== 'PENDING') {
        throw new BusinessRuleException(
          `Cannot confirm order ${order.orderNumber} - already ${order.status}`
        )
      }

      order.status = 'CONFIRMED'
      order.confirmedAt = new Date()

      // ✅ CORRECT: Call InventoryService, NOT direct repository mutation
      // (Actual allocation would happen in Application Service Layer)
      // This service just updates order status

      return await txManager.save(order)
    })
  }

  private async generateOrderNumber(): Promise<string> {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const count = await this.orderRepo.count({
      where: { orderNumber: Like(`ORD-${today}-%`) }
    })
    return `ORD-${today}-${String(count + 1).padStart(4, '0')}`
  }
}
```

- DTOs: CreateOrderDto (includes orderType: TURNKEY/CONSIGNMENT), UpdateOrderDto
- Auto-generate order numbers: ORD-YYYYMMDD-#### format
- Query with relations to customer and product
- **Order type validation**: Ensure order_type is selected (required field)
- Status management enum (pending, confirmed, in_production, completed, cancelled)
- Endpoints: GET /orders, POST /orders, GET /orders/:id, PATCH /orders/:id/status
- Filter orders by type: GET /orders?type=turnkey or GET /orders?type=consignment

**Architectural Notes:**
- OrdersService does NOT directly mutate inventory (no Repository<Inventory> injection)
- Cross-domain inventory operations go through InventoryService
- Accepts optional EntityManager for transaction participation

**3.3 MRP Module (CRITICAL - Material Requirements Planning)**

**File: `backend/src/modules/mrp/mrp.module.ts`**

```typescript
@Module({
  imports: [
    TypeOrmModule.forFeature([Order, BomItem, Inventory])
  ],
  providers: [MrpService],
  controllers: [MrpController],
  exports: [MrpService]
})
export class MrpModule {}
```

**File: `backend/src/modules/mrp/mrp.service.ts`**

```typescript
@Injectable()
export class MrpService {
  constructor(
    @InjectRepository(Order)
    private orderRepo: Repository<Order>,
    @InjectRepository(BomItem)
    private bomRepo: Repository<BomItem>,
    @InjectRepository(Inventory)
    private inventoryRepo: Repository<Inventory>
    // ✅ READ-ONLY module - no cross-domain mutations needed
  ) {}

  async calculateOrderRequirements(orderId: string): Promise<MaterialRequirement[]> {
    // 1. Query order with relations
    const order = await this.orderRepo.findOne({
      where: { id: orderId },
      relations: ['product', 'customer']
    })

    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`)
    }

    // 2. Check order.order_type (TURNKEY or CONSIGNMENT)
    const orderType = order.orderType

    // 3. Query BOM items for the product
    const bomItems = await this.bomRepo.find({
      where: { product_id: order.product_id },
      relations: ['material']
    })

    if (bomItems.length === 0) {
      throw new BusinessRuleException(
        `Product ${order.product.partNumber} has no BOM defined. Cannot calculate requirements.`
      )
    }

    // 4. Calculate requirements for each BOM item
    const requirements: MaterialRequirement[] = []

    for (const bomItem of bomItems) {
      const qtyNeeded = Math.ceil(
        order.quantity * bomItem.quantityRequired * (1 + bomItem.scrapFactor / 100)
      )

      let availableQty = 0
      let sourceType: 'COMPANY' | 'CONSIGNMENT' = orderType

      if (orderType === 'TURNKEY') {
        // Query company inventory
        const inventory = await this.inventoryRepo.findOne({
          where: {
            material_id: bomItem.material_id,
            inventory_type: 'COMPANY'
          },
          relations: ['material']
        })
        availableQty = inventory?.quantity_on_hand || 0
      } else if (orderType === 'CONSIGNMENT') {
        // Query consignment inventory for this customer/order
        const inventory = await this.inventoryRepo.findOne({
          where: {
            material_id: bomItem.material_id,
            inventory_type: 'CONSIGNMENT',
            customer_id: order.customer_id,
            order_id: order.id
          },
          relations: ['material']
        })
        availableQty = inventory?.quantity_on_hand || 0
      }

      const shortfall = Math.max(0, qtyNeeded - availableQty)

      requirements.push({
        materialId: bomItem.material_id,
        materialName: bomItem.material.name,
        partNumber: bomItem.material.partNumber,
        unit: bomItem.material.unit,
        requiredQty: qtyNeeded,
        availableQty,
        shortfall,
        sourceType
      })
    }

    return requirements
  }
}
```

**Key Points:**
- **READ-ONLY module** - MRP only calculates requirements, does NOT mutate inventory
- Queries Order, BomItem, and Inventory repositories directly (read operations)
- Returns MaterialRequirement[] with: `{materialId, materialName, unit, requiredQty, availableQty, shortfall, sourceType}`
- **Turnkey orders**: Check company inventory, shortfall = materials to purchase from suppliers
- **Consignment orders**: Check consignment inventory for customer/order, shortfall = materials customer must provide
- Endpoint: GET /mrp/order/:orderId

**Architectural Notes:**
- MRP is a pure calculation service - no side effects
- Does not need to coordinate transactions or call other domain services
- Safe to read from multiple repositories directly (no mutation risk)

**3.4 Shortage Reports Module (CRITICAL - Procurement Planning)**

**File: `backend/src/modules/reports/reports.module.ts`**

```typescript
@Module({
  imports: [
    TypeOrmModule.forFeature([Order, BomItem, Inventory, Material]),
    MrpModule  // ✅ Reuse MRP calculation logic
  ],
  providers: [ReportsService],
  controllers: [ReportsController],
  exports: [ReportsService]
})
export class ReportsModule {}
```

**File: `backend/src/modules/reports/reports.service.ts`**

```typescript
@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Order)
    private orderRepo: Repository<Order>,
    @InjectRepository(Material)
    private materialRepo: Repository<Material>,
    private mrpService: MrpService  // ✅ Reuse domain logic, don't duplicate
    // ✅ READ-ONLY module - no mutations
  ) {}

  async getAllShortages(orderType?: 'TURNKEY' | 'CONSIGNMENT'): Promise<MaterialShortage[]> {
    // 1. Get all active orders (not cancelled or completed)
    const whereClause: any = {
      status: In(['PENDING', 'CONFIRMED', 'IN_PRODUCTION'])
    }
    if (orderType) {
      whereClause.orderType = orderType
    }

    const orders = await this.orderRepo.find({
      where: whereClause,
      relations: ['product', 'customer']
    })

    // 2. Calculate requirements for each order using MRP service
    const allRequirements: Record<string, {
      material: Material,
      totalRequired: number,
      totalAvailable: number,
      affectedOrders: { orderId: string, orderNumber: string, orderType: string, quantityNeeded: number }[]
    }> = {}

    for (const order of orders) {
      const requirements = await this.mrpService.calculateOrderRequirements(order.id)

      for (const req of requirements) {
        if (!allRequirements[req.materialId]) {
          const material = await this.materialRepo.findOne({
            where: { id: req.materialId }
          })
          allRequirements[req.materialId] = {
            material,
            totalRequired: 0,
            totalAvailable: req.availableQty,  // Same for all orders of same type
            affectedOrders: []
          }
        }

        allRequirements[req.materialId].totalRequired += req.requiredQty
        allRequirements[req.materialId].affectedOrders.push({
          orderId: order.id,
          orderNumber: order.orderNumber,
          orderType: order.orderType,
          quantityNeeded: req.requiredQty
        })
      }
    }

    // 3. Convert to MaterialShortage[] with shortfalls only
    const shortages: MaterialShortage[] = Object.values(allRequirements)
      .map(data => ({
        materialId: data.material.id,
        materialName: data.material.name,
        partNumber: data.material.partNumber,
        unit: data.material.unit,
        totalRequired: data.totalRequired,
        totalAvailable: data.totalAvailable,
        totalShortfall: Math.max(0, data.totalRequired - data.totalAvailable),
        affectedOrders: data.affectedOrders,
        reorderLevel: data.material.reorderLevel
      }))
      .filter(s => s.totalShortfall > 0)  // Only show materials with shortages

    return shortages
  }

  async getShortagesByMaterial(materialId: string): Promise<MaterialShortage | null> {
    const allShortages = await this.getAllShortages()
    return allShortages.find(s => s.materialId === materialId) || null
  }
}
```

**Returns:**
```typescript
interface MaterialShortage {
  materialId: string
  materialName: string
  partNumber: string
  unit: string
  totalRequired: number       // Sum across all orders
  totalAvailable: number       // Current inventory
  totalShortfall: number       // What's needed
  affectedOrders: [            // Which orders need this material
    { orderId, orderNumber, orderType, quantityNeeded }
  ]
  reorderLevel: number         // From materials table
}
```

**Endpoints:**
- GET /reports/shortages (all material shortages)
- GET /reports/shortages?orderType=turnkey (Turnkey shortages - purchase materials)
- GET /reports/shortages?orderType=consignment (Consignment shortages - customer must provide)
- GET /reports/shortages/material/:materialId (shortage details for specific material)

**Architectural Notes:**
- **READ-ONLY module** - Reports only aggregate data, no mutations
- Reuses MrpService for calculation logic (don't duplicate)
- Safe to read from multiple repositories directly (no mutation risk)
- Aggregates shortage data across all active orders

**Deliverables:**
- **MVP modules complete**: Products, Materials, Customers, BOM, Inventory, Orders, MRP, Reports
- **Material requirement calculation working** for both Turnkey and Consignment orders
- **Shortage reports functional** - aggregated shortfalls across orders
- **Architectural controls enforced**:
  - ✅ Hard service boundaries via NestJS module exports (services only, not repositories)
  - ✅ ESLint rules prevent cross-domain repository access
  - ✅ Domain services accept optional EntityManager for transaction participation
  - ✅ InventoryService is sole arbiter for inventory mutations (pessimistic locking)
  - ✅ MRP and Reports are READ-ONLY modules (no cross-domain mutations)
- All CRUD operations tested with Postman/REST client
- **Backend API ready for MVP frontend** (Order Entry → MRP → Shortage Reports)
- **System prepared for future Application Service Layer** when multi-step workflows are needed

### Phase 4: Frontend Foundation

**4.1 UI Component Library**
- Setup Tailwind CSS
- Create components in `frontend/src/components/ui/`:
  - button.tsx
  - input.tsx
  - select.tsx
  - table.tsx
  - card.tsx
  - modal.tsx
  - loading-spinner.tsx
  - toast.tsx (for notifications)

**4.2 Layout Components**
- Sidebar navigation
- Header with app title
- Main layout wrapper

**4.3 API Client & Types**

**File: `frontend/src/lib/api.ts`**

Create API client class with methods for **MVP endpoints only**:
- Products: `getProducts()`, `createProduct()`, `updateProduct()`, `deleteProduct()`
- Materials: `getMaterials()`, `createMaterial()`, `updateMaterial()`, `deleteMaterial()`
- Customers: `getCustomers()`, `createCustomer()`, `updateCustomer()`
- BOM: `getBomItems()`, `getBomByProduct(productId)`, `createBomItem()`, `updateBomItem()`, `deleteBomItem()`
- Orders: `getOrders()`, `getOrder(id)`, `createOrder()`, `updateOrder()`
- MRP: `getOrderRequirements(orderId)` - returns material requirements with shortfalls
- Inventory: `getInventory(filters)`, `adjustInventory(materialId, quantity)`
- **Shortage Reports**: `getAllShortages()`, `getShortagesByOrderType(type)`, `getShortagesByMaterial(materialId)`

**4.4 TypeScript Types**
- Create types matching backend interfaces
- Place in `frontend/src/types/`

**Deliverables:**
- Reusable component library
- API client setup
- Type-safe data models

### Phase 5: Frontend Pages & Forms (MVP FOCUS)

**5.1 Master Data Pages**

Create pages for:
- **Products** (list, create, edit)
  - `frontend/src/app/products/page.tsx` - List all products
  - `frontend/src/app/products/new/page.tsx` - Create product
  - `frontend/src/app/products/[id]/page.tsx` - Edit product

- **Materials** (list, create, edit)
  - `frontend/src/app/materials/page.tsx` - List all materials
  - `frontend/src/app/materials/new/page.tsx` - Create material
  - `frontend/src/app/materials/[id]/page.tsx` - Edit material

- **Customers** (list, create)
  - `frontend/src/app/customers/page.tsx` - List and create customers

- **BOM Management** (add/remove materials from product BOM)
  - `frontend/src/app/bom/page.tsx` - Manage BOMs for products
  - Interface to add/edit/remove BOM items for a selected product
  - **Resource Type selection** for each BOM item:
    - SMT (Surface Mount Technology)
    - TH (Through-Hole)
    - MECH (Mechanical Assembly)
  - Visual grouping of BOM items by resource type
  - Quantity required and scrap factor per material

Pattern for each:
- List page with table (sorting, filtering)
- Create page with form
- Edit page (reuse form component)

**5.2 Order Management (CRITICAL - MVP Entry Point)**

**File: `frontend/src/components/forms/order-form.tsx`**

Features:
- Customer dropdown (searchable)
- Product dropdown
- Quantity input (number)
- Due date picker
- **Order Type selection** (required): Radio buttons or dropdown
  - ⚙️ **Turnkey** (We purchase materials and assemble)
  - 📦 **Consignment** (Customer provides materials, we assemble)
  - Display explanation tooltips for each type
- Custom specifications textarea
- **After submission**: Display material requirements table (behavior differs by order type)
  - Columns: Material, Resource Type (SMT/TH/MECH), Required Qty, Available Qty, Shortfall, Source
  - **Turnkey**: Show company inventory availability, highlight materials to purchase
  - **Consignment**: Show consignment inventory availability, highlight materials customer must provide
  - Group by resource type option (for three-phase kitting view)
  - Highlight shortfalls in red/yellow

**File: `frontend/src/app/orders/page.tsx`**
- Order list with filters:
  - Status (pending, confirmed, in_production, completed)
  - Date range
  - Customer
  - **Order Type** (Turnkey, Consignment, All)
- Visual indicator/badge for order type (Turnkey vs Consignment)
- Quick view of order details
- View material requirements for each order
- Link to create new order

**File: `frontend/src/app/orders/new/page.tsx`**
- New order creation page
- Uses OrderForm component
- Shows material requirements after creation

**5.3 Shortage Reports (CRITICAL - Procurement Planning)**

**File: `frontend/src/app/reports/shortages/page.tsx`**

Features:
- **Shortage overview table**:
  - Columns: Material Name, Unit, Total Required, Total Available, Total Shortfall, Reorder Level
  - Color-code rows:
    - Red: Critical shortage (shortfall > 50% of required)
    - Yellow: Moderate shortage (shortfall > 0)
    - Green: Sufficient stock
  - Sortable by shortfall amount (highest priority first)

- **Filter by Order Type**:
  - **Turnkey Shortages** - Materials to purchase from suppliers
  - **Consignment Shortages** - Materials customers need to provide
  - **All Shortages** - Combined view

- **Affected Orders drill-down**:
  - Click material row to see which orders need it
  - Shows: Order Number, Customer, Quantity Needed, Order Type, Due Date
  - Prioritize by due date (soonest first)

- **Export functionality**:
  - Export shortages to CSV for procurement team
  - Separate exports for Turnkey vs Consignment

**File: `frontend/src/components/charts/shortage-chart.tsx`**
- Visual chart showing top 10 materials by shortfall
- Bar chart or pie chart

**5.4 Inventory Management (SIMPLIFIED - Material-Level)**

**File: `frontend/src/app/inventory/page.tsx`**

Features:
- **Inventory type toggle**: Switch between Company Inventory and Consignment Inventory
- **Company Inventory view** (for Turnkey orders):
  - Material list with current stock levels
  - Low stock alerts (quantity_on_hand < reorder_level) - highlighted in red/yellow
  - Columns: Material Name, Unit, On Hand, Reorder Level, Status
  - Manual adjustment button for each material
  - Simple +/- quantity form

- **Consignment Inventory view** (for Consignment orders):
  - Filter by customer and/or order
  - Columns: Material Name, Customer, Order Number, On Hand, Received Date
  - Show customer-owned materials separately with clear labeling
  - Manual adjustment with customer/order context

**File: `frontend/src/components/forms/inventory-adjustment-form.tsx`**
- Material selector (or pre-selected)
- Quantity adjustment (+ or -)
- Notes field
- Submit updates inventory quantity_on_hand

**Deliverables:**
- **Order Entry functional**: Create orders with order type (Turnkey/Consignment)
- **Material Requirements displayed**: After order creation, show what materials are needed
- **Shortage Reports complete**: View material shortfalls across all orders, filter by order type
- All master data pages functional (products, materials, customers, BOM)
- Inventory tracking and manual adjustments working (material-level, simplified)
- **MVP complete**: Users can enter orders, see what materials are needed, and view shortage reports

### Phase 6: Dashboard

**File: `frontend/src/app/page.tsx`**

Dashboard Widgets:
1. **Stats Cards** (top row):
   - Total Active Orders (split by Turnkey/Consignment)
   - Low Stock Items count (company inventory, below reorder level)
   - Consignment Orders Awaiting Materials
   - Total Products count

2. **Recent Orders Widget**:
   - Last 5-10 orders with status
   - Customer name, product, quantity, due date
   - **Visual badge for order type** (Turnkey/Consignment)
   - Click to view material requirements

3. **Inventory Alerts Widget**:
   - Company materials below reorder level (aggregated across all batches) - for Turnkey orders
   - Batches with pending or failed inspection status (requires attention)
   - Batches nearing expiration date (time-sensitive materials)
   - Quarantined batches (NCR holds) with severity indicators
   - Consignment orders with missing materials - for Consignment orders
   - Show: Material name, batch number (if applicable), current stock, reorder level, supplier, expiration date
   - Quick link to inventory page with batch drill-down

4. **Material Shortfalls Overview**:
   - **Turnkey shortfalls**: Materials to purchase from suppliers
   - **Consignment shortfalls**: Materials customers need to provide
   - Aggregated requirements across all active orders
   - Material, Total Required, Available, Shortfall, Order Type
   - Grouped by resource type option (SMT/TH/MECH view)

**Deliverables:**
- Functional dashboard showing system overview
- Quick navigation to key areas
- At-a-glance view of system health

### Phase 7: UI Polish & Error Handling

**7.1 UI/UX Polish**
- Loading states on all async operations (spinners, skeletons)
- Error handling with toast notifications
- Form validation feedback (client-side validation)
- Responsive design for tablet/desktop
- Confirmation dialogs for destructive actions (delete)
- Empty states for tables with no data
- Success messages after create/update/delete

**7.2 Backend Error Handling & Validation**
- Global exception filter for API errors
- Database constraint violation handling (unique, foreign key errors)
- Transaction rollback on errors
- Data validation with class-validator in DTOs
- Proper HTTP status codes (400, 404, 500)

**Deliverables:**
- Polished, production-ready UI
- Robust error handling
- Good user experience

### Phase 8: Testing & Documentation

**8.1 Testing**
- Backend unit tests for:
  - MRP calculations (material requirements)
  - Order number generation
  - Inventory calculations and transactions
- Repository integration tests with test database
- Frontend component tests (forms, tables)
- E2E test for order-to-requirements flow

**8.2 Documentation**
- README with setup instructions (Docker, database setup, running migrations)
- API documentation (Swagger/OpenAPI or Postman collection)
- User guide with screenshots of key workflows
- Database schema documentation (ER diagram, table descriptions)
- Environment variable documentation

**Deliverables:**
- Tested, production-ready MVP
- Comprehensive documentation

## Future Enhancements (Post-MVP)

### Supply Chain & Procurement

#### Automated Quoting System
- **Quote creation and management**:
  - Create quotes from customer inquiries with product selection and quantities
  - **Quote type selection**: Turnkey (materials + labor) or Consignment (labor only)
  - Link quote to BOM for automatic material cost calculation
  - Quote versioning and revision tracking
  - Quote status: Draft, Pending Customer, Approved, Rejected, Converted to Order
  - Quote expiration dates and validity periods
- **Real-time pricing via supplier API integrations**:
  - **Supplier API connectors**: Digikey, Mouser, Future Electronics, Octopart, Arrow, Newark, Avnet, TTI
  - Automatic price fetching: Query multiple suppliers simultaneously for each component
  - Real-time inventory availability checking from suppliers
  - Multi-currency support and automatic exchange rate conversion
  - Pricing tiers: Unit price, quantity breaks, volume discounts
  - Lead time information from each supplier
- **Intelligent price comparison and supplier selection**:
  - Compare prices across all suppliers for each component
  - Smart supplier selection based on: Best price, availability, lead time, preferred supplier status
  - Split purchasing: Optimize by buying different parts from different suppliers
  - Total cost analysis: Component price + shipping + duties + handling fees
  - Price history tracking: Identify price trends and optimal purchasing times
  - Alternative component suggestions: API-based cross-reference and substitute parts
- **Quote cost calculation**:
  - **For Turnkey quotes**:
    - Material costs: Sum of all BOM items at current supplier pricing (from API integrations)
    - Labor costs: Estimated assembly time × labor rates (SMT/TH/MECH phases)
    - Overhead allocation: Factory overhead, utilities, equipment depreciation
    - Markup and profit margin configuration
    - Total quote: Materials + Labor + Overhead + Markup
  - **For Consignment quotes**:
    - Material costs: $0 (customer provides materials)
    - Labor costs: Estimated assembly time × labor rates (SMT/TH/MECH phases)
    - Overhead allocation: Factory overhead, utilities, equipment depreciation
    - Markup and profit margin configuration
    - Total quote: Labor + Overhead + Markup (NO material costs)
  - Quote line items: Itemized breakdown for customer transparency
  - Discount management: Customer-specific discounts, volume pricing
  - Material list generation: For consignment quotes, provide BOM list to customer
- **Quote approval workflow**:
  - Sales representative creates quote
  - Manager review and approval for quotes above threshold
  - Send quote to customer (PDF generation, email integration)
  - Customer acceptance tracking and electronic signature

#### Automated Procurement from Quote-to-Order (TURNKEY ORDERS ONLY)
- **Quote-to-order conversion**:
  - Convert approved quote to sales order with one click
  - **If Turnkey**: Trigger automated procurement workflow
  - **If Consignment**: Skip procurement, send material list to customer for them to provide
  - Lock pricing at quote acceptance (protect against price fluctuations for turnkey orders)
- **Automated parts-to-purchase generation**:
  - Analyze order BOM and calculate net material requirements
  - Check current inventory levels and allocated stock
  - Generate list of parts to purchase: Required qty - Available qty = Purchase qty
  - Apply purchasing rules: Minimum order quantities (MOQs), reel quantities, packaging constraints
  - Consolidate requirements across multiple orders for bulk purchasing
- **Intelligent purchase order generation**:
  - Auto-generate purchase orders for each supplier
  - Optimal supplier selection based on quote data (best price, availability, lead time)
  - PO number generation with sequential tracking
  - Line items with: Part number, manufacturer, quantity, unit price, extended price, lead time
  - Shipping address, billing address, delivery requirements
  - Payment terms and conditions
  - Requested delivery date based on production schedule
- **Purchase order approval workflow** (Manager checkpoint):
  - System generates PO and sends to purchasing manager for review
  - Manager dashboard: View all pending POs, pricing, suppliers, delivery dates
  - Approval actions: Approve, Reject, Request Changes
  - Approval rules: Auto-approve POs under $X, require approval above threshold
  - Multi-level approval: Department manager → Purchasing manager → Finance (for high-value POs)
  - Rejection reasons and feedback loop to procurement system
- **Automated PO transmission to suppliers**:
  - After manager approval, automatically send PO to supplier
  - Transmission methods:
    - EDI (Electronic Data Interchange) for major suppliers
    - Email with PDF attachment
    - Supplier portal API integration (for Digikey, Mouser, etc.)
    - Fax (legacy suppliers)
  - PO acknowledgment tracking: Confirm supplier received and accepted PO
  - Order confirmation and expected delivery date capture
- **Purchase order tracking and management**:
  - PO status: Draft, Pending Approval, Approved, Sent to Supplier, Acknowledged, In Transit, Received, Closed
  - Shipment tracking integration: Track packages via carrier APIs (UPS, FedEx, DHL)
  - Delivery alerts and notifications
  - Partial receipt handling: Receive partial shipments, track backorders
  - PO amendments: Handle changes, cancellations, quantity adjustments (requires re-approval)

#### Supplier Management & Material Receiving
- **Supplier database**: Contact information, payment terms, shipping terms, account numbers, performance tracking
- **Supplier-material relationships**: Link materials to preferred suppliers with negotiated pricing and lead times
- **Material receiving workflow** (differs by order type):
  - **Turnkey material receiving** (from suppliers):
    - Receive materials purchased via POs
    - **AQL sampling-based inspection** (price-driven inspection plans):
      - **Automatic sampling plan determination**:
        - System calculates sampling plan based on component unit price
        - Price tiers with different AQL levels (e.g., MIL-STD-105E / ANSI/ASQ Z1.4):
          - **High value** (>$50/unit): General Inspection Level II, AQL 0.65 (strict)
          - **Medium value** ($10-$50/unit): General Inspection Level II, AQL 1.5 (normal)
          - **Low value** (<$10/unit): General Inspection Level I, AQL 2.5 (reduced)
        - Configurable price thresholds and AQL levels per material type
        - Lot size determines sample size from AQL tables
      - **Sampling plan execution**:
        - System displays: Lot size, Sample size, Accept number, Reject number
        - Inspector randomly selects required sample quantity
        - Perform inspection on sample units (visual, dimensional, functional tests)
        - Record defects found in sample
        - **Accept lot**: Defects ≤ Accept number → Receive into inventory
        - **Reject lot**: Defects > Accept number → Create NCR, reject entire lot, return to supplier
      - **Inspection criteria by component type**:
        - Visual inspection: Damage, corrosion, markings, packaging
        - Dimensional inspection: Physical measurements vs specifications
        - Functional testing: Electrical testing, mechanical testing (as applicable)
        - Documentation verification: Certificates of conformance, test reports, datasheets
      - **Supplier quality history adjustment**:
        - Reduce sampling for certified/trusted suppliers (tightened → normal → reduced inspection)
        - Increase sampling for suppliers with poor history (switch to tightened inspection)
        - Track supplier lot acceptance rate and adjust AQL plans automatically
    - QC inspection result: Accept, Reject, Conditional Accept (use-as-is with deviation)
    - Receive into **company inventory** (inventory table) if accepted
    - Create NCR for rejected or non-conforming lots
    - Update PO status and quantities received
    - Generate receiving reports and update inventory transactions
  - **Consignment material receiving** (from customers):
    - Receive materials shipped by customer for their specific order
    - **QC inspection** (may use AQL sampling or 100% inspection based on agreement):
      - Verify against customer-provided BOM/packing list
      - Sample inspection for quantity verification and damage assessment
      - Document any discrepancies or damage
    - Receive into **consignment inventory** (consignment_inventory table) linked to customer and order
    - Tag materials as customer-owned, separate physical storage area
    - Notify customer of receipt and any discrepancies (critical for customer-owned materials)
    - Track consignment material expiration dates and storage conditions
- **Supplier performance metrics**: On-time delivery rates, quality metrics, pricing trends, defect rates

### Shipping & Fulfillment

**CRITICAL: Immutable Shipment Event Model**

Shipping documents (packing slips, invoices) are tied to **shipment events**, not orders. This prevents audit trail failures when orders are edited post-shipment.

**System-Enforced Controls:**

1. **Shipment Creation with Snapshot**:
   - Create shipment record when order is ready to ship
   - Capture snapshot: customer, products, quantities, **pricing at time of shipment**
   - Link shipment to order, but shipment is independent (order can be edited later)
   - **Code example**:
     ```typescript
     async createShipment(data: CreateShipmentDto) {
       return await this.dataSource.transaction(async manager => {
         // Get order with current pricing
         const order = await manager.findOne(Order, {
           where: { id: data.orderId },
           relations: ['customer', 'product']
         })

         // Create shipment record with snapshot
         const shipment = await manager.save(Shipment, {
           shipment_number: generateShipmentNumber(),  // SHIP-YYYYMMDD-####
           order_id: order.id,
           customer_id: order.customer_id,
           shipping_address: data.shippingAddress || order.customer.address,
           billing_address: data.billingAddress || order.customer.address,
           carrier: data.carrier,
           shipping_method: data.shippingMethod,
           status: 'PENDING',  // Not yet shipped
           total_weight: data.totalWeight,
           total_value: 0,  // Will be calculated from items
           created_at: new Date()
         })

         // Create shipment items with price snapshots
         let totalValue = 0
         for (const item of data.items) {
           const product = await manager.findOne(Product, { where: { id: item.productId }})
           const unitPrice = item.unitPrice || product.price  // Snapshot price at shipment time
           const extendedPrice = item.quantity * unitPrice

           await manager.save(ShipmentItem, {
             shipment_id: shipment.id,
             product_id: item.productId,
             quantity_shipped: item.quantity,
             unit_price_snapshot: unitPrice,  // IMMUTABLE snapshot
             extended_price_snapshot: extendedPrice,  // IMMUTABLE snapshot
             kit_id: item.kitId,  // For batch traceability
             serial_numbers: item.serialNumbers,
             lot_numbers: item.lotNumbers
           })

           totalValue += extendedPrice
         }

         // Update shipment total
         shipment.total_value = totalValue
         await manager.save(shipment)

         return shipment
       })
     }
     ```

2. **Mark Shipment as Shipped (Document Generation)**:
   - When status transitions to 'SHIPPED' → **Generate immutable documents**
   - Packing slip: List of items with quantities
   - Commercial invoice: Pricing based on shipment_items.unit_price_snapshot
   - Documents locked and cannot be edited (only voided and replaced)
   - **Code example**:
     ```typescript
     async markAsShipped(shipmentId: string, data: MarkAsShippedDto) {
       return await this.dataSource.transaction(async manager => {
         // Lock shipment with optimistic locking
         const shipment = await manager.findOne(Shipment, {
           where: { id: shipmentId },
           relations: ['items', 'items.product'],
           lock: { mode: 'optimistic', version: shipment.version }
         })

         if (shipment.status === 'SHIPPED') {
           throw new BadRequestException('Shipment already marked as shipped')
         }

         // Validate no open Critical NCRs on this order
         const criticalNCRs = await manager.find(NCR, {
           where: {
             order_id: shipment.order_id,
             severity: 'CRITICAL',
             status: Not(In(['CLOSED', 'REJECTED']))
           }
         })

         if (criticalNCRs.length > 0) {
           throw new ForbiddenException(
             `Cannot ship order with open Critical NCR: ${criticalNCRs[0].ncr_number}`
           )
         }

         // Update shipment status (IMMUTABLE AFTER THIS POINT)
         shipment.status = 'SHIPPED'
         shipment.shipped_at = new Date()
         shipment.shipped_by = currentUser.id
         shipment.tracking_number = data.trackingNumber
         shipment.version++  // Optimistic lock
         await manager.save(shipment)

         // Generate IMMUTABLE packing slip
         const packingSlip = await this.generatePackingSlip(shipment, manager)
         await manager.save(ShipmentDocument, {
           shipment_id: shipment.id,
           document_type: 'PACKING_SLIP',
           document_number: `PS-${shipment.shipment_number}`,
           generated_at: new Date(),
           generated_by: currentUser.id,
           document_version: 1,
           file_url: packingSlip.fileUrl,
           file_hash: generateFileHash(packingSlip.fileUrl),  // SHA-256 for tamper detection
           is_void: false
         })

         // Generate IMMUTABLE commercial invoice (with pricing)
         const invoice = await this.generateCommercialInvoice(shipment, manager)
         await manager.save(ShipmentDocument, {
           shipment_id: shipment.id,
           document_type: 'COMMERCIAL_INVOICE',
           document_number: `INV-${shipment.shipment_number}`,
           generated_at: new Date(),
           generated_by: currentUser.id,
           document_version: 1,
           file_url: invoice.fileUrl,
           file_hash: generateFileHash(invoice.fileUrl),
           is_void: false
         })

         return shipment
       })
     }
     ```

3. **Document Voiding and Replacement (Corrections)**:
   - If invoice needs correction → Void original, generate new version
   - Audit trail preserved: original + void + replacement
   - **Code example**:
     ```typescript
     async voidDocument(documentId: string, voidReason: string) {
       return await this.dataSource.transaction(async manager => {
         // Get original document
         const originalDoc = await manager.findOne(ShipmentDocument, {
           where: { id: documentId },
           relations: ['shipment', 'shipment.items']
         })

         if (originalDoc.is_void) {
           throw new BadRequestException('Document already voided')
         }

         // Void original document
         originalDoc.is_void = true
         originalDoc.void_reason = voidReason
         originalDoc.voided_at = new Date()
         originalDoc.voided_by = currentUser.id
         await manager.save(originalDoc)

         // Generate replacement document with corrected data
         const newDocument = await this.regenerateDocument(
           originalDoc.shipment,
           originalDoc.document_type,
           manager
         )

         // Save replacement document
         const replacement = await manager.save(ShipmentDocument, {
           shipment_id: originalDoc.shipment_id,
           document_type: originalDoc.document_type,
           document_number: `${originalDoc.document_number}-REV${originalDoc.document_version + 1}`,
           generated_at: new Date(),
           generated_by: currentUser.id,
           document_version: originalDoc.document_version + 1,
           file_url: newDocument.fileUrl,
           file_hash: generateFileHash(newDocument.fileUrl),
           is_void: false,
           notes: `Replacement for voided document ${originalDoc.document_number}`
         })

         // Link replacement back to voided document
         originalDoc.replacement_document_id = replacement.id
         await manager.save(originalDoc)

         return { voidedDocument: originalDoc, replacementDocument: replacement }
       })
     }
     ```

4. **Post-Shipment Order Edits**:
   - Order can be modified after shipment (pricing corrections, notes, etc.)
   - Shipment record is **IMMUTABLE** - unaffected by order edits
   - If new shipment needed → Create new shipment record (separate event)
   - If pricing dispute → Void invoice, generate corrected invoice or credit memo

**System Validation Rules (Enforced by Backend):**

1. **Shipment Item Immutability**:
   - Before UPDATE on shipment_items: Check if shipment.status = 'SHIPPED'
   - If shipped → Raise exception "Cannot modify shipped items"
   - User must void document and create correction if needed

2. **Document Generation Validation**:
   - Documents ONLY generated when shipment.status = 'SHIPPED'
   - Cannot generate documents for 'PENDING' or 'PACKED' shipments
   - One packing slip per shipment (generated once, immutable)
   - One commercial invoice per shipment (can be voided and replaced)

3. **Critical NCR Shipment Block**:
   - Before marking shipment as 'SHIPPED': Query open Critical NCRs for this order
   - If any found → BLOCK shipment with error message
   - User must close NCR or request executive override

**Features:**
- **Shipping methods management**: Configure carriers, shipping rates, delivery timeframes
- **Order fulfillment workflow**: Pick → Pack → Ship process with status tracking
- **Shipping integration**: Integration with carriers (UPS, FedEx, USPS) for label printing and tracking
- **Shipment tracking**: Real-time tracking updates via carrier APIs, delivery confirmation
- **Shipping cost calculation**: Automatic shipping cost estimation based on weight, dimensions, destination
- **Document generation**: Automated packing slip and commercial invoice generation at shipment event
- **Document versioning**: Void and replace documents with full audit trail
- **Batch traceability**: Link shipment_items to kits for complete material genealogy (recall support)

### Quality Management

#### NCR (Non-Conformance Report) System

**System-Enforced Controls (Hard Blocks):**

1. **Automatic Quarantine on NCR Creation:**
   - When NCR is created on material batch → System IMMEDIATELY moves affected quantity to **Quarantined status**
   - Quarantined inventory is **NOT available** for kitting, allocation, or use
   - Inventory tables track: `quantity_on_hand`, `quantity_allocated`, `quantity_quarantined`
   - Available = `quantity_on_hand - quantity_allocated - quantity_quarantined`
   - System prevents any consumption of quarantined materials
   - **REQUIRED: Immutable inventory transaction created on NCR creation:**
     ```typescript
     async createNCR(data: CreateNCRDto) {
       return await this.dataSource.transaction(async manager => {
         // Create NCR record
         const ncr = await manager.save(NCR, {
           ncr_number: generateNCRNumber(),
           material_batch_id: data.materialBatchId,
           severity: data.severity,
           affected_quantity: data.affectedQuantity,
           defect_description: data.defectDescription,
           status: 'OPEN',
           created_by: currentUser.id,
           created_at: new Date()
         })

         // Transition inventory to quarantined
         const inventory = await manager.findOne(Inventory, {
           where: { material_id: data.materialId },
           lock: { mode: 'optimistic' }
         })

         const currentState = determineCurrentState(inventory, data.affectedQuantity)
         inventory[`quantity_${currentState}`] -= data.affectedQuantity
         inventory.quantity_quarantined += data.affectedQuantity

         await manager.save(inventory)

         // REQUIRED: Create immutable transaction with NCR reference
         await manager.save(InventoryTransaction, {
           material_id: data.materialId,
           material_batch_id: data.materialBatchId,
           from_state: currentState,  // AVAILABLE, ALLOCATED, or PICKED
           to_state: 'QUARANTINED',
           quantity: data.affectedQuantity,
           reference_type: 'NCR',
           reference_id: ncr.id,
           ncr_id: ncr.id,  // REQUIRED for NCR transactions
           created_by: currentUser.id,
           created_at: new Date(),
           notes: `NCR ${ncr.ncr_number} created: ${data.defectDescription}`,
           digital_signature: generateSignature(...)
         })

         return ncr
       })
     }
     ```

2. **Critical NCR Shipment Block:**
   - If NCR severity = **Critical** and linked to finished product/order → System **HARD BLOCKS shipment**
   - Order status cannot progress to "Shipped" while Critical NCR is open
   - Shipping module validates: No open Critical NCRs on this order before allowing shipment
   - Override requires executive-level approval with audit trail

3. **NCR Closure Required for Inventory Release:**
   - Material remains **quarantined** until NCR is formally closed
   - NCR disposition must be completed: Scrap, Rework, Use-as-is (with approval), Return to supplier
   - **NCR status = Closed** → System automatically:
     - If disposition = **Scrap**: Moves quantity from quarantined to scrapped, updates inventory transactions
     - If disposition = **Rework**: Creates rework work order, keeps in quarantine until rework complete
     - If disposition = **Use-as-is**: Requires engineering approval, moves from quarantined back to available
     - If disposition = **Return to supplier**: Moves from quarantined to returned, updates supplier metrics
   - System enforces: NCR cannot be closed without disposition selection
   - Audit trail: Who closed NCR, when, what disposition, approval signatures

- **NCR creation and tracking**:
  - NCR number generation with sequential tracking (NCR-YYYY-####)
  - Create NCRs from multiple trigger points:
    - Incoming inspection (supplier material defects)
    - In-process inspection (production defects)
    - Final inspection (finished product defects)
    - Customer complaints (field failures)
  - **Link NCR to specific material batch/lot number** (critical for quarantine tracking)
  - Link NCR to: Supplier, Order, Kit, Customer, Production stage
  - NCR severity levels: Critical, Major, Minor
  - NCR status: Open, Under Investigation, Corrective Action In Progress, **Closed** (triggers inventory release), Rejected
  - **Affected quantity tracking**: System records exact quantity impacted by NCR
- **Non-conformance documentation**:
  - Defect description with photos/videos
  - Quantity affected and location found
  - Who discovered the issue and when
  - Material/product specifications vs actual measurements
  - Impact assessment: Scrap, rework, use-as-is, return to supplier
- **Root cause analysis**:
  - 5 Whys methodology tracking
  - Fishbone diagram support
  - Root cause categories: Material defect, Process issue, Equipment failure, Human error, Design flaw
  - Contributing factors documentation
- **Corrective and Preventive Actions (CAPA)**:
  - Immediate containment actions to prevent further defects
  - Corrective actions: Fix the specific issue
  - Preventive actions: Prevent recurrence across all products/processes
  - Assign responsibility and due dates for CAPA
  - Track CAPA completion and effectiveness verification
- **NCR approval workflow**:
  - Quality inspector creates NCR → **System immediately quarantines affected quantity**
  - Quality manager reviews and approves
  - Engineering disposition required (scrap, rework, use-as-is, return)
  - Management approval for high-severity NCRs
  - **System validation before NCR closure**:
    - Disposition must be selected (cannot be null)
    - Use-as-is disposition requires engineering approval signature
    - Corrective action plan must be documented
    - CAPA completion verified

**System Validation Rules (Enforced by Backend):**

1. **Inventory Consumption Prevention:**
   - Before kitting: System checks `available_qty = on_hand - allocated - quarantined`
   - If material has `quantity_quarantined > 0`, that quantity is NOT available for allocation
   - Kitting module cannot pull quarantined materials

2. **Shipment Validation:**
   - Before order status changes to "Shipped": System queries for open Critical NCRs on this order
   - Query: `SELECT * FROM ncr WHERE order_id = ? AND severity = 'CRITICAL' AND status != 'CLOSED'`
   - If any results → **BLOCK shipment with error message**: "Cannot ship order with open Critical NCR: NCR-YYYY-####"
   - User must close NCR or request executive override

3. **NCR Closure Enforcement:**
   - API endpoint `PATCH /ncr/:id/close` requires `disposition` in request body
   - Backend validation: `if (!disposition) throw new BadRequestException('Disposition required to close NCR')`
   - On successful closure → **IMMUTABLE inventory transaction MUST be created**:
     ```typescript
     async closeNCR(ncrId: string, disposition: Disposition, approvals: Approvals) {
       return await this.dataSource.transaction(async manager => {
         const ncr = await manager.findOne(NCR, { where: { id: ncrId }})

         // Validate disposition
         if (!disposition) throw new BadRequestException('Disposition required')
         if (disposition === 'USE_AS_IS' && !approvals.engineeringApproval) {
           throw new ForbiddenException('Engineering approval required')
         }

         // Get inventory record
         const inventory = await manager.findOne(Inventory, {
           where: { material_id: ncr.material_id },
           lock: { mode: 'optimistic', version: inventory.version }
         })

         // Disposition-specific state transitions
         switch (disposition) {
           case 'SCRAP':
             // Transition: QUARANTINED → SCRAPPED
             inventory.quantity_quarantined -= ncr.affected_quantity
             inventory.quantity_scrapped += ncr.affected_quantity

             // REQUIRED: Create immutable transaction with NCR reference
             await manager.save(InventoryTransaction, {
               material_id: ncr.material_id,
               material_batch_id: ncr.material_batch_id,
               from_state: 'QUARANTINED',
               to_state: 'SCRAPPED',
               quantity: ncr.affected_quantity,
               reference_type: 'NCR',
               reference_id: ncrId,
               ncr_id: ncrId,  // REQUIRED for NCR transactions
               created_by: currentUser.id,
               created_at: new Date(),
               notes: `NCR ${ncr.ncr_number}: Scrapped - ${ncr.defect_description}`,
               digital_signature: generateSignature(...)  // Tamper detection
             })
             break

           case 'USE_AS_IS':
             // Transition: QUARANTINED → PICKED (return to original state)
             inventory.quantity_quarantined -= ncr.affected_quantity
             inventory.quantity_picked += ncr.affected_quantity

             // REQUIRED: Create immutable transaction with NCR reference
             await manager.save(InventoryTransaction, {
               material_id: ncr.material_id,
               material_batch_id: ncr.material_batch_id,
               from_state: 'QUARANTINED',
               to_state: 'PICKED',
               quantity: ncr.affected_quantity,
               reference_type: 'NCR',
               reference_id: ncrId,
               ncr_id: ncrId,  // REQUIRED for NCR transactions
               created_by: currentUser.id,
               created_at: new Date(),
               notes: `NCR ${ncr.ncr_number}: Use-as-is approved by ${approvals.engineeringApproval.approver}`,
               digital_signature: generateSignature(...)
             })
             break

           case 'REWORK':
             // Material stays QUARANTINED, create rework work order
             await createReworkWorkOrder(ncr)

             // REQUIRED: Create immutable transaction (no state change yet)
             await manager.save(InventoryTransaction, {
               material_id: ncr.material_id,
               material_batch_id: ncr.material_batch_id,
               from_state: 'QUARANTINED',
               to_state: 'QUARANTINED',  // Stays quarantined
               quantity: ncr.affected_quantity,
               reference_type: 'NCR',
               reference_id: ncrId,
               ncr_id: ncrId,  // REQUIRED for NCR transactions
               created_by: currentUser.id,
               created_at: new Date(),
               notes: `NCR ${ncr.ncr_number}: Rework initiated - WO ${reworkWO.number}`,
               digital_signature: generateSignature(...)
             })
             // Note: When rework completes, another transaction: QUARANTINED → PICKED
             break

           case 'RETURN_TO_SUPPLIER':
             // Transition: QUARANTINED → (removed from inventory)
             inventory.quantity_quarantined -= ncr.affected_quantity

             // REQUIRED: Create immutable transaction with NCR reference
             await manager.save(InventoryTransaction, {
               material_id: ncr.material_id,
               material_batch_id: ncr.material_batch_id,
               from_state: 'QUARANTINED',
               to_state: 'RETURNED_TO_SUPPLIER',
               quantity: ncr.affected_quantity,
               reference_type: 'NCR',
               reference_id: ncrId,
               ncr_id: ncrId,  // REQUIRED for NCR transactions
               created_by: currentUser.id,
               created_at: new Date(),
               notes: `NCR ${ncr.ncr_number}: Returned to supplier ${ncr.supplier.name}`,
               digital_signature: generateSignature(...)
             })

             await createSupplierReturn(ncr)
             break
         }

         // Update NCR status
         ncr.status = 'CLOSED'
         ncr.disposition = disposition
         ncr.closed_by = currentUser.id
         ncr.closed_at = new Date()

         await manager.save(inventory)
         await manager.save(ncr)

         return ncr
       })
     }
     ```

**Critical Requirements (Non-Negotiable):**

1. ✅ **Every NCR action creates inventory transaction** - No exceptions
2. ✅ **ncr_id field is populated** - Links transaction to NCR for traceability
3. ✅ **Transactions are immutable** - Database permissions prevent UPDATE/DELETE
4. ✅ **Digital signature generated** - Tamper detection hash
5. ✅ **Transaction created in same database transaction** - Atomicity guaranteed
6. ✅ **Includes NCR details in notes** - Full context preserved
- **Supplier NCR communication**:
  - Automatically notify supplier of material defects
  - Request supplier CAPA and response
  - Track supplier response time and corrective actions
  - Link to supplier performance metrics
- **NCR reporting and analytics**:
  - NCR trends by supplier, material, product, production phase
  - Pareto analysis: Most frequent defect types
  - Cost of quality tracking: Scrap costs, rework labor, downtime
  - Repeat NCR detection (same issue recurring)
  - Regulatory compliance reporting (FDA, ISO 9001)

#### RMA (Return Merchandise Authorization) System
- **RMA request and creation**:
  - Customer-initiated RMA requests via portal or email
  - RMA number generation (RMA-YYYY-####)
  - Link to original order, customer, product, invoice
  - Return reason categories:
    - Defective/not working
    - Wrong item shipped
    - Damaged in shipping
    - Customer error/unwanted
    - Warranty claim
    - Engineering change/upgrade
  - RMA status: Requested, Approved, Rejected, In Transit, Received, Under Inspection, Resolved, Closed
- **RMA approval workflow**:
  - Customer service reviews request
  - Check warranty status and return eligibility
  - Approve/reject RMA with justification
  - Generate RMA authorization document with return instructions
  - Provide customer with RMA number and shipping label
  - Set RMA expiration date (e.g., 30 days to return)
- **Return receiving and inspection**:
  - Receive returned product, scan RMA number
  - Quality inspection of returned product:
    - Verify defect claimed by customer
    - Determine actual root cause
    - Document condition with photos
    - Create NCR if quality issue found
  - Disposition decision:
    - Full refund (credit customer account)
    - Replacement (ship new unit)
    - Repair and return
    - Partial refund (restocking fee)
    - Reject return (customer error, out of warranty)
- **RMA processing actions**:
  - **Refund**: Process credit to customer account or payment method
  - **Replacement**: Create new sales order, expedite shipping
  - **Repair**: Create work order for repair, track repair costs
  - **Scrap**: Dispose of defective unit, update inventory
  - Track turnaround time from receipt to resolution
- **Warranty tracking**:
  - Link products to warranty terms (duration, coverage)
  - Track warranty start date (ship date or install date)
  - Automatic warranty validation during RMA approval
  - Extended warranty management
  - Warranty cost tracking and claims analysis
- **RMA analytics and reporting**:
  - Return rate by product, customer, time period
  - Return reason analysis (identify product quality issues)
  - RMA cost tracking: Shipping, refunds, replacements, repairs
  - Customer satisfaction metrics for RMA process
  - Identify products with high return rates (quality problems)
  - Link RMA data to NCR system for continuous improvement
- **Customer communication**:
  - Automated emails: RMA approved, return received, status updates, resolution
  - RMA tracking portal for customers
  - Customer feedback collection on RMA experience
- **Integration with other systems**:
  - Create NCR automatically from RMA inspection findings
  - Link to inventory (returned units back to stock if applicable)
  - Financial integration: Credit memos, refund processing
  - Link to kitting/traceability (identify which materials/batches caused defect)

### Production & Operations
- **Flexible inventory allocation management**:
  - Allocate inventory to specific orders when order is confirmed
  - Cancel allocation and return materials to available inventory pool
  - Reallocate materials between orders (move allocation from Order A to Order B)
  - Allocation history tracking: View which orders a material was allocated to over time
  - Allocation priority rules: Allocate based on due date, customer priority, or order value
  - Partial allocation support: Allocate available quantity and track remaining shortfall
- **Production workflow and status controls**:
  - Order status progression: Pending → Confirmed → Allocated → **In Production** → Completed
  - **Point of no return**: Once order status changes to "In Production", no modifications allowed
  - Production lock enforcement:
    - Cannot cancel orders in production
    - Cannot modify quantities, BOMs, or specifications
    - Cannot reallocate inventory once production has started
    - Cannot change due dates (requires manager override with justification)
  - Pre-production validation: Ensure all materials allocated before allowing production start
  - Production release authorization: Require supervisor/manager approval to release to production
  - **Executive-level production lock override** (top-level emergency control):
    - Executives only: Revert production lock and unlock orders already in production
    - Capability to modify locked orders: Change quantities, reallocate inventory, cancel production
    - Requires multi-factor authentication and executive credentials verification
    - Mandatory override justification: Business reason, impact assessment, corrective action plan
    - Automatic escalation alerts: Notify senior management and stakeholders
    - Enhanced audit trail: Video/photo documentation option, incident report generation
    - Review and approval: Executive override decisions subject to post-action review
    - Limited use cases: Critical defects found, customer emergency requests, material recalls, safety issues
- **Kitting module for material traceability**:
  - **Three-phase kitting by resource type**:
    - **SMT Kit** (Surface Mount Technology): Materials for SMT assembly process
      - Kit ID format: ORDER-###-SMT
      - Contains: SMT components, solder paste, stencils
      - Issued to SMT production line/pick-and-place machines
    - **TH Kit** (Through-Hole): Materials for through-hole assembly process
      - Kit ID format: ORDER-###-TH
      - Contains: Through-hole components, wave solder materials
      - Issued to through-hole assembly/manual insertion stations
    - **MECH Kit** (Mechanical Assembly): Materials for mechanical assembly
      - Kit ID format: ORDER-###-MECH
      - Contains: Hardware, enclosures, cables, connectors, fasteners
      - Issued to mechanical assembly/final assembly stations
  - **Kit creation and management**:
    - Generate separate kits for each resource type based on BOM resource_type column
    - Auto-split order BOM into three kit types (SMT, TH, MECH)
    - Each kit type has independent lifecycle and tracking
    - Kit ID/number generation linked to order/work order number with resource type suffix
    - Physical kit location tracking (bin, shelf, staging area) per kit type
    - Kit status per type: Pending, In Progress, Complete, Issued to Production
    - Kit dependency tracking: TH kit may depend on SMT kit completion (PCB flow)
  - **Material assignment to kits** (source depends on order type - BATCH-LEVEL TRACKING):
    - **Turnkey orders**:
      - Scan/assign materials from **company batch inventory** (batch_inventory where inventory_type='COMPANY')
      - Pull from specific batches with FIFO/FEFO logic (First-In-First-Out or First-Expired-First-Out)
      - **CRITICAL**: Record batch_id in kit_items table for each material pulled (NOT just material_id)
      - Deduct from batch_inventory.quantity_available for specific batches
      - State transition: AVAILABLE → PICKED for each batch used
      - Create immutable inventory_transaction with batch_id and kit_id reference
    - **Consignment orders**:
      - Scan/assign materials from **consignment batch inventory** (batch_inventory where inventory_type='CONSIGNMENT')
      - Pull from customer-owned batches for this specific customer/order
      - **CRITICAL**: Record batch_id in kit_items table for full traceability
      - Deduct from consignment batch_inventory for this customer/order
      - State transition: AVAILABLE → PICKED for consignment batches
      - Create immutable inventory_transaction with batch_id, customer_id, order_id, kit_id
    - Track exact quantities and **specific batch numbers** pulled for each kit type (SMT/TH/MECH)
    - Record who created each kit, when, and from which batch locations (batch_number, lot_number, supplier)
    - Verify kit completeness against BOM (filtered by resource_type) before releasing to production
    - Separate picking lists generated for each kit type and order type (Turnkey/Consignment) with batch numbers
    - **Traceability chain**: Kit Item → Material Batch → Supplier (complete genealogy)
  - **Job-to-material traceability**:
    - Complete material genealogy: Trace back which batches/lots were used in each phase (SMT/TH/MECH)
    - Bi-directional traceability: Find all jobs that used a specific material batch (critical for recalls)
    - Material consumption tracking: Actual vs. planned usage per job and per kit type
    - Scrap and waste tracking: Record unused materials returned from each kit type
    - Phase-specific traceability: Track materials through SMT → TH → MECH assembly progression
  - **Kit lifecycle management**:
    - Issue each kit type to appropriate production area with digital signature/approval:
      - SMT kits → SMT production line
      - TH kits → Through-hole assembly stations
      - MECH kits → Mechanical assembly area
    - Track each kit type progress through its specific production stages
    - Record material consumption during production per kit type (which materials were actually used)
    - Handle kit modifications per type: Add materials, substitute materials, return excess
    - Kit closeout per type: Return unused materials to inventory, reconcile actual vs. planned usage
    - Assembly progression tracking: Monitor flow from SMT → TH → MECH completion
  - **Quality control and compliance**:
    - Link quality inspection results to specific kits and material batches
    - Certificate of conformance (CoC) tracking for materials in kit
    - Regulatory compliance: FDA, ISO, automotive industry traceability requirements
    - Recall management: Identify all affected jobs if a material batch is recalled
  - **Kitting reports and analytics**:
    - Kit preparation time and labor tracking per kit type (SMT/TH/MECH)
    - Material shortage reports during kitting by resource type
    - Kit accuracy metrics per type (correct materials, correct quantities)
    - Aging kits report by type (kits not yet issued to production)
    - Kit type completion dashboard: Track SMT → TH → MECH progression across all active orders
    - Bottleneck analysis: Identify which kit type is causing delays
    - Resource utilization: Track which assembly phase (SMT/TH/MECH) has capacity constraints
- **Production/work order tracking**: Track manufacturing progress, labor hours, machine time
- **Multi-level BOMs** (>2 levels deep): Support for complex assembly hierarchies
- **Advanced MRP features**: Lead times, safety stock, forecasting, Master Production Schedule (MPS)
- **Batch and serial number tracking**: Traceability for materials and finished goods (integrates with kitting module)
- **Quality control workflows**: In-process inspection, defect tracking, corrective actions

### Administration & Reporting
- **User authentication and authorization**:
  - JWT-based authentication with secure login/logout
  - Password hashing and security best practices
  - Session management and token refresh
- **Role-based permissions system**:
  - Predefined roles: Admin, Manager, Production Supervisor, Warehouse Staff, Sales Representative
  - Granular permissions: Create, Read, Update, Delete (CRUD) permissions per module
  - Custom role creation with specific permission sets
  - Module-level access control (Orders, Inventory, BOM, Products, Materials, Customers)
  - Action-level permissions (e.g., can view orders but not delete, can adjust inventory but not view costs)
  - Field-level security (hide sensitive data like costs from certain roles)
- **User management**:
  - User profile management, password reset, account activation/deactivation
  - Assignment of roles to users, support for multiple roles per user
  - User activity logging and session history
- **Comprehensive audit logging and activity tracking**:
  - Full activity log for every user action (create, read, update, delete operations)
  - Detailed timestamps (date, time, timezone) for all activities
  - Track what was changed: Before/after values for all data modifications
  - User identification: Username, role, IP address, device/browser information
  - **Manager override tracking**:
    - Log all override requests (e.g., approve orders beyond credit limit, adjust locked inventory)
    - Approval workflow: Request reason, approver identity, approval/rejection timestamp
    - Override justification notes and supporting documentation
    - Configurable approval chains (e.g., supervisors can override up to $X, managers beyond that)
  - **Activity audit reports**:
    - Search and filter logs by user, date range, action type, module
    - Export audit logs for compliance and review
    - Retention policy management for historical logs
    - Alerts for suspicious activities or policy violations
  - **Compliance and security**:
    - Immutable audit trail (logs cannot be edited or deleted)
    - Secure log storage with encryption
    - Integration with SIEM (Security Information and Event Management) systems
- **Cost tracking and pricing**: Material costs, labor costs, overhead allocation, product pricing
- **Reporting and analytics dashboard**: Custom reports, KPIs, trend analysis, data visualization
- **Email notifications**: Low stock alerts, order updates, shipping notifications, production alerts

### Mobility & Integration
- **Mobile app**: Warehouse/production floor app for inventory management, order picking, receiving
- **Barcode scanning**: Mobile barcode scanning for inventory transactions, order fulfillment
- **Import/export functionality**: Bulk data import (CSV, Excel), custom report exports
- **API for third-party integrations**: REST API for connecting with accounting systems, e-commerce platforms

These features can be added incrementally after the core MVP is stable and tested.

## Critical Implementation Details

### MRP Calculation Logic

```typescript
// Pseudo-code for material requirements calculation
function calculateRequiredQuantity(order, bomItem) {
  const baseQty = order.quantity * bomItem.quantityRequired;
  const scrapMultiplier = 1 + (bomItem.scrapFactor / 100);
  return Math.ceil(baseQty * scrapMultiplier * 100) / 100;
}

// Example:
// Order: 10 units of Product A
// BOM Item: Product A requires 5 units of Material X with 10% scrap factor
// Calculation: 10 * 5 * 1.10 = 55 units of Material X required
```

### TypeORM Repository Pattern

```typescript
// Example service using TypeORM repository
@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private productsRepository: Repository<Product>,
  ) {}

  async findAll(): Promise<Product[]> {
    return this.productsRepository.find();
  }

  async findOne(id: string): Promise<Product> {
    const product = await this.productsRepository.findOne({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async create(createDto: CreateProductDto): Promise<Product> {
    const product = this.productsRepository.create(createDto);
    return this.productsRepository.save(product);
  }

  async update(id: string, updateDto: UpdateProductDto): Promise<Product> {
    await this.productsRepository.update(id, updateDto);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    await this.productsRepository.delete(id);
  }
}
```

### Auto-generation Patterns

**Order Numbers:** `ORD-YYYYMMDD-####`
- Format: ORD-20250115-0001, ORD-20250115-0002, etc.
- Sequence resets daily

**Entity IDs:** UUID or auto-incrementing integers (SERIAL)
- Managed by PostgreSQL and TypeORM
- Primary keys are unique and indexed

### Inventory Calculation

```typescript
quantity_available = quantity_on_hand - quantity_allocated
```

**MVP version:** No allocation (all on-hand is available)
```typescript
quantity_available = quantity_on_hand
```

**Future:** Allocate inventory to confirmed orders to prevent over-committing

## Critical Files Summary

**Backend:**
1. `backend/src/entities/*.entity.ts` - TypeORM entities (database schema)
   - `material-batch.entity.ts` - Batch/lot tracking entity
   - `batch-inventory.entity.ts` - Batch-level inventory (SOURCE OF TRUTH)
   - `inventory-transaction.entity.ts` - IMMUTABLE audit trail with batch_id
   - `supplier.entity.ts` - Supplier information for batch traceability
2. `backend/src/config/typeorm.config.ts` - Database configuration
3. `backend/src/modules/mrp/mrp.service.ts` - Core business logic (material requirements with batch aggregation)
4. `backend/src/modules/orders/orders.service.ts` - Order management with repository
5. `backend/src/modules/inventory/inventory.service.ts` - Batch inventory tracking with state transitions and optimistic locking
6. `backend/src/modules/material-batches/material-batches.service.ts` - Batch receiving and management
7. `backend/src/modules/products/products.service.ts` - Product management
8. `backend/src/modules/bom/bom.service.ts` - BOM management
9. `backend/src/database/migrations/*` - Database schema migrations

**Frontend:**
1. `frontend/src/lib/api.ts` - API client (all backend communication including batch endpoints)
2. `frontend/src/components/forms/order-form.tsx` - Order entry (primary workflow)
3. `frontend/src/app/page.tsx` - Dashboard (system overview with batch alerts)
4. `frontend/src/app/orders/page.tsx` - Order list and management
5. `frontend/src/app/inventory/page.tsx` - Batch inventory tracking with material/batch toggle views
6. `frontend/src/components/forms/batch-inventory-adjustment-form.tsx` - State transition form for batch inventory
7. `frontend/src/app/inventory/receive/page.tsx` - Material batch receiving workflow
8. `frontend/src/components/ui/*` - Reusable UI components

**Infrastructure:**
- `docker-compose.yml` - PostgreSQL database service
- `backend/.env` - Database connection configuration
- `frontend/.env.local` - API endpoint configuration

## Success Criteria (MVP)

✅ **Core Workflow:** User can enter an order and immediately see material requirements
✅ **Material Requirements:** System accurately calculates required quantities based on BOM and scrap factors
✅ **Inventory Visibility:** System shows shortfalls vs available inventory for each order
✅ **Manual Inventory Management:** User can view and manually adjust inventory levels
✅ **Dashboard:** Dashboard shows current system state at a glance (orders, low stock, shortfalls)
✅ **Audit Trail:** All inventory changes are logged in transactions
✅ **Data Persistence:** All data persists reliably in PostgreSQL database
✅ **Database Transactions:** Inventory adjustments use database transactions for data integrity
✅ **User Experience:** Clean UI with proper loading states and error handling

## Architectural Components Implementation Roadmap

The implementation plan defines architectural controls and data structures that are **future-ready** but not all implemented in MVP. This section clarifies the implementation timeline.

### **Phase 1: MVP (Current Focus)**

**What's Implemented:**
- ✅ Hard service boundaries via NestJS module exports (services only, not repositories)
- ✅ ESLint rules to enforce architectural boundaries
- ✅ Domain services with transaction support (accept optional EntityManager parameter)
- ✅ InventoryService as single arbiter for inventory mutations (material-level only)
- ✅ READ-ONLY modules (MRP, Reports) with no cross-domain mutations
- ✅ Simplified material-level inventory (no batch tracking)
- ✅ Basic order workflow (order entry → MRP → shortage reports)

**Database Schema:**
- ✅ All 17 tables created (future-ready schema)
- ✅ Only 6 MVP entities implemented in backend modules (Product, Material, Customer, BomItem, Order, Inventory)
- ✅ 11 future-ready tables exist but have no backend modules yet (MaterialBatch, BatchInventory, Kit, KitItem, User, Role, etc.)

**Why This Approach:**
- MVP focuses on core workflow: Order Entry → MRP → Shortage Reports
- Future-ready database schema prevents breaking changes later
- Architectural controls are in place, ready to scale

### **Phase 2: Multi-Step Workflows (Post-MVP)**

**When Application Service Layer Gets Implemented:**

The Application Service Layer (transaction coordinator) will be implemented when MVP adds workflows that:
1. **Span multiple domains atomically** (e.g., confirm order + allocate inventory + check NCRs)
2. **Require cross-domain validation** (e.g., cannot ship with open Critical NCR)
3. **Need multi-step rollback** (e.g., allocation fails → rollback order confirmation)

**Trigger Features for Application Service Layer:**
- ✅ Order confirmation with automatic inventory allocation
- ✅ Shipment creation with document generation
- ✅ Kit issuance with inventory consumption
- ✅ NCR workflow integration (quarantine inventory, block shipments)

**Implementation Pattern (Already Defined):**
```typescript
// backend/src/application-services/order-fulfillment.service.ts
@Injectable()
export class OrderFulfillmentService {
  constructor(
    private ordersService: OrdersService,
    private inventoryService: InventoryService,
    private ncrService: NCRService,
    private dataSource: DataSource
  ) {}

  async confirmOrderAndAllocate(orderId: string): Promise<Order> {
    return await this.dataSource.transaction(async (manager) => {
      // Step 1: Confirm order
      const order = await this.ordersService.confirmOrder(orderId, manager)

      // Step 2: Check for open Critical NCRs
      const criticalNCRs = await this.ncrService.getOpenCriticalNCRs(order.id, manager)
      if (criticalNCRs.length > 0) {
        throw new BusinessRuleException(`Cannot confirm order with open Critical NCR`)
      }

      // Step 3: Allocate inventory
      const requirements = await this.mrpService.calculateRequirements(orderId)
      for (const req of requirements) {
        await this.inventoryService.transitionState(
          req.materialId, req.quantity, 'AVAILABLE', 'ALLOCATED',
          { type: 'ORDER', id: orderId },
          manager  // Same transaction
        )
      }

      return order
    })
  }
}
```

### **Phase 3: Batch Tracking & Kits (Post-MVP)**

**When Batch Tracking Gets Implemented:**

Batch/lot tracking will be implemented when the system needs:
1. **Supplier batch traceability** (which supplier lot was used in which production run)
2. **Expiration date tracking** (time-sensitive materials)
3. **Inspection status per batch** (passed/failed/pending inspection)
4. **Quarantine management** (NCR holds on specific batches)

**Entities to Implement:**
- MaterialBatch entity + backend module
- BatchInventory entity + backend module
- InventoryTransaction with batch_id tracking
- Frontend batch receiving workflow
- Frontend batch-level inventory views

**When Kits Get Implemented:**

Kitting will be implemented when production workflow requires:
1. **Pre-kitting materials** for production stages (SMT/TH/MECH)
2. **Batch traceability** (which batches were used in which kit)
3. **Partial kit handling** (issue/return flows)
4. **Production consumption tracking** (kits consumed in production)

**Entities to Implement:**
- Kit entity + backend module
- KitItem entity + backend module
- Kit status workflow (PENDING → IN_PROGRESS → COMPLETE → ISSUED → CONSUMED)
- Frontend kit creation and management UI
- Integration with InventoryService for consumption tracking

### **Phase 4: Quality System (NCR, Shipments, Documents) (Post-MVP)**

**When NCR/Quality Gets Implemented:**

NCR (Non-Conformance Report) system will be implemented when:
1. **Inspection failures** need to be tracked and managed
2. **Quarantine holds** need to block inventory from production
3. **Disposition workflows** need approval (SCRAP, REWORK, USE_AS_IS, RETURN)
4. **Cross-domain invariants** need enforcement (cannot ship with open Critical NCR)

**When Shipments Get Implemented:**

Shipment tracking will be implemented when:
1. **Immutable shipment records** are needed (audit trail)
2. **Document generation** is required (packing slips, commercial invoices, BOL)
3. **Price snapshots** at shipment time are needed (protect against order edits)
4. **Document versioning** with void/replace patterns

**Entities to Implement:**
- NCR entity + backend module + workflow
- Shipment, ShipmentItem, ShipmentDocument entities + modules
- Document generation service (PDF creation)
- Cross-domain invariant enforcement in Application Service Layer

### **Phase 5: User Roles & Authentication (Post-MVP)**

**When User/Role System Gets Implemented:**

User authentication and role-based access control will be implemented when:
1. **Multi-user access** is required (multiple people using the system)
2. **Audit trails** need to track who performed actions (created_by, approved_by)
3. **Role separation** is required (who can open NCRs, who can close NCRs, who can approve dispositions)
4. **Quality system compliance** requires role-based access (ISO 9001, AS9100)

**Entities to Implement:**
- User entity + backend module + authentication
- Role entity + backend module
- UserRole entity + permission checking
- Frontend login pages
- JWT token-based authentication
- Role-based UI element visibility

## Out of Scope (Post-MVP / Future Phases)

**Not included in MVP:**
- Purchase order generation and management
- Receiving inspection workflow
- User authentication and authorization
- Batch/lot tracking
- Kitting workflow
- NCR/quality management
- Shipment tracking and document generation

**Future Enhancements (see "Future Enhancements" section above):**
- Cost tracking and pricing
- Production/work order tracking
- Multi-level BOMs (>2 levels)
- Advanced MRP features (lead times, safety stock, forecasting)
- Multi-user roles and permissions
- Reporting and analytics
- Mobile app
- Email notifications
- Barcode scanning

These can be added incrementally after core functionality is stable and tested.
