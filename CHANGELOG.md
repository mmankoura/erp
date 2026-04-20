# ERP Release Change Control Log

> **System**: Manufacturing ERP — AT&A Canada
> **Production URL**: http://erp.atacanada.ca
> **Server**: SRV-AT&A (10.12.1.47)

---

## REV-004 — 2026-04-19

**Released by**: Mark Mankoura
**Migration required**: Yes — `CreateOrderMaterialSources` (creates `order_material_sources` table, backfills from existing orders)
**Backup taken**: [ ] (check before deploying)

### Changes

| # | Type | Module | Description |
|---|------|--------|-------------|
| 1 | Feature | Orders | Per-order material supply source (Company/Customer toggle). Consignment orders default all materials to Customer, turnkey to Company. Flip individual materials per order. |
| 2 | Feature | MRP | Customer-supplied materials excluded from shortage calculations — buyer only sees what AT&A needs to purchase |
| 3 | Feature | Warehouse | Customer Supplied Items page — tracks materials expected from customers across open orders with qty expected/received, UIDs, status |
| 4 | Feature | Production | Material consumption on stage completion — SMT+PCB consumed when completing SMT, TH+MECH when completing TH. Consumption preview dialog before confirming. |
| 5 | Feature | Production | Order detail page: contextual production buttons (Start Kitting, Complete SMT, Complete TH) replace generic status dropdown. Auto-syncs order status. |
| 6 | Feature | Production | WIP tracking page now shows all active orders including not-started. Added status column, sorting/filtering. |
| 7 | Feature | Orders | Customer PO # and WO # columns on orders page with sorting and filtering on all columns |
| 8 | Feature | Kitting | Excel export of kitting list (Orders, Materials, SMT, TH, Scanned UIDs sheets) |
| 9 | Enhancement | Receiving | PO mode accepts typed PO number (not dropdown). Stock mode silently matches po_reference to existing POs and updates quantity_received. |
| 10 | Feature | Warehouse | Return to Stock page — scan UID, enter qty, lot quantity set to returned amount |
| 11 | Enhancement | Orders | Allocate/Deallocate buttons disable based on existing allocation state |
| 12 | Enhancement | Inventory | Lots endpoint supports owner_type filter |

### Files Changed

- New: `order-material-source.entity.ts`, `CreateOrderMaterialSources` migration
- New: `/customer-supplied` page, `/return-to-stock` page
- Modified: orders service/controller/module, mrp service/module, production service/controller/module
- Modified: receiving service/dto, inventory service/controller, kitting page, orders pages, export-utils, navbar

### Verification Steps

- [ ] Orders page: verify Customer PO # and WO # columns visible, sorting/filtering works
- [ ] Order detail: click into a consignment order — verify Supply Source column shows customer name, click to toggle
- [ ] MRP shortages: verify customer-supplied materials do NOT appear
- [ ] Customer Supplied Items page (Warehouse menu): verify items listed with expected/received qty
- [ ] Order detail: click "Start Kitting" on an ENTERED order — verify units move to kitting, status changes
- [ ] Order detail: complete SMT — verify consumption preview shows materials, confirm consumes them
- [ ] WIP Tracking: verify all active orders visible including not-started
- [ ] Kitting: click "Export Excel" on a kitting list — verify multi-sheet workbook downloads
- [ ] Receiving (PO mode): type a PO number manually — verify it finds the PO
- [ ] Return to Stock: scan a UID, enter qty — verify lot qty is SET to that amount (not added)
- [ ] Allocate button: click once — verify it grays out and shows "Allocated"

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
