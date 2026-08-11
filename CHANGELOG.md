# ERP Release Change Control Log

> **System**: Manufacturing ERP — AT&A Canada
> **Production URL**: http://erp.atacanada.ca
> **Server**: SRV-AT&A (10.12.1.47)

---

## REV-010 — 2026-08-11

**Released by**: Mark Mankoura
**Migration required**: Yes — 2 migrations:
1. `AddRecountQtyToDiscrepancies1769300000000` — adds `recount_qty numeric(12,4) NULL` to `physical_count_discrepancies`. Additive and nullable, so it is backward-compatible with the currently deployed build (TypeORM selects an explicit column list, so the running REV-009 code ignores the new column).
2. `AddCaseInsensitiveUserUniqueness1769400000000` — unique indexes on `LOWER(username)` and `LOWER(email)` on `users`. **This one can fail the deploy**: if production holds two accounts differing only by case, the index cannot be built and the migration aborts. That is deliberate — the alternative is a login that silently resolves to either account. Check first with `SELECT lower(username), count(*) FROM users GROUP BY 1 HAVING count(*) > 1;` (and the same for `email`). Dev's Aug 10 copy of production was clean.

**Backup taken**: [ ] (check before deploying)

**Deploy note**: REV-009's node_modules are **junctions**, so per that release's lesson REV-010 **must materialize** (`npm ci` / `npm install`) — a second consecutive junction hop would self-reference. Also re-read `deployment_known_issues.md` first: the deploy script's smart-skip breaks the documented migration-before-switch ordering, and `switch-release.bat` ignores rotate failures.

### Changes

| # | Type | Module | Description |
|---|------|--------|-------------|
| 1 | Feature | Physical Count | `RECOUNT` resolution now prompts for the re-counted quantity inline at review time instead of deferring to an auto-spawned child count. The entered number is authoritative: on approve the lot is adjusted to it via an `ADJUSTMENT` transaction with reason `"Physical count <#>: adjust to recount"`. Closes the discrepancy in one step. |
| 2 | Feature | Physical Count | Review page shows an auto-focused, required numeric input when `RECOUNT` is selected. Enter submits; Save stays disabled while the value is empty or invalid; helper text explains that the lot will be set to this number. New "Recounted" column in the row summary. |
| 3 | Backend | API | `PATCH /physical-counts/:id/discrepancies/:discId` rejects `RECOUNT` without `recount_qty` (`400`) where the discrepancy has a lot to write back to. An `ORPHAN` scan that matched no lot is exempt — there is nothing to adjust. Audit payload records `recount_qty`, and adjustment audits record `source: RECOUNT \| SCAN`. |
| 4 | Fix | Physical Count | **Auto-spawned recount children were unstartable.** `startCount` re-snapshotted every active customer lot onto a count whose snapshot had already been seeded by the child spawn, violating `UQ_physical_count_lots_count_lot` and surfacing as a 500. It also would have widened a targeted recount into a full count. A pre-seeded snapshot is now left as-is. |
| 5 | Fix | Physical Count | **A count with zero discrepancies could never be approved.** The review page required `discrepancies.length > 0` before enabling Approve, so a count where every scan matched the system was permanently stuck in `PENDING_REVIEW`. The guard now also distinguishes a loaded-but-empty result from the loading and error states, which both surface as `null` data. |
| 6 | Removal | Physical Count | Retired the auto-spawned child recount path. `approveCount` no longer creates a follow-up `PLANNED` count, snapshots lots onto it, or reports `recount_spawned` in its audit payload — the inline recount quantity replaces it. A `RECOUNT` row with no quantity is now an explicit no-op (only reachable for an `ORPHAN` scan that matched no lot), which also removes a latent `NaN` adjustment path. `physical_counts.parent_count_id` is retained for existing lineage but is never written. |
| 7 | Enhancement | Physical Count | Excel variance report gains a "Recounted Qty" column. Review header text now distinguishes loading / error / "No discrepancies — every scan matched the system" / "N of M resolved". |
| 8 | Feature | Auth | **Login is no longer case-sensitive on the username or email.** `validateUser` lower-cases the supplied identifier and matches on `LOWER(username)` / `LOWER(email)`. Stored casing is preserved for display — `Sylvie` stays `Sylvie` — and the **password remains case-sensitive**. |
| 9 | Backend | Auth | User create/update now detect username and email conflicts case-insensitively, backed by unique indexes on `LOWER(username)` / `LOWER(email)`. Without this, an admin could create `sylvie` alongside `Sylvie` and make the login lookup ambiguous. Uses `Raw(LOWER(...))` rather than `ILike`, which would treat `_` and `%` in a username as wildcards. |
| 10 | Fix | Auth | `updateUser` picked its conflict message with a case-sensitive `===` comparison, so a username colliding only by case would have been reported as "Email already exists". Now compared case-insensitively. |
| 11 | Feature | Inventory | **Lot / reel details are now editable on the fly.** New `PATCH /inventory/lots/:id` (ADMIN/MANAGER/WAREHOUSE_CLERK) edits **quantity, package type, PO reference and BIN**. A pencil action on the Lots/Reels and Receiving Log grids opens a dialog showing a live delta (`9,875 → 9,800 (-75)`) and an optional reason. Identity and structural fields (`uid`, `material_id`, `owner`, `status`, `unit_cost`) are deliberately not editable — the global `forbidNonWhitelisted` validation pipe rejects them outright. |
| 12 | Backend | Inventory | A quantity edit writes a compensating `ADJUSTMENT` `InventoryTransaction` for the delta (`reference_type: MANUAL`) before updating the lot, so the ledger still explains the stock level — on-hand is derived from lot quantities, not from the ledger. Runs in one transaction under a `pessimistic_write` lock. No-op saves write nothing at all. New `INVENTORY_LOT_UPDATED` audit event records before/after plus the reason. |
| 13 | Backend | Inventory | **Open kitting lists are auto-reconciled.** Kitting copies a reel's whole quantity into `kitting_list_items.qty_verified` at scan time, so editing that reel afterwards would leave the kit claiming stock that no longer exists. The edit now adjusts `qty_verified` and the scan's stored quantity by the same delta and reports the affected kit. (`is_short`/`shortage_qty` are untouched — kitting only writes those at completion and computes them live.) |
| 14 | Backend | Inventory | Guard rails: only `ACTIVE` lots are editable at all, and a quantity change is refused (400, naming the count) while the lot sits in an open physical count, since the count snapshotted that quantity as `expected_qty`. The other three fields still save in that case. |
| 15 | Fix | Types | `LotStatus` in the frontend API types was missing `RETURNED_TO_CLIENT`, a status held by 803 production lots. |
| 16 | Fix | Physical Count | **Review rows showed only the UID.** The column was already labelled "UID / IPN" and the endpoint already loaded the material relation — the IPN was simply never rendered. Each row now shows the IPN and MPN beneath the UID, with the description on hover. A scan that matched no lot has no material, so it reads *"Not in system"* rather than a blank. |
| 17 | Feature | Reports | **New Customer Inventory report** at `/reports/customer-inventory` (linked in the sidebar and navbar under Warehouse). Pick a customer to see everything AT&A currently holds for them: summary cards, a per-part summary tab and a reel-detail tab. Exports to **Excel** (two sheets — Summary and Reel Detail) and **PDF** (a printable statement in the same style as the client return document, with page breaks). Built for answering "what stock of ours do you hold". |
| 18 | Backend | API | `GET /inventory/customer-report/:customerId` returns the customer, generation timestamp, totals (distinct parts / reels / total quantity), a per-material rollup and the reel-level detail. **ACTIVE lots only** — CONSUMED and RETURNED_TO_CLIENT reels have left the floor and reporting them as held stock would overstate what we owe the client. |

### Known behavior changes (worth communicating to users)

- `RECOUNT` no longer defers work to a separate count. Reviewers must go count the stock and enter the number during review; there is no "decide later" path.
- **Auto-spawned child counts are gone entirely.** Approving a count no longer creates a follow-up `PLANNED` count under any circumstance. Verified safe before removal: production held no counts in `PENDING_REVIEW`, so no in-flight review depended on the old behaviour. Existing child counts keep their `parent_count_id` lineage — the column is retained as historical data and is simply never written any more.
- A perfect count (no discrepancies) is now approvable immediately.
- Users can sign in with any casing of their username or email (`Sylvie`, `sylvie`, `SYLVIE` all work). Passwords are unaffected and stay case-sensitive.
- Two accounts can no longer be created differing only by case; the second attempt returns "Username already exists".
- Warehouse clerks can now change a reel's **quantity**, not just its BIN. Every change is audited and every quantity change writes an inventory transaction, but this is a wider power than before — it moves material on-hand for MRP and kitting.
- Editing a reel's quantity silently updates any open kitting list it is scanned onto. The success toast names the affected kit, but the operator working that kit is not notified.
- Reels that are not `ACTIVE` (CONSUMED, RETURNED_TO_CLIENT) show no edit action at all.
- The Customer Inventory report counts **ACTIVE reels only**, including any with a zero quantity. INTROSPECT currently has 6 empty reels still flagged ACTIVE, which appear as 0-qty lines; this keeps the report reconciling with the Inventory page's reel count, but it is worth tidying those lots before sending a statement to a client.
- The report is always "as of now". There is no point-in-time / month-end view — lot quantities are current-state only.

### Verification Steps

- [ ] Physical Count → open a count in `PENDING_REVIEW` with a shortage → select `RECOUNT` → qty input appears focused; leave it blank → Save disabled and helper text turns red
- [ ] Enter a quantity → Save → row shows it under "Recounted"; approve → lot quantity equals the recounted number, and an `ADJUSTMENT` transaction exists with reason ending `adjust to recount`
- [ ] Approve a count whose scans all matched → Approve button is enabled and header reads "No discrepancies — every scan matched the system"
- [ ] Start an auto-spawned recount child (`parent_count_id` set) → starts without a 500 and `total_expected_lots` stays at the flagged-lot count, not the full customer lot count
- [ ] Variance report Excel → "Recounted Qty" column present and populated for recount rows
- [ ] Login as `Sylvie` using `sylvie` and `SYLVIE` → both succeed; the wrong password still returns 401
- [ ] Login by email in mixed case → succeeds
- [ ] Settings → Users → create a user named `sylvie` while `Sylvie` exists → rejected with "Username already exists"
- [ ] Inventory → Lots/Reels → pencil on an ACTIVE reel → change quantity → dialog shows the delta; save → grid and Stock Levels both move by that delta
- [ ] Confirm an `ADJUSTMENT` row exists: `SELECT transaction_type, quantity, reason, created_by FROM inventory_transactions WHERE lot_id='<id>' ORDER BY created_at DESC LIMIT 1;`
- [ ] Open the dialog and save without changing anything → no transaction and no audit event written
- [ ] Edit the quantity of a reel scanned onto an IN_PROGRESS kit → toast names the kit, and `kitting_list_items.qty_verified` moves by the same delta
- [ ] Try a quantity edit on a reel in an open count → 400 naming the count; changing its BIN on the same reel still succeeds
- [ ] Confirm no pencil renders on a CONSUMED / RETURNED_TO_CLIENT reel
- [ ] Physical Count → review a count → each discrepancy row shows the IPN under the UID; an ORPHAN scan reads "Not in system"
- [ ] Warehouse → Customer Inventory → pick INTROSPECT → totals read 301 parts / 372 reels / 131,994 qty (as of the Aug 10 data)
- [ ] Export Excel → two sheets, Summary and Reel Detail, summary quantities sum to the header total
- [ ] Export PDF → summary table then reel detail, page breaks intact, header repeats on each page

---

## REV-006 — 2026-06-05

**Released by**: Mark Mankoura
**Migration required**: Yes — 2 migrations:
1. `AddCustomerIdToProducts` — **recovery**: the column was manually applied to prod earlier and its row is already present in the `migrations` table. `migration:run` will skip it. The migration file is committed so a fresh DB rebuild stays consistent.
2. `AddBinToInventoryLots` — adds `bin varchar(50) NULL` + index on `inventory_lots` for user-assigned stock locations.

**Backup taken**: [ ] (check before deploying)

### Changes

| # | Type | Module | Description |
|---|------|--------|-------------|
| 1 | Feature | Inventory | BIN column on `inventory_lots` — inline-editable per lot on Lots/Reels and Receiving Log tabs. Saves on blur/Enter via `PATCH /inventory/lots/:id/bin` (ADMIN/MANAGER/WAREHOUSE_CLERK). |
| 2 | Feature | Inventory | Import wizard now supports a BIN mapping field (auto-detects headers: `bin`, `bin location`, `stock location`, `shelf`, `location`). |
| 3 | Enhancement | Inventory | Import Inventory button restored on `/inventory` header (was lost in the warehouse-nav consolidation). |
| 4 | Enhancement | Inventory | Receiving Log column "Location" → "Stage" (the workflow indicator) to make room for the new user-assigned BIN. |
| 5 | Feature | Purchasing | Per-PO Excel export — flat-row format: PO# / DATE / SUPPLIER / AT&A# / MFR / MPN / Description / QTY / Mounting Type / Packaging / Customer / Unit Price / CDN-US / COMMENTS. Button next to existing PDF in the PO detail dialog. |
| 6 | Feature | Purchasing | Per-consumable-PO Excel + PDF exports. PDF mirrors the AT&A supplier bilingual template. Buttons in the consumable orders row actions. |
| 7 | Feature | Purchasing | Manual PO # entry on PO creation. Optional field in the create dialog (leave blank for auto-generation via the 8833xxx sequence). Backend throws `ConflictException` on duplicate, surfaced as a toast. |
| 8 | Feature | Purchasing | Delete PO available from any status (was DRAFT-only). Confirmation message warns about soft-delete and orphaned receipts for non-DRAFT POs. Available from the row dropdown and the detail dialog header. |
| 9 | Feature | Purchasing | PO list rewritten as a flat per-line VirtualGrid (`PoLineRow`). One row per PO line with line number / IPN / MFR / MPN / qty ordered / qty received / unit cost / line total. POs with zero lines render a placeholder row so they remain visible/searchable. |
| 10 | Feature | Purchasing | "Generate PDF by PO #" dialog — search by PO number and download the PDF without opening the PO detail. |
| 11 | Feature | Tables | All major tables migrated from `DataTable` to `VirtualGrid` — AML, Customers, Suppliers, Materials, Products, Product BOM detail, Orders, Production WIP, Consumable Orders, Purchase Orders, PO History. Search bar moved into the grid header on each. |
| 12 | Fix | UI | VirtualGrid: single horizontal-scroll container + sticky opaque header. Eliminates the double scrollbar and the header/row misalignment when scrolling horizontally on wide tables (PO list, materials, inventory). |
| 13 | Fix | Production | WIP table cells (Customer, Product, Total Qty) now render values — they were previously empty (`cell` not defined). |
| 14 | Enhancement | Search | Search broadened on Customers, Suppliers (code / name / email / phone), Materials (+ manufacturer + customer name), Products (+ customer name), Orders (order # / PO # / WO # / customer / product), Product BOM (+ manufacturer / MPN / notes / alternates). |
| 15 | Removal | UI | Bulk-select + bulk-delete toolbar removed across Customers, Materials, Orders, Products, Suppliers. Single-row delete preserved. |
| 16 | Backend | API | `material.customer` joined on `GET /purchase-orders` so the Customer column in the Excel export populates. |
| 17 | Backend | API | Body-parser limit raised to 50 MB (was Express default 100 KB) — was blocking Excel uploads through the inventory import wizard. |
| 18 | Infra | Tests | Vitest + Testing Library devDeps added (`vitest`, `@vitest/ui`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`) plus `test`/`test:watch`/`test:ui` scripts. No runtime impact. |

### Known behavior changes (worth communicating to users)

- Persisted column widths/visibility (per-table `storageKey`) no longer survive a refresh on the migrated tables. Power users who customized columns will see defaults.
- Pagination is gone on the migrated tables — virtualized rendering instead. Large datasets scroll smoothly.
- Row-click navigation removed on Materials, Products, Orders. Per-row Eye / Pencil / BOM icons preserved as the drill-in path.
- Product BOM detail: `Type` and `Notes` columns are now visible by default (previously hidden behind the column toggle).

### Verification Steps

- [ ] Inventory → Lots/Reels: click a BIN cell, type a value, press Enter → saves; reload page → value persists
- [ ] Inventory → Receiving Log: BIN column present, "Stage" column shows RECEIVING/STOCK/WIP/CONSUMED
- [ ] Inventory → Import Inventory: button visible on header; upload a CSV with a `bin` column → it auto-maps; commit → lots created with BIN populated
- [ ] Inventory → Import Inventory: upload a > 100 KB Excel file → no "request entity too large" error
- [ ] Purchase Orders → open any PO → Excel button → downloads `PO# <number>.xlsx` with flat-row format and Customer column populated where the material has a customer
- [ ] Purchase Orders → New PO: leave PO # blank → auto-generated; enter a value → saves; enter a duplicate → toast "PO number "X" already exists"
- [ ] Purchase Orders → open any PO → Delete button visible regardless of status; CANCELLED / RECEIVED POs show stronger confirm message
- [ ] Purchase Orders list: flat per-line view; sort + filter columns work; column widths resize and reset on refresh
- [ ] Purchase Orders → "Generate PDF" header button: enter a PO# → PDF downloads
- [ ] Consumable Orders → row actions: PDF icon + Excel icon both download
- [ ] Wide tables (PO list, materials): horizontal scroll → header scrolls with rows, single scrollbar at bottom
- [ ] AML / Customers / Suppliers / Materials / Products / Orders / Production WIP: VirtualGrid renders, columns sortable/filterable, search works
- [ ] Production WIP: Customer, Product, Total Qty columns now show values

---

## REV-005 — 2026-04-26

**Released by**: Mark Mankoura
**Migration required**: Yes — 3 migrations:
1. `CreateConsumableOrders` — consumable orders and lines tables
2. `AddSupplierAndPOFields` — supplier profile fields + PO terms/revision/fob/ship_to/requested_by

**Backup taken**: [ ] (check before deploying)

### Changes

| # | Type | Module | Description |
|---|------|--------|-------------|
| 1 | Feature | Purchasing | Consumable Orders module — production consumables (solder paste, stencils). Auto-generated CON-YYYYMMDD-NNN. Create/edit/delete, mark received/undo. |
| 2 | Feature | Purchasing | PO PDF generation — matching AT&A bilingual template with logo, supplier info, terms, line items, signature. Download button on PO detail. |
| 3 | Feature | Purchasing | Supplier profile — attention, default_terms, default_fob, default_ship_to, currency fields |
| 4 | Feature | Purchasing | PO fields — terms, revision, fob, ship_to, requested_by for PDF and tracking |
| 5 | Feature | Inventory | VirtualGrid component — virtualized rows, sticky headers, Excel-style column filters. Applied to Stock Levels, Lots/Reels, Receiving Log, Low Stock, Recent Activity. |
| 6 | Feature | Inventory | Receiving Log tab — all lots sorted by date with UID, customer, IPN, qty, package, PO ref, status, location |
| 7 | Feature | Inventory | Recent Activity — UID column added, server-side search includes UID |
| 8 | Enhancement | Inventory | Customer Supplied, Return to Stock, Kitting as buttons on inventory page. Warehouse nav links directly to Inventory. |
| 9 | Feature | Receiving | Undo receive — delete button on receipt log, reverses transaction, deletes lot, updates PO, audit logged |
| 10 | Enhancement | Receiving | Customer Supplied mode — optional PO # / Packing Slip # field |
| 11 | Fix | Receiving | Receipt log is session-only (doesn't persist across page refresh) |
| 12 | Fix | Inventory | Return to Stock qty=0 marks lot as CONSUMED |
| 13 | Fix | Purchasing | PO detail Mfg/MPN falls back to material data when PO line fields are empty |
| 14 | Fix | UI | Breadcrumbs show "Details" instead of UUID |

### Verification Steps

- [ ] Consumable Orders: create, edit, receive, undo receive, delete
- [ ] PO detail: click PDF button — verify PDF downloads with correct layout
- [ ] Inventory: verify VirtualGrid on all tabs (Stock, Lots, Receiving Log, Recent, Low Stock)
- [ ] Inventory: verify Customer Supplied, Return to Stock, Kitting buttons work
- [ ] Warehouse nav: verify links directly to Inventory (no dropdown)
- [ ] Receiving: receive an item, then click delete — verify undo works
- [ ] Receiving (Customer Supplied): verify PO/Packing Slip field appears
- [ ] Return to Stock: qty=0 — verify lot marked CONSUMED
- [ ] PO detail: verify Mfg/MPN shows material data when PO line is empty

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
