# Codebase Health Check — Manual Verification Checklist

> **Date**: March 17, 2026
> **Scope**: 44+ fixes across 42 files (334 insertions, 254 deletions)

---

## Phase 1: Security & Data Integrity

### Path Traversal (Attachments)
- [ ] Upload an attachment to a valid entity (e.g., a material or order)
- [ ] Verify the file is saved and retrievable
- [ ] Attempt to upload with a malicious entity type (e.g., `../../etc`) — should be rejected with 400

### BOM Import DTO Validation
- [ ] Import a BOM with valid items — should succeed
- [ ] Import a BOM with malformed items array (e.g., missing required fields) — should return validation errors, not silently accept

### Sequence Number Generation (Race Safety)
- [ ] Create a new Purchase Order — verify PO number is generated correctly
- [ ] Create a new Order — verify order number is generated correctly
- [ ] Create a new Kitting List — verify list number is generated correctly
- [ ] Create a new Cycle Count — verify count number is generated correctly
- [ ] Create a new Receiving Session — verify session number is generated correctly
- [ ] Create a Receiving Inspection — verify inspection number is generated correctly

### PO Receiving Transaction Consistency
- [ ] Receive items against a PO line — verify both PO line update and inspection record are created
- [ ] If possible, simulate a failure mid-receive — verify no partial state (inspection without PO update or vice versa)

---

## Phase 2: Routes & HTTP Errors

### Purchase Order Routes
- [ ] `GET /purchase-orders/number/{poNumber}` — verify it returns the correct PO (was previously shadowed by `:id`)
- [ ] `GET /purchase-orders/{uuid}` — verify it still works
- [ ] `GET /purchase-orders/history` — verify PO history endpoint still responds

### Error Responses
- [ ] Trigger a bad request on Receiving Inspection endpoints — verify 400 (not 500)
- [ ] Trigger a bad request on AML endpoints (e.g., import with bad file) — verify 400
- [ ] Trigger a bad request on MRP endpoint (e.g., missing required param) — verify 400

---

## Phase 3: Frontend Bugs

### Orders Page — MRP Shortages
- [ ] Navigate to Orders page — verify shortages display correctly (no blank/error from type mismatch)
- [ ] Verify shortage badges/indicators render properly

### Receiving Form — Keyboard Shortcut
- [ ] Go to Receiving > New session
- [ ] Press Ctrl+Enter — verify it triggers confirm receive (not infinite re-render)
- [ ] Verify the form doesn't fire the handler multiple times

### Supplier Dialog — Stale Data
- [ ] Open supplier edit dialog for Supplier A, modify fields, close without saving
- [ ] Open supplier edit dialog for Supplier B — verify it shows Supplier B's data (not Supplier A's stale data)
- [ ] Open create new supplier dialog — verify all fields are blank

### BOM Import Wizard — Quantity Validation
- [ ] Start a BOM import, map IPN column but do NOT map QTY column
- [ ] Attempt to proceed — should be blocked with a validation message about quantity mapping
- [ ] Map both IPN and QTY — should allow proceeding

---

## Phase 4: Data Correctness

### Soft-Delete Filtering
- [ ] Soft-delete a material, then query inventory — verify deleted material's inventory doesn't appear
- [ ] Soft-delete an attachment — verify it no longer appears in listings
- [ ] Verify BOM import doesn't match against soft-deleted materials

### Inventory Import — Zero Unit Cost
- [ ] Import inventory with a line where unit_cost = 0 — verify it saves as 0 (not null)
- [ ] Import inventory with a line where unit_cost is blank — verify it saves as null

### Filter DTO Defaults
- [ ] Call inventory filter without specifying `logic` param — verify it defaults to `'OR'`
- [ ] Call materials filter without specifying `logic` param — verify it defaults to `'OR'`

### Kitting — Lot Status Filter
- [ ] Create/view a kitting list — verify it correctly picks up ACTIVE lots only (not broken by enum mismatch)

---

## Phase 5: Consistency

### Entity Barrel Exports
- [ ] Backend compiles cleanly (`npx tsc --noEmit`) — confirms all new exports resolve

### Production Log Stages
- [ ] Create a production log entry — verify `from_stage` and `to_stage` save as valid `ProductionStage` enum values
- [ ] View production history — verify stages display correctly

### Breadcrumb Labels
- [ ] Navigate to `/production` — verify breadcrumb shows "Production" (not "production")
- [ ] Navigate to `/kitting` — verify breadcrumb shows "Kitting"
- [ ] Navigate to `/cycle-counts` — verify breadcrumb shows "Cycle Counts"
- [ ] Navigate to `/bom` — verify breadcrumb shows "BOM"
- [ ] Navigate to `/bom/validate` — verify breadcrumb shows "Validate"
- [ ] Navigate to `/settings/users` — verify breadcrumb shows "Users"

---

## Phase 6: Performance

### MRP — Batch Stock Queries
- [ ] Run MRP calculation with multiple materials — verify results are correct (same as before, just faster)
- [ ] Check backend logs — should see fewer DB queries than before

### Kitting — Batch Stock
- [ ] View a kitting list with stock levels — verify stock numbers are accurate

### PO History Pagination
- [ ] `GET /purchase-orders/history?limit=10&offset=0` — verify returns 10 records
- [ ] `GET /purchase-orders/history?limit=10&offset=10` — verify returns next 10 records
- [ ] Default call without params — verify capped at 1000 records

### Order Stats
- [ ] View order statistics/dashboard — verify counts per status are accurate

---

## Phase 7: Cleanup (Smoke Tests)

### Shortage Reports
- [ ] View affected assemblies report — verify data loads (no `|| true` bypassing conditions)
- [ ] View shortage by customer report — verify data loads correctly

### Order Buildability
- [ ] View order buildability — verify it shows real data (no `&& false` hiding content)

---

## Final Checks

- [ ] `cd erp/backend && npx tsc --noEmit` — zero errors
- [ ] `cd erp/frontend && npx tsc --noEmit` — zero errors
- [ ] Full app startup — no runtime crashes
- [ ] Spot-check browser console — no new warnings/errors
