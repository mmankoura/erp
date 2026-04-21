# Manufacturing ERP System - MVP Implementation Plan

## Progress Status

> **Last Updated**: April 7, 2026

### Completed ✅
- [x] Docker + PostgreSQL setup (running in WSL2)
- [x] NestJS backend initialized and connecting to database
- [x] TypeORM configured with migrations-first strategy (schema sync disabled)
- [x] Global API prefix `/api` configured
- [x] ValidationPipe configured (whitelist, forbidNonWhitelisted, transform)
- [x] Environment validation (fail-fast on missing DATABASE_URL)

#### Entities (22 complete)
- [x] **Materials** entity with soft delete + partial unique index + costing fields + resource_type (SMT/TH/MECH/PCB/DNP)
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
- [x] **PurchaseOrderLine** entity (quantity_ordered, quantity_received tracking, manufacturer, manufacturer_pn, packaging)
- [x] **ApprovedManufacturer** entity (AML - tracks approved MPN/manufacturer combinations per material) + provenance (source, customer scope)
- [x] **ReceivingInspection** entity (staging area for received items pending validation)
- [x] **Attachment** entity (entity-agnostic file attachments with SHA256 tamper evidence, soft-delete)
- [x] **ReceivingSession** entity (WIP container for operator receiving sessions with receipt type, auto-release toggle)
- [x] **ReceivingSessionLine** entity (individual received packages with UID, validation status, idempotency key, disposition workflow)
- [x] **KittingList** entity (status: DRAFT→PRINTED→IN_PROGRESS→COMPLETED→CANCELLED, links to orders and aggregated material items)
- [x] **KittingListOrder** entity (junction table linking kitting lists to orders with snapshotted order_quantity)
- [x] **KittingListItem** entity (aggregated material line per material_id/resource_type with qty_required, qty_verified, shortage tracking)
- [x] **KittingListScan** entity (individual UID scan records with uid_code, quantity, scanned_by)
- [x] **PoHistory** entity (flat historical PO archive: po_number, supplier, ipn, mpn, qty, unit_price, currency, etc.)

#### Migrations (47 applied — 46 on production, 1 pending)
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
- [x] CreateAttachments (entity-agnostic file attachments with soft-delete, SHA256, entity_type+entity_id index)
- [x] AddAmlProvenance (source, source_bom_revision_id, customer_id on approved_manufacturers)
- [x] AddLotDispositionAndLocation (REJECTED/SCRAPPED/RTV lot statuses, disposition, location, owner_type/owner_id on inventory_lots)
- [x] CreateReceivingSessions (receiving_session_status and receipt_type enums, receiving_sessions table)
- [x] CreateReceivingSessionLines (validation_status, hold_reason_code, disposition_action enums, session_lines + uid_sequences tables)
- [x] LinkLotsToReceivingLines (receiving_session_line_id FK on inventory_lots)
- [x] CreateKittingTables (kitting_lists, kitting_list_orders, kitting_list_items, kitting_list_scans with indexes and FK constraints)
- [x] CreatePoHistory (po_history table with indexes on po_number, supplier, ipn, mpn)
- [x] AddResourceTypeToMaterial (resource_type enum column on materials, reusing existing resource_type_enum)
- [x] BackfillMaterialResourceType (backfill resource_type from bom_items, update kitting unique constraint)
- [x] AddFieldsToPurchaseOrderLines (manufacturer, manufacturer_pn, packaging columns)
- [x] IncreasePOLineUnitCostPrecision (unit_cost decimal(12,4) → decimal(12,6) for DigiKey pricing)
- [x] AddCustomerIdToProducts (customer_id FK on products table)
- [x] RenameMaterialColumns (IPN/MPN column name standardization)
- [x] RenameProductPartNumber
- [x] RevertSkuToPartNumber
- [x] AddAlternateIpnToBomItems (alternate_ipn column on bom_items)
- [x] CreateBomImportMappings (saved column mappings for BOM import)
- [x] AddCustomerIdToMaterials (customer_id FK on materials table)
- [x] CreateInventoryLots (inventory_lots table for lot/reel tracking)
- [x] AddCodeAndNotesToCustomers (customer code and notes fields)
- [x] RedesignOrderStatus (6-state order status workflow)
- [x] AddAllocationStatuses (allocation status tracking)
- [x] CreateCycleCounts (cycle count tables for physical inventory)
- [x] AddWipTracking (WIP tracking tables for production stages)
- [x] CreateUsersAndSessions (users table, session store for auth)
- [x] MakeUserEmailOptional (email nullable on users)
- [ ] AddCustomerIdToProducts (pending on production — customer_id on products, not yet deployed)

#### Backend Modules (17 complete) - ~165 API Endpoints Total
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
- [x] **AML Module** (11 endpoints) - Approved Manufacturer List CRUD + status transitions + validation + customer-scoped validation + findOrCreate
- [x] **Receiving Inspection Module** (11 endpoints) - Inspection workflow (validate, approve, reject, hold, release) + bulk release
- [x] **Attachments Module** (4 endpoints) - Upload (multipart), list by entity, download, soft-delete (ADMIN/MANAGER only)
- [x] **Receiving Module** (13 endpoints) - Quick receive (PO/Customer Supplied/Stock modes) + legacy session CRUD, 11-step flow, close/cancel session, resolve discrepancy, manual release, PO/material/AML lookups, flagged items list. Active UI uses simplified quick-receive; full validation flow preserved in `page.v2.tsx`
- [x] **Production Module** - WIP tracking, stage transitions, production logs
- [x] **Kitting Module** (7 endpoints) - Create kitting list from multiple orders (BOM aggregation), UID barcode scanning with verification, print pick sheet, complete with shortage reporting, cancel. Separates SMT/TH items
- [x] **PO History** (3 endpoints) - Import historical PO data from Excel (SPO sheet), searchable archive, record count. Added to Purchase Orders module
- [x] **Consumable Orders Module** (5 endpoints) - Separate entity for production consumable purchases (solder paste, stencils, etc.). Auto-generated order numbers (CON-YYYYMMDD-NNN). CRUD with line items (AT&A P/N, description, MFR, MFR P/N, qty, unit cost, customer). Status: ORDERED/RECEIVED with undo receive. No inventory/MRP impact.

### Frontend (Next.js) ✅ Complete
- [x] Next.js 14 initialized with App Router, Tailwind CSS v4, TypeScript
- [x] shadcn/ui component library integrated
- [x] Layout: Top navbar with dropdown menus (Catalog, Warehouse, Purchasing, Production, Settings), header with breadcrumbs
- [x] Dashboard: Stats cards, recent orders, shortages display
- [x] Full CRUD pages: Materials, Products, Customers, Suppliers
- [x] Orders page with computed Material Status (Option A implementation)
- [x] Reusable DataTable component with search/pagination/column resize/Excel-style filtering
- [x] API client with TypeScript types (`lib/api.ts`)
- [x] Custom data fetching hooks (`useApi`, `useMutation`)
- [x] Purchase Orders page (full CRUD with line items, status workflow, DigiKey clipboard import)
- [x] Inventory page (stock levels, transactions, adjustments, low stock alerts, per-column filtering)
- [x] MRP/Shortages page (shortages analysis, requirements view, ETA/PO tracking, Excel export)
- [x] Receiving Inspection page (validation workflow)
- [x] AML page (CRUD with status workflow, proof uploads, source/customer columns)
- [x] Audit Log page (filterable event log with detail view)
- [x] BOM viewer page (view revisions, compare diffs, filter by product, inline editing)
- [x] BOM Import wizard (CSV + Excel support, column mapping, material matching, full-screen UI)
- [x] BOM Validation page (compare uploaded file against stored revision)
- [x] Login page with session authentication
- [x] User management page (admin only)
- [x] Role-based UI controls (canEdit, canManageUsers, etc.)
- [x] Cycle Count pages (count entry, variance review, approval workflow)
- [x] Production/WIP tracking pages
- [x] Operator Receiving form (/receiving/new) - scanner-friendly, PO/Customer Supplied modes, validation preview, offline retry
- [x] Receiving dashboard - tabbed: Open Sessions, Flagged Items (with resolution dialog), Inspections
- [x] Kitting page - Full-screen create view (multi-select orders), detail view with barcode scanning, SMT/TH item separation, printable pick sheet, shortage reporting on completion
- [x] Purchase Orders History tab - One-time Excel import (SPO sheet), searchable DataTable archive
- [x] Consumable Orders page - Create/edit/delete consumable orders with line items, mark received/undo receive, status filter, DataTable with search/sort/filter
- [ ] Settings page (placeholder - low priority)

### Production Deployment ✅ Complete (April 1, 2026)
- [x] Deployed to SRV-AT&A (10.12.1.47), Windows Server 2019
- [x] PostgreSQL 16 native install (localhost-only, hardened)
- [x] Node.js v22, IIS reverse proxy (URL Rewrite + ARR)
- [x] NSSM direct Windows services for boot persistence (erp-backend, erp-frontend)
- [x] 46 migrations applied to erp_production database
- [x] GO/NO-GO gate passed (crash recovery, full reboot, headless boot)
- [x] Accessible at `http://erp.atacanada.ca` from LAN
- [x] Release-based deployment model with rollback capability
- [x] Upgrade procedure documented (see UPGRADE_PROCEDURE.md, CHANGELOG.md)
- [ ] Backup configuration (Phase 7 of deployment plan — scripts, scheduled tasks, cross-VM copy)

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
- [x] **Industrial-Grade Receiving Module (Feb 19)** - Full operator-facing receiving module with barcode scanner UX:
  - 6 database migrations: attachments table, AML provenance (source/customer scope), inventory lot disposition/location, receiving sessions, session lines with idempotency keys, lot-to-line linking
  - Entity-agnostic attachments module with SHA256 tamper evidence, soft-delete, multipart file upload
  - AML enhancements: BOM-to-AML auto-seeding on import (with provenance tracking), customer-scoped validation with global fallback, findOrCreate for idempotent seeding
  - Receiving backend: session management, 11-step receive flow with quarantine-first approach (ON_HOLD immediately), AML/IPN/PO line validation, atomic UID generation (UID-YYYYMMDD-XXXX), idempotent via client_request_id
  - Discrepancy resolution: ACCEPT_DEVIATION, PARTIAL_ACCEPT, REJECT_RTV, SCRAP with proper lot status transitions
  - Operator receiving form (/receiving/new) with scanner-friendly UX, PO/Customer Supplied modes, validation preview panel, session receipt log, offline retry, Ctrl+Enter shortcut
  - Receiving dashboard with tabs: Open Sessions (with resume), Flagged Items (with resolution dialog), Inspections
  - AML page: proof document upload/download, source badge (BOM Import vs Manual), customer scope column

- [x] **BOM Item & Revision Editing (Feb 24)** - Admin/manager users can edit BOM items (qty, alternate IPN, ref des, resource type, notes) and revision metadata (number, date, change summary) via inline edit buttons
- [x] **CSV Parser Multiline Fix (Feb 24)** - Fixed CSV parser to handle multiline quoted fields correctly
- [x] **BOM Items DataTable (Feb 24)** - Replaced raw `<Table>` on product detail page with reusable `DataTable` component. Adds column visibility toggles, resizable columns with localStorage persistence, sorting, pagination, and built-in search
- [x] **BOM Revision Deletion Guard (Feb 24)** - BOM revisions referenced by orders can no longer be deleted (returns clear error with order count). Delete button only appears on archived revisions; archive is now the primary action
- [x] **Kitting Module (Mar 13)** - Full kitting workflow for production:
  - 4 new entities: kitting_lists, kitting_list_orders, kitting_list_items, kitting_list_scans
  - BOM requirement aggregation across multiple orders (qty_per × order_qty × (1 + scrap_factor/100)), skips DNP items
  - UID barcode scanning: looks up inventory lot, matches to kitting item by material_id, increments qty_verified, moves UID location to WIP
  - Shortage reporting on completion (report only, non-blocking)
  - Auto-generated kitting list number (KIT-YYYYMMDD-NNN)
  - Frontend: full-screen create view with order multi-select, detail view with scan input, SMT/TH tab separation, printable pick sheet with stock levels and locations
  - Sidebar navigation under Operations section
- [x] **PO History Archive (Mar 13)** - Historical PO data import and search:
  - po_history entity for flat archive of vendor PO records
  - Excel import from SPO sheet (xlsx library), batch insert in chunks of 500
  - Searchable across all text fields (po_number, supplier, ipn, mpn, description, manufacturer, customer, comments)
  - Frontend: new "History" tab on Purchase Orders page with import button and DataTable

- [x] **Codebase Health Check (Mar 16)** - 44+ issues fixed across 42 files (334 insertions, 254 deletions):
  - **Security:** Path traversal fix in attachments (entity type allowlist + ID sanitization), BOM import DTO nested validation bypass fixed
  - **Race Conditions:** New `SequenceGeneratorService` using `pg_advisory_xact_lock` replaces SELECT-max-then-increment in 7 services (inspections, POs, orders, cycle counts, receiving sessions, kitting lists)
  - **Route Conflicts:** `GET /purchase-orders/number/:poNumber` moved before `GET :id` catch-all; controller ordering documented
  - **HTTP Error Codes:** 8 instances of `throw new Error()` (returning 500) replaced with `BadRequestException` (returning 400) across 3 controllers
  - **Frontend Bugs:** MRP shortages type mismatch fixed (MrpShortagesResponse wrapper), useEffect dependency array added to Ctrl+Enter handler, supplier dialog stale form data fixed, BOM import quantity mapping validation enforced
  - **Data Correctness:** Redundant `deleted_at: undefined` filters removed (3 services + bom-import), `@DeleteDateColumn` on attachment entity, filter DTO `@Transform` defaults, zero `unit_cost` no longer treated as null, `LotStatus.ACTIVE` enum instead of `In(['ACTIVE'] as any)`
  - **Entity Consistency:** 8 missing barrel exports added, `ProductionStage` enum typed in production-log entity, 6 missing breadcrumb labels added
  - **Performance:** Batch `getStockByMaterialIds()` eliminates N+1 queries in MRP (5 methods updated), `getOrderStats()` uses GROUP BY instead of loading all orders, pagination added to PO history
  - **Cleanup:** Unused imports/variables removed (8 files), dead code patterns (`|| true`, `&& false`) removed (4 files), `console.error` removed from production (3 files), redundant `@Global()` AuditModule imports removed (4 modules)
  - **New shared module:** `SharedModule` (`@Global()`) exports `SequenceGeneratorService` for reuse across all modules

- [x] **Excel-Style Column Filtering in DataTable (Mar 27)** - Major DataTable enhancement with per-column filtering:
  - Popover menu on each column header with Sort Ascending/Descending, filter by unique values with checkboxes
  - Search within filter values (for columns with 8+ unique values), Select All/Clear/Reset controls
  - Active filter count badges, "Clear all" button, "filtered from X total" in footer
  - Applied across MRP/Shortages page (both tables) and AML page

- [x] **AML Page DataTable Refactor (Mar 27)** - Replaced raw `<Table>` with `DataTable` component, added source filter dropdown, sortable/filterable columns, multi-field search

- [x] **MRP Page Search & Filtering (Mar 27)** - Added global text search and per-column filtering/sorting to both Shortages and Requirements tables with `pageSize: 50`

- [x] **Order Allocation UI (Mar 27)** - Added "Allocate Materials" and "Deallocate" buttons to order detail page, with confirmation dialog for deallocation

- [x] **Inventory Lot Deletion FK Fix (Mar 27)** - Fixed 500 error on lot deletion by nullifying FK references in `receiving_session_lines` and `cycle_count_items` before deleting lots and transactions (both single and bulk delete)

- [x] **BOM Import Empty Column Fix (Mar 27)** - Fixed validation error when CSV has blank header columns by filtering out ignored/empty-source column mappings before sending to parse endpoint

- [x] **Verification Checklist (Mar 27)** - Created manual verification checklist for the 7-phase codebase health check

- [x] **Inventory Column Filtering (Mar 27)** - Added Excel-style per-column filtering (`filterable`/`filterAccessor`) to both Stock Levels and Lots/Reels DataTables, expanded global search to cover customer, quantities, PO ref, status

- [x] **MRP Shortages On Hand Column (Mar 27)** - Added "On Hand" column to the shortages table between Required and Available

- [x] **Allocation Owner Filter Fix (Mar 27)** - Fixed TURNKEY order allocation returning 0 available stock. Root cause: `getAvailableQuantitiesByOwner` filtered by `owner_type`/`owner_id` but general stock queries (MRP, inventory page) did not. Fix: TURNKEY orders now use the same unfiltered stock query as MRP; CONSIGNMENT orders still use owner-filtered query

- [x] **PO Decimal String Fix (Mar 27)** - Fixed `toFixed is not a function` errors on Purchase Orders page. PostgreSQL decimal columns serialize as strings; wrapped `total_amount`, `unit_cost`, `quantity_ordered` with `parseFloat(String(...))`

- [x] **Resource Type on Materials (Mar 30)** - Added `resource_type` (SMT/TH/MECH/PCB/DNP) as a material-level field, making it the single source of truth. All code (kitting, MRP, orders, inventory) now reads resource_type from the material, not BOM items. BOM import backfills resource_type onto materials. Removed resource_type from BOM item add/edit forms. Existing data backfilled from BOM items via migration.

- [x] **Qty Required in Inventory (Mar 30)** - Added "Required" column to inventory stock table showing total quantity needed across all active orders (ENTERED, KITTING, SMT, TH), using the same BOM × order qty × scrap factor calculation as MRP.

- [x] **Kitting List Fixes (Mar 30)** - Fixed 404 on kitting list creation (transaction-scoped reload instead of cross-connection findOne). Fixed findAll/findOne to use withDeleted() for soft-deleted related entities. Kitting items now reflect material's current resource_type.

- [x] **Purchase Orders Overhaul (Mar 30)** - Full-window create dialog with excel-style inline table. Searchable IPN input with autocomplete (replaces dropdown). Default expected date to +2 business days. Manufacturer and MPN fields on PO lines (required, pre-filled from material). DigiKey clipboard paste import with automatic IPN matching via Customer Reference column. Unit cost precision increased to 6 decimal places for DigiKey pricing.

- [x] **MRP ETA & PO Tracking (Mar 30)** - Added "ETA" column to MRP requirements table (earliest expected_date from open POs for each material, overdue dates shown in red). Status column now shows PO number(s) when a PO has been placed (green if fully covered, blue if still short), "In Stock" when available stock covers requirement, or "Short" when neither.

- [x] **Top Navbar Navigation (Mar 30)** - Replaced left sidebar with a top navigation bar. Dropdown menus organized into 5 groups: Catalog (Materials, Products, AML), Warehouse (Inventory, Receiving, Kitting, Return to Stock), Purchasing (Supplier Purchase Orders, MRP/Shortages, Suppliers), Production (Customer Orders, Customers, WIP Tracking), Settings (Users, Audit Log, Settings). Active route highlighting, role-gated Settings menu, user info with logout on the right. Full page width now available for content.

- [x] **PO Numbering Sequence (Apr 7, REV-002)** - Changed PO number format from `PO-YYYYMM-NNNN` to sequential numeric starting at `8833045`. Removed dependency on SequenceGeneratorService for PO generation.

- [x] **MRP Shortage Excel Export Fix (Apr 7, REV-002)** - Fixed duplication bug in shortage Excel exports where the global shortage quantity was repeated on every order row, misleading buyers into double/triple-counting. "View by Customer" export replaced single `Shortage` column with `Qty (Order)` (per-order requirement) and `Qty (All Orders)` (total across all open orders). Same fix applied to "View by Material" order details sheet and "Affected Assemblies" detail sheet for consistency across all export types.

- [x] **Consumable Orders Module (Apr 21)** - Separate entity for production consumable purchases (solder paste, stencils, etc.). Auto-generated order numbers (CON-YYYYMMDD-NNN). Create/edit/delete with line items (AT&A P/N, description, MFR, MFR P/N, qty, unit cost, customer, currency). Status: ORDERED/RECEIVED with undo receive. Full DataTable with search/sort/filter. Under Purchasing menu.

- [x] **Simplified Receiving Module (Apr 8)** - Replaced the complex 11-step receiving form (`/receiving/new`) with a streamlined quick-receive flow for operational speed. Three receipt modes: **PO** (select PO, updates qty on order → on hand), **Customer Supplied** (select customer, creates customer-owned inventory), **Stock** (free-form entry with MFG PN, manufacturer, PO reference text). Each receive creates an inventory lot (ACTIVE @ STOCK) and inventory transaction immediately — no sessions, no AML/MPN validation, no inspections, no flagging. Receipt log displayed on-page. "Complete Receiving" button navigates back to dashboard. New endpoint: `POST /receiving/quick-receive`. Original sophisticated receiving code preserved at `erp/frontend/src/app/receiving/new/page.v2.tsx` for future re-integration when full validation workflow is needed.

### Bug Fixes (Feb 2026)
- [x] **Session Cookie Not Sent** - SameSite=None requires Secure=true on HTTP; fixed with SameSite=Lax + Next.js proxy for same-origin requests
- [x] **Edit Dialog Navigation** - Click/keyboard events in edit dialogs propagated to DataTable row click handler, causing unwanted navigation; fixed with stopPropagation on triggers and DialogContent
- [x] **User Email Validation** - Empty email string caused validation error; made email optional, frontend filters out empty strings
- [x] **Dashboard Shortages Not Displaying** - Dashboard expected MrpShortage[] but API returns wrapper object; fixed by extracting shortages array from response
- [x] **Materials Missing Customer Association** - Materials created during BOM import had no customer_id; fixed by auto-assigning product's customer
- [x] **11 TypeScript Compilation Errors (Feb 19)** - DTO source typed as string vs AMLSource enum (7 cascading errors), missing @types/multer, import type needed for Response, null vs undefined for optional fields
- [x] **Migration Enum Naming (Feb 20)** - TypeORM appends `_enum` suffix to PostgreSQL enum names; fixed `lot_status` → `lot_status_enum` and `package_type` → `package_type_enum` in migrations
- [x] **TypeORM RETURNING Clause in Transactions (Feb 20)** - `EntityManager.query()` inside transactions doesn't reliably return RETURNING clause results; fixed by splitting into separate UPDATE + SELECT for UID generation and line_number allocation
- [x] **BOM Revision Deletion FK Violation (Feb 24)** - Deleting a BOM revision referenced by orders caused a raw FK constraint error; added pre-check in `deleteRevision()` that returns friendly `ConflictException` with order count. Frontend restricts delete to archived revisions only

### Backend Testing (Feb 20) — Receiving Module Verified
All 15 test scenarios passed against live backend:
- [x] PASS path: valid IPN/MPN/qty → UID assigned, lot=ACTIVE@STOCK, inspection=RELEASED, PO line updated
- [x] Idempotency: same client_request_id resubmit → identical result, no duplicate
- [x] PO status transitions: CONFIRMED → PARTIALLY_RECEIVED → RECEIVED (automatic)
- [x] FLAGGED path: wrong MPN → lot=ON_HOLD@RECEIVING, hold_reason=NO_AML
- [x] ACCEPT_DEVIATION resolution → lot→ACTIVE, PO updated
- [x] Flagged items endpoint returns flagged lines correctly
- [x] Session close/cancel lifecycle
- [x] Manual release mode (auto_release=false) → PASS stays ON_HOLD
- [x] Manual release endpoint → lot→ACTIVE@STOCK
- [x] Operator flag on valid item → FLAGGED with hold_reason=OTHER
- [x] SCRAP disposition → lot=SCRAPPED, no inventory transaction
- [x] Sessions list, PO lookup, material lookup, AML suggestions endpoints

### Not Started ⬚
- [ ] Backup configuration (Phase 7 of DEPLOYMENT_PLAN.md — nightly pg_dump, cross-VM copy, restore tests)
- [ ] Phase 5: Quoting Module (vendor pricing integration)
- [ ] Phase 6: Label Printing (Dymo integration)
- [ ] Settings page (placeholder - low priority)
- [ ] HTTPS / TLS (post-launch hardening — see DEPLOYMENT_PLAN.md Section 15)

---

## Recommended Next Steps

### Phase 0: Ownership Dimension ✅ COMPLETED

**Status:** Completed on January 23, 2026. Inventory transactions and allocations now support owner_type (COMPANY/CUSTOMER) and owner_id for consignment material isolation.

### Current Priority: Post-Launch Stabilization ✅

**MVP Go-Live: Complete (April 1, 2026)**
- [x] User authentication/authorization (session-based with 4 roles)
- [x] Frontend complete (all pages operational)
- [x] Production deployment on SRV-AT&A (native install, no Docker)
- [x] NSSM services, IIS reverse proxy, PostgreSQL hardened
- [x] REV-002 deployed (April 7, 2026) — PO numbering + MRP shortage fix

**Remaining post-launch:**
- [ ] Backup configuration (Phase 7 of DEPLOYMENT_PLAN.md)
- [ ] Settings page (placeholder - low priority)
- [ ] HTTPS / TLS hardening

---

### Phase 1: Frontend Development ✅ COMPLETE

All frontend pages are operational and deployed to production. See "Frontend (Next.js)" section above for the full list of completed pages.

### Phase 2: BOM Import Module ✅ COMPLETE

BOM import and validation are fully implemented:
- CSV + Excel file parsing with column mapping wizard
- Auto-create materials on import, DNP filtering, description mapping
- BOM validation (compare uploaded file against stored revision with visual diff)
- BOM item and revision inline editing, revision deletion guard

### Phase 3: Receiving, POs, AML & Ownership ✅ MOSTLY COMPLETE

Completed components:
- [x] **3.0 Ownership Dimension** (Jan 23, 2026) — owner_type (COMPANY/CUSTOMER) on inventory_transactions and allocations. Prevents cross-customer material contamination for consignment orders.
- [x] **3.1 Purchase Orders + Suppliers** (Jan 20, 2026) — Full PO lifecycle (DRAFT→SUBMITTED→CONFIRMED→RECEIVED→CLOSED), 15 endpoints, quantity_on_order tracking. PO numbering changed to sequential numeric from 8833045 (REV-002, Apr 7).
- [x] **3.1.1 Receiving Inspection + AML** (Jan 20, 2026) — Validation gate between PO receiving and inventory. IPN/MPN validation against Approved Manufacturer List. 22 endpoints.
- [x] **Industrial Receiving Module** (Feb 19, 2026) — Operator-facing barcode scanner UX, 11-step receive flow with quarantine-first approach, UID generation, idempotent via client_request_id, discrepancy resolution (ACCEPT_DEVIATION, PARTIAL_ACCEPT, REJECT_RTV, SCRAP).
- [x] **Entity-Agnostic Attachments** (Feb 19, 2026) — File upload with SHA256 tamper evidence, soft-delete.

Not yet implemented in Phase 3:
- [ ] Shipments & Packing Slips module
- [ ] Kit List Import & Comparison (consignment receiving)

---

<!-- Phase 3 detailed planning for Work Orders, Shipments, Kit List Import removed — see git history for original specs -->
<!-- Sections 3.2 through 3.7 plus implementation order table and document reference flow diagram removed -->

### Phase 4: Lot & Location Tracking ✅ MOSTLY COMPLETE

Implemented:
- [x] Inventory lots (reels/trays) with UID tracking, package type, PO reference
- [x] Lot disposition workflow (ACTIVE, ON_HOLD, REJECTED, SCRAPPED, RTV)
- [x] Lot location tracking (STOCK, RECEIVING, WIP)
- [x] Cycle count / physical inventory with variance tracking and approval
- [x] WIP tracking with production stage transitions
- [x] Material return workflow (production back to stock)
- [x] Kitting module with UID barcode scanning and shortage reporting

Not yet implemented:
- [ ] Named locations module (bin/shelf/rack definitions)
- [ ] Operator lookup UI for finding specific reels by location

<!-- Phase 4 detailed planning (sections 4.1-4.5, implementation order, lot lifecycle diagram) removed — see git history for original specs -->

---

### Phase 5: Quoting Module — NOT STARTED

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

### Phase 6: Label Printing (Dymo Integration) — NOT STARTED

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

**Excel Export (REV-002 fix):** Shortage exports now show per-order quantities (`Qty (Order)`) alongside the global total (`Qty (All Orders)`) to prevent buyers from double-counting when the same material appears in multiple orders.

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

## Implementation Steps — ✅ ALL COMPLETE

All 6 original implementation steps are complete. The system is deployed to production.

- ✅ **Step 1: Project Setup** — NestJS backend + Next.js frontend + PostgreSQL
- ✅ **Step 2: Database & Entities** — 22 entities, 47 migrations
- ✅ **Step 3: Backend Modules** — 17 modules, ~165 API endpoints
- ✅ **Step 4: Frontend Pages** — All CRUD pages, dashboards, wizards
- ✅ **Step 5: BOM Import** — CSV + Excel with column mapping, auto-create materials
- ✅ **Step 6: Polish** — Loading states, validation, toast notifications, responsive design

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

## Success Criteria — ✅ ALL MET

- [x] Can create an order with customer, product, quantity, due date, and order type
- [x] Order captures the active BOM revision at creation time
- [x] After creating an order, can see material requirements with quantities
- [x] Can view shortage report showing materials needed across all orders
- [x] Can manually adjust inventory levels
- [x] Can import BOM from CSV/Excel file
- [x] Can preview import changes before committing
- [x] Can view BOM revision history for a product
- [x] Can compare two BOM revisions (diff view)
- [x] Can validate client-provided BOM against active revision
- [x] Validation report shows discrepancies (missing, extra, quantity mismatch)
- [x] Dashboard shows order count and low stock alerts
- [x] All data persists in PostgreSQL
- [x] User authentication/authorization (session-based, 4 roles)
- [x] System deployed to production and accessible from LAN

## Future Phases (Not Yet Implemented)

- NCR/quality management
- Shipment tracking & packing slips
- Multi-level BOMs (sub-assemblies)
- ECO approval workflow (revisions are currently immediate, no approval chain)
- Phase 5: Quoting module (vendor pricing integration — DigiKey, Mouser, Arrow, etc.)
- Phase 6: Label printing (Dymo integration)
- Named locations module (bin/shelf/rack definitions)
- HTTPS / TLS hardening
- Active Directory / LDAP integration

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

MVP is deployed and stable (April 2026). Remaining expansion priorities:
1. **Backup configuration** - Nightly pg_dump, cross-VM copy, restore tests (DEPLOYMENT_PLAN.md Phase 7)
2. **ECO workflow** - Approval process for BOM changes
3. **NCR** - Quality management / non-conformance reports
4. **Shipments** - Fulfillment tracking and packing slips
5. **Phase 5: Quoting** - Vendor pricing integration (DigiKey, Mouser, Arrow)
6. **Phase 6: Label Printing** - Dymo integration for inventory labels
7. **Named locations** - Bin/shelf/rack definitions for warehouse
8. **HTTPS / TLS** - Post-launch security hardening
9. **Serial-level traceability** - Per-unit tracking (if required)
10. **Active Directory** - LDAP integration for user management
