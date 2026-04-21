# ERP Release Change Control Log

> **System**: Manufacturing ERP — AT&A Canada
> **Production URL**: http://erp.atacanada.ca
> **Server**: SRV-AT&A (10.12.1.47)

---

## REV-004 — 2026-04-21

**Released by**: Mark Mankoura
**Migration required**: Yes — 2 migrations:
1. `CreateOrderMaterialSources` — supply source table (all materials default to COMPANY)
2. `CreateBomItemAlternates` — BOM alternate parts table (backfills from legacy alternate_ipn)

**Backup taken**: [ ] (check before deploying)

### Changes

| # | Type | Module | Description |
|---|------|--------|-------------|
| 1 | Feature | Orders | Per-order material supply source (AT&A/Customer toggle on BOM table). All materials default to COMPANY — customer-supplied items explicitly marked. |
| 2 | Feature | MRP | Customer-supplied materials excluded from all shortage views (by-material, by-customer, buildability, requirements) |
| 3 | Feature | MRP | BOM alternates — when primary material is short, checks alternate stock. Shows "Use Alternate" status with IPN and qty to use |
| 4 | Feature | MRP | Shortages "By Material": Order, Customer, Resource Type dropdown filters |
| 5 | Feature | MRP | Requirements tab: Order, Product, Resource Type dropdown filters |
| 6 | Feature | MRP | All Excel exports include Approved MFG and Approved MPN columns (all 5 export types) |
| 7 | Feature | MRP | Shortages export includes Status, Alternate IPN, Alt On Hand, Alt Qty to Use columns |
| 8 | Feature | BOM | BOM item alternates table — add/remove multiple alternates per BOM line with IPN validation |
| 9 | Feature | Warehouse | Customer Supplied Items page with DataTable sorting/filtering |
| 10 | Feature | Production | Material consumption on stage completion — SMT+PCB at SMT, TH+MECH at TH. Consumption preview dialog. |
| 11 | Feature | Production | Order detail: contextual production buttons (Start Kitting, Complete SMT, Complete TH). Auto-syncs order status. |
| 12 | Feature | Production | WIP tracking page shows all active orders including not-started. Status column, sorting/filtering. |
| 13 | Feature | Orders | Customer PO # and WO # columns with sorting/filtering on all columns |
| 14 | Feature | Kitting | Excel export with pick instructions ("USE: alternate IPN" when primary unavailable) |
| 15 | Feature | Kitting | Barcode scan accepts alternate material UIDs |
| 16 | Enhancement | Receiving | PO mode accepts typed PO number. Stock mode silently matches po_reference to existing POs. |
| 17 | Feature | Warehouse | Return to Stock page — scan UID, enter qty, lot qty set to returned amount |
| 18 | Enhancement | Orders | Allocate/Deallocate buttons disable based on existing allocation state |
| 19 | Fix | UI | Breadcrumbs show "Details" instead of UUID |

### Verification Steps

- [ ] MRP By Material: verify Order/Customer/Type filter dropdowns work
- [ ] MRP By Material: verify "Use Alternate" badge for materials with alternates (e.g., 292008 → 292037)
- [ ] MRP Requirements: verify Order/Product/Type filter dropdowns work
- [ ] MRP Excel export: verify Approved MFG/MPN columns present in all exports
- [ ] Order Buildability: verify customer-supplied materials excluded, alternates considered
- [ ] Order detail (ZPU-SM): verify Supply Source column shows AT&A/ORTHOGONE, toggle works
- [ ] Order detail: Start Kitting → verify status changes and units move
- [ ] Order detail: Complete SMT → verify consumption preview and materials consumed
- [ ] Product BOM page: edit a BOM item → verify Alternates section with add/remove
- [ ] WIP Tracking: verify all orders visible including not-started
- [ ] Kitting detail: verify "Pick Instruction" column shows USE alternate when primary short
- [ ] Kitting Excel export: verify pick instruction column
- [ ] Customer Supplied page: verify items listed with sorting/filtering
- [ ] Receiving (PO mode): type PO number manually
- [ ] Return to Stock: scan UID, enter qty → lot qty SET to returned amount
- [ ] Breadcrumbs: verify "Details" shows instead of UUID on detail pages

---

## REV-003 — 2026-04-08

**Released by**: Mark Mankoura
**Migration required**: No
**Backup taken**: [ ] (check before deploying)

### Changes

| # | Type | Module | Description |
|---|------|--------|-------------|
| 1 | Enhancement | Receiving | Replaced complex 11-step receiving form with simplified quick-receive. Three modes: PO (updates qty on order → on hand), Customer Supplied (customer-owned inventory), Stock (free-form with MFG PN, manufacturer, PO reference). No sessions, no AML validation, no inspections — items go straight to ACTIVE @ STOCK. |
| 2 | Enhancement | Receiving | Added "Complete Receiving" button to navigate back to receiving dashboard |
| 3 | Preservation | Receiving | Original sophisticated receiving code saved as `page.v2.tsx` for future re-integration |

### Files Changed

- `erp/backend/src/modules/receiving/dto/quick-receive.dto.ts` — New DTO for quick receive (3 receipt types)
- `erp/backend/src/modules/receiving/receiving.service.ts` — Added `quickReceive()` method
- `erp/backend/src/modules/receiving/receiving.controller.ts` — Added `POST /receiving/quick-receive` endpoint
- `erp/frontend/src/app/receiving/new/page.tsx` — New simplified receiving form
- `erp/frontend/src/app/receiving/new/page.v2.tsx` — Original complex form (preserved)

### Verification Steps

- [ ] Navigate to Warehouse > Receiving > Receive Materials
- [ ] PO mode: select an open PO, enter UID/IPN/Qty/Package, click Receive — verify item appears in receipt log and MRP shows updated on-hand
- [ ] Customer Supplied mode: select a customer, receive an item — verify lot created with customer ownership
- [ ] Stock mode: enter UID/IPN/MFG PN/MFG/Qty/Package/PO Reference, receive — verify lot created
- [ ] Click "Complete Receiving" — verify navigates to /receiving dashboard
- [ ] Attempt duplicate UID — verify error "UID already in use"
- [ ] Attempt invalid IPN — verify error "Material with IPN not found"

---

## REV-002 — 2026-04-07

**Released by**: Mark Mankoura
**Migration required**: No
**Backup taken**: [ ] (check before deploying)

### Changes

| # | Type | Module | Description |
|---|------|--------|-------------|
| 1 | Enhancement | Purchase Orders | PO numbering sequence changed from `PO-YYYYMM-NNNN` format to sequential numeric starting at `8833045` |
| 2 | Bug Fix | MRP/Shortages | "View by Customer" Excel export showed global shortage on every row, causing buyers to double/triple-count quantities. Replaced single `Shortage` column with `Qty (Order)` and `Qty (All Orders)` |
| 3 | Enhancement | MRP/Shortages | "View by Material" Excel export (Order Details sheet) added `Qty (All Orders)` column alongside per-order quantity for consistency |
| 4 | Bug Fix | MRP/Shortages | "Affected Assemblies" Excel export showed global shortage per product. Replaced with `Qty (Product)` and `Qty (All Orders)` columns |

### Files Changed

- `erp/backend/src/modules/purchase-orders/purchase-orders.service.ts` — New PO number generator (sequential from 8833045)
- `erp/backend/src/modules/mrp/mrp.service.ts` — Added `required_quantity` and `total_required` to customer shortage response
- `erp/frontend/src/lib/api.ts` — Updated `CustomerShortageOrder` interface with new fields
- `erp/frontend/src/lib/export-utils.ts` — Updated 3 Excel exports (By Customer, By Material detail, Affected Assemblies)

### Verification Steps

- [ ] Create a new PO — verify number starts at 8833045 (or next in sequence)
- [ ] Export shortages "By Customer" — verify OR3947 shows 400 + 100, not 500 + 500
- [ ] Export shortages "By Material" (Order Details sheet) — verify `Qty (All Orders)` column present
- [ ] Export "Affected Assemblies" — verify `Qty (Product)` and `Qty (All Orders)` columns

---

## REV-001 — 2026-04-01

**Released by**: Mark Mankoura
**Migration required**: Yes (46 migrations — initial deployment)

### Changes

| # | Type | Description |
|---|------|-------------|
| 1 | Initial Release | Full ERP system deployed to production. 17 backend modules, ~165 API endpoints, 22 entities, 32 migrations. Next.js frontend with all CRUD pages, BOM import, receiving, kitting, MRP. |

### Notes

- First production deployment on SRV-AT&A
- NSSM direct services for boot persistence (PM2 bypassed)
- IIS reverse proxy at http://erp.atacanada.ca
- See DEPLOYMENT_LOG.md for full deployment details
