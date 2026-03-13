# Proposed Changes - Implementation Discussion Plan

> **Status**: ✅ APPROVED - Implementation in progress
> **Created**: February 12, 2026
> **Last Updated**: March 13, 2026

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Feature 1: BOM Where-Used Analysis](#feature-1-bom-where-used-analysis)
3. [Feature 2: Allocation Lifecycle & Return Workflow](#feature-2-allocation-lifecycle--return-workflow)
4. [Feature 3: Physical Counting & Reconciliation](#feature-3-physical-counting--reconciliation)
5. [Feature 4: Order Status Redesign](#feature-4-order-status-redesign)
6. [Feature 5: In-Process Parts Tracking](#feature-5-in-process-parts-tracking)
7. [Feature 6: UID Status Tracking](#feature-6-uid-status-tracking)
8. [Cross-Feature Dependencies](#cross-feature-dependencies)
9. [Implementation Order](#implementation-order)
10. [Appendix: Industry Reference](#appendix-industry-reference)

---

## Executive Summary

### Features Overview

| # | Feature | Description | Effort |
|---|---------|-------------|--------|
| 1 | BOM Where-Used Analysis | Know which parts are used on which products/orders | 10 hrs |
| 2 | Allocation Lifecycle & Return Workflow | PICKED/ISSUED states, return with counting, waste tracking | 49 hrs |
| 3 | Physical Counting & Reconciliation | Variance reporting, manager notifications, ad-hoc counts | 25 hrs |
| 4 | Order Status Redesign | New 7-status workflow (ENTERED→KITTING→SMT→TH→SHIPPED) | 20 hrs |
| 5 | In-Process Parts Tracking | Dashboard showing floor inventory, return recommendations | 24 hrs |
| 6 | UID Status Tracking | Full UID lifecycle history, global search, barcode scanning | 33 hrs |
| | **TOTAL** | | **161 hrs** |

### Key Architectural Changes

| Change | Impact |
|--------|--------|
| New UID statuses | FLOOR_STOCK added for materials between jobs |
| New order statuses | 7 total (5 standard + 2 exception) replacing current 6 |
| Waste rule system | Hybrid rule-based waste % with approval workflow |
| UID history tracking | Full timeline of every status change per UID |
| Parallel receiving | Material receiving tracked separately from order status |

---

## Feature 1: BOM Where-Used Analysis

### Requirements
- Know which parts are used on multiple BOMs
- See all products using a specific part
- Know how many open orders need a part
- Know total products using a part

### Decisions

| Topic | Decision |
|-------|----------|
| BOM scope | Active revisions only |
| Order filter | Standard open order statuses |
| Frontend location | Tab on Material Detail Page |
| Future expansion | Historical pricing, lead times (later) |
| Implementation | Query-based (no schema changes) |

### Endpoints

```
GET /materials/:id/where-used
GET /materials/:id/usage-summary
```

### UI Location
- Material Detail Page → "Where Used" tab
- Full page space for future additions (pricing, lead times)

### Effort: 10 hours

---

## Feature 2: Allocation Lifecycle & Return Workflow

### Requirements
- Clear visibility into allocation states
- Return workflow with counting
- Waste tracking with rule-based percentages
- Variance reporting to manager

### Decisions

#### Allocation States

| Status | Description | qty_on_hand Impact |
|--------|-------------|-------------------|
| ACTIVE | Reserved in system, physically in warehouse | No change |
| PICKED | Pulled to kitting/staging area | No change |
| ISSUED | Released to production floor | No change |
| FLOOR_STOCK | On floor between jobs (not tied to any job) | No change |
| CONSUMED | Used in production | **Decreased** |
| RETURNED | Unused, back to warehouse | No change (becomes AVAILABLE) |
| CANCELLED | Reservation released | No change |

#### State Transitions

| Rule | Decision | Future-Ready |
|------|----------|--------------|
| Forward skipping | Allowed (silent auto-fill) | Can add restrictions |
| Backward transitions | Allowed | Can add restrictions |
| Permission to skip | Anyone | Can add role-based permissions |

#### Return Workflow

| Topic | Decision |
|-------|----------|
| SMT materials | Return after SMT OR keep on floor (FLOOR_STOCK) |
| TH materials | Return after TH |
| Counting | Required for all returns |
| TH auto-consume | If issued qty = required qty (exactly equal) |
| SMT auto-consume | Never - always manual count required |
| Waste recording | Separate SCRAP transaction |
| Variance reporting | Manager email summary when job/kit returned |
| Variance resolution | Flexible - manager can resolve but not enforced |

#### Waste % Rule System

| Topic | Decision |
|-------|----------|
| Approach | Hybrid (rule hierarchy with overrides) |
| Rule scope | Global (same rules for all customers/products) |
| Approval workflow | System suggests → requires approval → manager can override |
| Auto-detection | Parse package size from description (0402, 0805, etc.) |

**Rule Hierarchy (Priority Order):**
1. BOM line item override (manual)
2. Material-level override (manual)
3. Material attribute rules (package_size, mounting_type)
4. Description pattern rules (regex match)
5. Global default (e.g., 2%)

#### New Quantities to Track

```
qty_on_hand:    Physical total (unchanged until CONSUMED)
qty_allocated:  ACTIVE state
qty_picked:     PICKED state
qty_issued:     ISSUED state (on floor)
qty_floor_stock: FLOOR_STOCK state
qty_available:  on_hand - allocated - picked - issued - floor_stock
```

### Schema Changes

**New Tables:**
```sql
waste_rules (
  id, name, package_size, mounting_type, component_type,
  description_pattern, waste_percentage, priority, is_active
)
```

**Material Additions:**
```sql
materials (
  + package_size VARCHAR(20)
  + mounting_type VARCHAR(20)  -- SMT, TH
  + component_type VARCHAR(50)
  + waste_override DECIMAL(5,2)
)
```

**BOM Item Additions:**
```sql
bom_items (
  + waste_percentage DECIMAL(5,2)
  + waste_source VARCHAR(20)  -- 'RULE', 'MATERIAL', 'OVERRIDE', 'DEFAULT'
  + waste_approved_by VARCHAR(100)
  + waste_approved_at TIMESTAMP
)
```

### Effort: 49 hours (24 base + 25 waste system)

---

## Feature 3: Physical Counting & Reconciliation

### Requirements
- Physical inventory counts
- Compare theoretical vs actual
- Variance reporting to manager
- Ad-hoc counting for audits

### Decisions

| Topic | Decision |
|-------|----------|
| Primary counting | Integrated into return workflow (Feature 2) |
| Count frequency | Every time material returns from production |
| Count granularity | Individual UID/reel level |
| Variance notification | Manager email summary per completed job return |
| Variance resolution | Flexible - manager can resolve but not enforced |
| Ad-hoc counting | Supported for audits, spot checks |

### Integration with Return Workflow

The return workflow (Feature 2) IS the primary counting process:
- Material returns from production → counted
- Variance calculated automatically
- Manager notified via summary email
- Inventory updated with actual count

### Email Summary Format

```
Subject: Return Summary - ORD-2026-042

Order: ORD-2026-042
Customer: Acme Corp
Returned by: John Smith
Date: Feb 11, 2026

VARIANCE SUMMARY
─────────────────────────────────────────────
Items with variance: 2 of 15

Material      │ UID       │ Expected │ Actual │ Variance
RES-22K       │ REEL-089  │ 74 pcs   │ 0 pcs  │ -74 pcs
R0402-10K     │ REEL-001  │ 7,900    │ 7,850  │ -50 pcs
─────────────────────────────────────────────
Total Variance: -124 pcs

View details: [Link]
```

### Ad-Hoc Count Screen

For annual audits, spot checks, or counts outside production:
- Scan/enter UID
- View current system qty
- Enter counted qty
- Select reason (annual audit, spot check, etc.)
- Submit count

### Effort: 25 hours

---

## Feature 4: Order Status Redesign

### Requirements
- Reduce number of statuses to minimum viable
- Reflect actual production workflow
- Support SMT-only, TH-only, and SMT+TH orders
- Handle exceptions (hold, cancel)

### Decisions

#### Order Statuses (7 total)

| Status | Description |
|--------|-------------|
| **ENTERED** | Order received, ready for kitting |
| **KITTING** | Materials being pulled and staged |
| **SMT** | SMT production in process |
| **TH** | TH production in process |
| **SHIPPED** | Production complete, packaged, shipped |
| **ON_HOLD** | Paused (any reason) |
| **CANCELLED** | Cancelled (pre-production only) |

#### Order Flows

```
SMT + TH:   ENTERED → KITTING → SMT → TH → SHIPPED
SMT only:   ENTERED → KITTING → SMT → SHIPPED
TH only:    ENTERED → KITTING → TH → SHIPPED

Any status → ON_HOLD → Resume to previous status
ENTERED or KITTING → CANCELLED
```

#### Order Type Detection

Automatically determined from BOM resource types:
- BOM has SMT + TH resources → SMT & TH order
- BOM has SMT only → SMT only order
- BOM has TH only → TH only order

#### Transitions & Material Actions

| Transition | Trigger | Material Action |
|------------|---------|-----------------|
| ENTERED → KITTING | Planner releases OR operator starts | Begin allocation, PICKED |
| KITTING → SMT | Operator starts SMT | SMT items → ISSUED |
| SMT → TH | SMT complete | Return/FLOOR_STOCK SMT materials; TH items → ISSUED |
| SMT → SHIPPED | SMT complete (SMT-only) | Return/FLOOR_STOCK all materials |
| TH → SHIPPED | TH complete | Return/FLOOR_STOCK TH materials |
| Any → ON_HOLD | Manual | Materials unchanged |
| ON_HOLD → Previous | Manual | Materials unchanged |
| ENTERED/KITTING → CANCELLED | Manual | Release all allocations |

#### Other Decisions

| Topic | Decision |
|-------|----------|
| QC tracking | Separate from order status (not in scope now) |
| PACKAGING status | Removed - combined with SHIPPED |
| RECEIVING | Parallel tracking (not an order status) |
| Qty reduction | Edit with audit trail (not a status) |
| Backwards movement | Not allowed (forward only) |
| Quote verification | Outside system for now (future enhancement) |

### Effort: 20 hours

---

## Feature 5: In-Process Parts Tracking

### Requirements
- Know which parts are on production floor
- Know which parts can be returned after job completion
- Recommend keep vs return based on upcoming jobs

### Decisions

| Topic | Decision |
|-------|----------|
| Return recommendations | System suggests based on user-selected upcoming jobs |
| Job selection | User selects which jobs to compare (not time-based) |
| In-process view | Dedicated dashboard |
| Filters | By material, status, job |

### Return Recommendation Flow

When returning materials after a job:
1. User selects upcoming jobs to compare against
2. System analyzes which materials are needed
3. Shows recommendation per UID:
   - ★ KEEP - needed by selected jobs
   - ↩ RETURN - not needed by selected jobs
   - ⚠ SHORT - needed but insufficient quantity

### In-Process Inventory Dashboard

Dedicated view showing:
- Summary cards (ISSUED count, FLOOR_STOCK count, total value)
- ISSUED to active jobs section
- FLOOR_STOCK (between jobs) section
- Filters by material, status, job
- Actions: Return to warehouse, export CSV

### Effort: 24 hours

---

## Feature 6: UID Status Tracking

### Requirements
- Track each UID with full lifecycle history
- Handle complex multi-job scenarios
- Quick lookup via barcode scanning

### Decisions

| Topic | Decision |
|-------|----------|
| UID history | Full timeline of every status change |
| Usage metrics | Track: total qty used, total waste, jobs served |
| UID lookup | Dedicated page + inventory page + global search |
| Barcode scanning | Yes - scan-to-lookup supported |

### UID Status Model (Complete)

```
RECEIVED → AVAILABLE ←→ ALLOCATED → PICKED → ISSUED ←→ FLOOR_STOCK
                ↑                              ↓
                └──────── RETURNED ←───────────┘
                                               ↓
                                           CONSUMED

Exception: ON_HOLD (can apply to AVAILABLE status)
```

### UID Entity Additions

```sql
inventory_lots (
  + total_qty_used DECIMAL(12,4)     -- Cumulative qty consumed
  + total_waste DECIMAL(12,4)        -- Cumulative waste recorded
  + jobs_served INT                  -- Count of jobs served
  + current_order_id UUID            -- Which job currently has it
  + previous_order_id UUID           -- Last job it served
  + floor_stock_since TIMESTAMP      -- When became FLOOR_STOCK
)
```

### UID History Table

```sql
uid_status_history (
  id UUID PRIMARY KEY,
  uid_id UUID REFERENCES inventory_lots(id),
  previous_status VARCHAR(20),
  new_status VARCHAR(20),
  order_id UUID,
  quantity_before DECIMAL(12,4),
  quantity_after DECIMAL(12,4),
  changed_by VARCHAR(100),
  changed_at TIMESTAMP,
  reason TEXT
)
```

### UID Lookup Locations

| Location | Access |
|----------|--------|
| Dedicated page | `/inventory/uid/:uid` |
| Inventory page | Click UID in list |
| Global search | Search bar accepts UID |
| Barcode scan | Triggers global search |

### UID Detail View Includes

- Current status and quantity
- Material info and package type
- Supplier and PO reference
- Owner (company or customer)
- Usage history (jobs served with qty used/waste)
- Full timeline of all status changes

### Effort: 33 hours

---

## Cross-Feature Dependencies

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DEPENDENCY GRAPH                                     │
└─────────────────────────────────────────────────────────────────────────────┘

Feature 4: Order Status Redesign
    │
    │ (foundation - defines workflow)
    │
    ├───────────────────────┬───────────────────────┐
    │                       │                       │
    ▼                       ▼                       ▼
Feature 2:              Feature 5:              Feature 6:
Allocation Lifecycle    In-Process Tracking     UID Status Tracking
    │                       │                       │
    │                       │                       │
    ▼                       │                       │
Feature 3:                  │                       │
Physical Counting ←─────────┴───────────────────────┘
    │
    │ (uses return workflow from Feature 2)
    │
    └─────────────────────────────────────────────────


Feature 1: BOM Where-Used
    │
    └──► Independent - can implement anytime
```

### Dependency Summary

| Feature | Depends On | Enables |
|---------|------------|---------|
| Feature 1 | None | None |
| Feature 2 | Feature 4 (order statuses) | Features 3, 5, 6 |
| Feature 3 | Feature 2 (return workflow) | None |
| Feature 4 | None | Features 2, 5, 6 |
| Feature 5 | Features 2 & 4 | None |
| Feature 6 | Features 2 & 4 | None |

---

## Implementation Order

### Recommended Phases

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 1: Foundation (40 hours)                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ 1a. Feature 4: Order Status Redesign                          20 hrs       │
│     - New order statuses (ENTERED, KITTING, SMT, TH, SHIPPED)               │
│     - Order type auto-detection from BOM                                    │
│     - Status transition logic                                               │
│                                                                             │
│ 1b. Feature 1: BOM Where-Used Analysis                         10 hrs       │
│     - Can run in parallel with 1a                                           │
│     - Independent, no dependencies                                          │
│                                                                             │
│ 1c. Feature 2 (Part 1): Allocation States                      10 hrs       │
│     - Add PICKED, ISSUED, FLOOR_STOCK statuses                              │
│     - State transition logic                                                │
│     - Basic pick/issue/return actions                                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 2: Core Workflows (64 hours)                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ 2a. Feature 2 (Part 2): Return Workflow                        14 hrs       │
│     - Return screen with counting                                           │
│     - Keep on floor (FLOOR_STOCK) option                                    │
│     - Auto-consume logic (TH exact match)                                   │
│                                                                             │
│ 2b. Feature 2 (Part 3): Waste % Rule System                    25 hrs       │
│     - Waste rules table and CRUD                                            │
│     - Auto-detection from description                                       │
│     - Approval workflow on BOM import                                       │
│                                                                             │
│ 2c. Feature 3: Physical Counting & Reconciliation              25 hrs       │
│     - Variance tracking and reporting                                       │
│     - Manager email notifications                                           │
│     - Ad-hoc count screen                                                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 3: Visibility & Tracking (57 hours)                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ 3a. Feature 5: In-Process Parts Tracking                       24 hrs       │
│     - In-process inventory dashboard                                        │
│     - Return recommendations with job selector                              │
│                                                                             │
│ 3b. Feature 6: UID Status Tracking                             33 hrs       │
│     - UID history tracking                                                  │
│     - UID detail page                                                       │
│     - Global search with barcode scanning                                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Phase Summary

| Phase | Features | Hours | Cumulative |
|-------|----------|-------|------------|
| Phase 1 | Foundation (4, 1, 2-part1) | 40 | 40 |
| Phase 2 | Core Workflows (2-part2&3, 3) | 64 | 104 |
| Phase 3 | Visibility & Tracking (5, 6) | 57 | 161 |

### Timeline Estimate

Assuming 1 developer at ~30 productive hours/week:

| Phase | Duration |
|-------|----------|
| Phase 1 | ~1.5 weeks |
| Phase 2 | ~2 weeks |
| Phase 3 | ~2 weeks |
| **Total** | **~5.5 weeks** |

---

## Appendix: Industry Reference

### Cetec ERP Learnings

Based on research of [Cetec ERP documentation](https://cetecerp.com/support/documentation/picking.html):

1. **Material Flow**: AVAILABLE → ALLOCATED → PICKED → ISSUED → CONSUMED
2. **Inventory stays on books until order ships/completes**
3. **Pre-allocation for customer-specific inventory** (we have via ownership dimension)
4. **FIFO bin suggestion for picking** (future enhancement)
5. **Pick queue workflow** (future enhancement)

### Key Adoptions

| Cetec Feature | Our Implementation |
|---------------|-------------------|
| Allocation states | ACTIVE, PICKED, ISSUED, CONSUMED |
| Floor stock | FLOOR_STOCK status (between jobs) |
| WIP tracking | ISSUED status = on floor |
| Return workflow | Counting + variance reporting |

### Deferred to Future

- Pick queue workflow
- FIFO bin suggestion
- Barcode scanning for picking (we have lookup, not picking)
- Location-level tracking (we have floor yes/no, not specific location)

---

## Approval

### ✅ Approved (February 12, 2026)

- [x] Feature 1: BOM Where-Used Analysis
- [x] Feature 2: Allocation Lifecycle & Return Workflow
- [x] Feature 3: Physical Counting & Reconciliation
- [x] Feature 4: Order Status Redesign
- [x] Feature 5: In-Process Parts Tracking
- [x] Feature 6: UID Status Tracking

### Implementation Started

1. ✅ Discrepancy analysis completed
2. ✅ Data inspection queries run
3. ✅ All blocking decisions resolved
4. 🔄 Phase 1 implementation in progress

### Additional Modules Completed (March 2026)

- ✅ **Kitting Module** — Full kitting workflow: create aggregated kitting list from multiple orders, print pick sheet (SMT/TH separated), scan UIDs to verify kit completion, shortage reporting. 4 entities, 7 endpoints, full frontend with barcode scanning UX.
- ✅ **PO History Archive** — Import historical vendor PO records from Excel (SPO sheet), searchable archive on Purchase Orders page. One-time import, full-text search across all fields.

---

*Document generated from discussion session on February 12, 2026*
*Approved for implementation: February 12, 2026*
