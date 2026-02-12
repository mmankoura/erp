# Implementation Discrepancy Report

> **Purpose**: Identify conflicts between proposed changes and current architecture
> **Date**: February 12, 2026
> **Status**: ✅ RESOLVED - All decisions made, proceeding with implementation

---

## Summary

| Category | Discrepancies Found | Severity | Resolution |
|----------|---------------------|----------|------------|
| Order Status | 1 Major | 🔴 High | ✅ RESOLVED |
| Allocation Status | 1 Minor | 🟡 Medium | ✅ RESOLVED |
| UID/Lot Status | 1 Major | 🔴 High | ✅ RESOLVED |
| Field Naming | 2 Conflicts | 🟡 Medium | ✅ RESOLVED |
| Existing Fields | 1 Clarification Needed | 🟡 Medium | ✅ RESOLVED |
| Service Logic | 1 Major Rework | 🔴 High | ✅ RESOLVED |

## Data Inspection Results (February 12, 2026)

| Table | Finding | Implication |
|-------|---------|-------------|
| orders | 4 records, all CONFIRMED | Simple migration |
| materials.package | Empty (0 records) | Safe to rename |
| bom_items.scrap_factor | 753 records, all 0.00 | Safe to rename |
| inventory_lots | 478 records, all ACTIVE | No migration needed |
| inventory_allocations | 0 records | No migration needed |

---

## Discrepancy 1: Order Status Enum

### Current State
```typescript
// order.entity.ts - Line 21-28
export enum OrderStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  IN_PRODUCTION = 'IN_PRODUCTION',
  SHIPPED = 'SHIPPED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}
```

### Proposed State
```typescript
export enum OrderStatus {
  ENTERED = 'ENTERED',
  KITTING = 'KITTING',
  SMT = 'SMT',
  TH = 'TH',
  SHIPPED = 'SHIPPED',
  ON_HOLD = 'ON_HOLD',
  CANCELLED = 'CANCELLED',
}
```

### Conflict Analysis

| Current | Proposed | Mapping |
|---------|----------|---------|
| PENDING | ENTERED | Rename |
| CONFIRMED | (removed) | Merge into ENTERED or remove |
| IN_PRODUCTION | SMT / TH | Split into two |
| SHIPPED | SHIPPED | Keep |
| COMPLETED | (removed) | Merge into SHIPPED |
| CANCELLED | CANCELLED | Keep |
| (new) | KITTING | Add |
| (new) | ON_HOLD | Add |

### Impact
- **Database Migration**: Need to migrate existing orders from old statuses to new
- **Service Layer**: `orders.service.ts` has status transition logic that needs complete rewrite
- **Frontend**: All status displays and filters need updating
- **API Contracts**: Any external systems using status will break

### Resolution Required
**Question for User**: How should we map existing orders?
- PENDING → ENTERED?
- CONFIRMED → ENTERED or KITTING?
- IN_PRODUCTION → SMT or TH? (Need to check BOM resource types)
- COMPLETED → SHIPPED?

---

## Discrepancy 2: Allocation Status Enum

### Current State
```typescript
// inventory-allocation.entity.ts - Line 17-23
export enum AllocationStatus {
  ACTIVE = 'ACTIVE',       // Reserved, still in stock
  PICKED = 'PICKED',       // Phase 3: Picked from stock, staged
  ISSUED = 'ISSUED',       // Phase 3: Issued to WIP / production
  CONSUMED = 'CONSUMED',   // Materials used
  CANCELLED = 'CANCELLED', // Reservation cancelled
}
```

### Proposed State
```typescript
export enum AllocationStatus {
  ACTIVE = 'ACTIVE',
  PICKED = 'PICKED',
  ISSUED = 'ISSUED',
  FLOOR_STOCK = 'FLOOR_STOCK',  // NEW
  CONSUMED = 'CONSUMED',
  RETURNED = 'RETURNED',         // NEW
  CANCELLED = 'CANCELLED',
}
```

### Conflict Analysis
✅ **Good News**: PICKED and ISSUED already exist in the codebase!
⚠️ **Additions Needed**: FLOOR_STOCK, RETURNED

### Impact
- **Database Migration**: Add two new enum values
- **Service Layer**: Add state transition logic for new states
- **No Breaking Changes**: Existing allocations remain valid

### Resolution
Simple addition - no mapping required for existing data.

---

## Discrepancy 3: UID/Lot Status Model

### Current State
```typescript
// inventory-lot.entity.ts - Line 25-30
export enum LotStatus {
  ACTIVE = 'ACTIVE',
  CONSUMED = 'CONSUMED',
  EXPIRED = 'EXPIRED',
  ON_HOLD = 'ON_HOLD',
}
```

The `inventory_lots` table has its own `status` field using `LotStatus` enum.

### Proposed State
We proposed tracking UID status based on allocation states (AVAILABLE, ALLOCATED, PICKED, ISSUED, FLOOR_STOCK, CONSUMED, RETURNED).

### Conflict Analysis
**Two different status models exist:**
1. `inventory_lots.status` (LotStatus enum)
2. `inventory_allocations.status` (AllocationStatus enum)

### Questions Requiring Resolution

**Q1: How do these two statuses relate?**
- Is `LotStatus` the "physical" status of the reel/lot?
- Is `AllocationStatus` the "logical" status per order?

**Q2: When a lot is ISSUED to an order, what is:**
- `inventory_lots.status` = ?
- `inventory_allocations.status` = ISSUED?

**Q3: For our FLOOR_STOCK concept:**
- Should this be on `inventory_lots.status` (new LotStatus value)?
- Or on `inventory_allocations.status` (already planned)?
- Or both?

### Proposed Resolution

| Scenario | inventory_lots.status | inventory_allocations.status |
|----------|----------------------|------------------------------|
| Reel in warehouse, not allocated | ACTIVE | (no record) |
| Reel reserved for order | ACTIVE | ACTIVE |
| Reel pulled to kitting | ACTIVE | PICKED |
| Reel on production floor | ACTIVE | ISSUED |
| Reel between jobs (floor stock) | ACTIVE | FLOOR_STOCK (new) |
| Reel fully consumed | CONSUMED | CONSUMED |
| Reel returned to warehouse | ACTIVE | RETURNED |
| Reel on quality hold | ON_HOLD | (allocation paused?) |
| Reel expired | EXPIRED | (allocation cancelled?) |

**Recommendation**: Keep `inventory_lots.status` for physical/quality state. Use `inventory_allocations.status` for workflow state. The "UID status" shown to users is derived from the allocation status when allocated, or lot status when not.

---

## Discrepancy 4: Field Naming - Package vs Package Size

### Current State
```typescript
// material.entity.ts - Line 36-37
@Column({ nullable: true })
package: string;
```

### Proposed State
```typescript
package_size: VARCHAR(20)  // '0402', '0805', 'SOT-23', etc.
mounting_type: VARCHAR(20) // 'SMT', 'TH'
```

### Conflict Analysis
- `package` already exists and may contain values like "0402", "REEL", "TRAY", etc.
- We're proposing `package_size` which is conceptually similar

### Questions Requiring Resolution
**Q1: What data is currently in the `package` field?**
- Is it package sizes (0402, 0805)?
- Is it package types (REEL, TRAY, TUBE)?
- Or mixed?

**Q2: Should we:**
- Rename `package` to `package_size`?
- Keep `package` as-is and add `package_size` separately?
- Parse existing `package` values to populate `package_size`?

### Recommendation
Inspect existing data, then decide:
```sql
SELECT DISTINCT package FROM materials WHERE package IS NOT NULL LIMIT 50;
```

---

## Discrepancy 5: Scrap Factor vs Waste Percentage

### Current State
```typescript
// bom-item.entity.ts - Line 67-68
@Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
scrap_factor: number;
```

### Proposed State
```typescript
waste_percentage: DECIMAL(5,2)
waste_source: VARCHAR(20)  -- 'RULE', 'MATERIAL', 'OVERRIDE', 'DEFAULT'
waste_approved_by: VARCHAR(100)
waste_approved_at: TIMESTAMP
```

### Conflict Analysis
- `scrap_factor` already exists on `bom_items`
- We proposed `waste_percentage` with approval workflow

### Questions Requiring Resolution
**Q1: Is `scrap_factor` the same concept as `waste_percentage`?**
- If yes: Rename and add approval fields
- If no: Keep both (different purposes)

**Q2: What are current `scrap_factor` values?**
```sql
SELECT scrap_factor, COUNT(*) FROM bom_items GROUP BY scrap_factor;
```

### Recommendation
If semantically equivalent:
- Rename `scrap_factor` → `waste_percentage`
- Add `waste_source`, `waste_approved_by`, `waste_approved_at`
- Migrate existing values: set `waste_source = 'LEGACY'`

---

## Discrepancy 6: Orders Service - Status Transition Logic

### Current State
```typescript
// orders.service.ts - Line 477-507
private validateStatusTransition(from: OrderStatus, to: OrderStatus): void {
  const allowedTransitions: Record<OrderStatus, OrderStatus[]> = {
    [OrderStatus.PENDING]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
    [OrderStatus.CONFIRMED]: [OrderStatus.IN_PRODUCTION, OrderStatus.SHIPPED, OrderStatus.CANCELLED],
    [OrderStatus.IN_PRODUCTION]: [OrderStatus.SHIPPED, OrderStatus.COMPLETED, OrderStatus.CANCELLED],
    [OrderStatus.SHIPPED]: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
    [OrderStatus.COMPLETED]: [],
    [OrderStatus.CANCELLED]: [],
  };
  // ...
}
```

Also:
```typescript
// Line 32-42
const ACTIVE_STATUSES = [
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.IN_PRODUCTION,
];

const TERMINAL_STATUSES = [
  OrderStatus.COMPLETED,
  OrderStatus.CANCELLED,
];
```

### Impact
Complete rewrite required:
1. New transition rules
2. New active/terminal status definitions
3. Material return triggers at SMT→TH and TH→SHIPPED
4. ON_HOLD logic (pause and resume)

### Resolution
Map new transitions:
```typescript
const allowedTransitions: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.ENTERED]: [OrderStatus.KITTING, OrderStatus.ON_HOLD, OrderStatus.CANCELLED],
  [OrderStatus.KITTING]: [OrderStatus.SMT, OrderStatus.TH, OrderStatus.ON_HOLD, OrderStatus.CANCELLED],
  [OrderStatus.SMT]: [OrderStatus.TH, OrderStatus.SHIPPED, OrderStatus.ON_HOLD],
  [OrderStatus.TH]: [OrderStatus.SHIPPED, OrderStatus.ON_HOLD],
  [OrderStatus.SHIPPED]: [],  // Terminal
  [OrderStatus.ON_HOLD]: [/* return to previous status */],
  [OrderStatus.CANCELLED]: [],  // Terminal
};
```

---

## Discrepancy 7: Transaction Types - Already Has SCRAP

### Current State
```typescript
// inventory-transaction.entity.ts - Line 13-24
export enum TransactionType {
  ADJUSTMENT = 'ADJUSTMENT',
  RECEIPT = 'RECEIPT',
  CONSUMPTION = 'CONSUMPTION',
  RETURN = 'RETURN',
  SCRAP = 'SCRAP',           // ✅ Already exists!
  MOVE = 'MOVE',
  ISSUE_TO_WO = 'ISSUE_TO_WO',
  RETURN_FROM_WO = 'RETURN_FROM_WO',
  SHIPMENT = 'SHIPMENT',
}
```

### Resolution
✅ **No conflict** - SCRAP transaction type already exists. We can use it directly for waste tracking.

---

## Discrepancy 8: Resource Type Enum - Already Complete

### Current State
```typescript
// bom-item.entity.ts - Line 12-18
export enum ResourceType {
  SMT = 'SMT',
  TH = 'TH',
  MECH = 'MECH',
  PCB = 'PCB',
  DNP = 'DNP',
}
```

### Resolution
✅ **No conflict** - SMT and TH resource types already exist. We can use these to auto-detect order type.

---

## Action Items Before Implementation

### Must Resolve (Blocking)

| # | Item | Owner Decision Needed |
|---|------|----------------------|
| 1 | Order status migration mapping | How to map PENDING, CONFIRMED, IN_PRODUCTION, COMPLETED to new statuses |
| 2 | UID status model | Clarify relationship between LotStatus and AllocationStatus |
| 3 | Package field | Keep, rename, or replace with package_size |
| 4 | Scrap factor | Rename to waste_percentage or keep both |

### Can Proceed (Non-Blocking)

| # | Item | Action |
|---|------|--------|
| 1 | Add FLOOR_STOCK, RETURNED to AllocationStatus | Simple enum addition |
| 2 | Add ON_HOLD to OrderStatus | Part of status redesign |
| 3 | Use existing SCRAP transaction type | No change needed |
| 4 | Use existing ResourceType for order detection | No change needed |

---

## Recommended Pre-Implementation Steps

1. **Run data inspection queries** to understand current field values
2. **Decide on field naming** (package vs package_size, scrap_factor vs waste_percentage)
3. **Define status migration** for existing orders
4. **Clarify UID status model** (lot status vs allocation status)
5. **Update implementation plan** with final decisions
6. **Create migration scripts** with rollback capability

---

## Data Inspection Queries

Run these to inform decisions:

```sql
-- Check current package field values
SELECT DISTINCT package, COUNT(*) as cnt
FROM materials
WHERE package IS NOT NULL
GROUP BY package
ORDER BY cnt DESC
LIMIT 50;

-- Check current scrap_factor values
SELECT scrap_factor, COUNT(*) as cnt
FROM bom_items
GROUP BY scrap_factor
ORDER BY scrap_factor;

-- Check current order statuses
SELECT status, COUNT(*) as cnt
FROM orders
WHERE deleted_at IS NULL
GROUP BY status;

-- Check current lot statuses
SELECT status, COUNT(*) as cnt
FROM inventory_lots
GROUP BY status;

-- Check current allocation statuses
SELECT status, COUNT(*) as cnt
FROM inventory_allocations
GROUP BY status;
```

---

*Report generated from codebase analysis on February 12, 2026*

---

## Final Resolutions (Approved February 12, 2026)

### 1. Order Status Migration
**Decision**: Map CONFIRMED → ENTERED
**Rationale**: Only 4 orders exist, all in CONFIRMED. Kitting hasn't started, so ENTERED is appropriate.
**Migration**: Simple UPDATE statement in migration script.

### 2. Package Field
**Decision**: Rename `package` → `package_size`
**Rationale**: Field is empty (no data loss). New name better reflects purpose.
**Migration**: ALTER TABLE RENAME COLUMN.

### 3. Scrap Factor → Waste Percentage
**Decision**: Rename `scrap_factor` → `waste_percentage`, add approval fields
**Rationale**: All 753 records have default 0.00. No custom values to preserve.
**Migration**:
- Rename column
- Add `waste_source` (default 'DEFAULT')
- Add `waste_approved_by`, `waste_approved_at`

### 4. UID Status Model
**Decision**: Keep dual-status system
- `inventory_lots.status` (LotStatus) = Physical/quality state
- `inventory_allocations.status` (AllocationStatus) = Workflow state
- Add FLOOR_STOCK, RETURNED to AllocationStatus

**Rationale**: No allocations exist yet. Clean separation of concerns.

### 5. Orders Service Rewrite
**Decision**: Complete rewrite of status transition logic
**New transitions**:
```typescript
const allowedTransitions: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.ENTERED]: [OrderStatus.KITTING, OrderStatus.ON_HOLD, OrderStatus.CANCELLED],
  [OrderStatus.KITTING]: [OrderStatus.SMT, OrderStatus.TH, OrderStatus.ON_HOLD, OrderStatus.CANCELLED],
  [OrderStatus.SMT]: [OrderStatus.TH, OrderStatus.SHIPPED, OrderStatus.ON_HOLD],
  [OrderStatus.TH]: [OrderStatus.SHIPPED, OrderStatus.ON_HOLD],
  [OrderStatus.SHIPPED]: [],
  [OrderStatus.ON_HOLD]: [/* return to previous status */],
  [OrderStatus.CANCELLED]: [],
};
```

---

## Implementation Proceeding

All blocking items resolved. Beginning Phase 1 implementation.
