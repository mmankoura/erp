# ERP System Overview

> **System**: Manufacturing ERP — AT&A Canada
> **Production URL**: http://erp.atacanada.ca
> **Server**: SRV-AT&A (10.12.1.47), Windows Server 2019 (VMware)
> **Go-live**: 2026-04-01 (REV-001) — actively maintained, currently at REV-005 (2026-04-26)
> **Doc purpose**: Top-level orientation plus historical issues and corrective actions. For granular release notes see `CHANGELOG.md`; for deployment specifics see `DEPLOYMENT_LOG.md` / `DEPLOYMENT_PLAN.md`.

---

## 1. What this system does

Manufacturing ERP for an electronics contract manufacturer. Tracks the full flow from quoting and receiving through inventory, production (SMT and Through-Hole), kitting, shipping, and audit. Built as a single multi-tenant-style web app for internal AT&A use — no public exposure, intranet only.

**Primary domain concepts**

- **Materials** — components and parts catalog (IPN-keyed).
- **Products** — assemblies; each has BOM revisions with line items, alternates, and resource-type tags (SMT / TH / MECH / PCB / DNP).
- **Orders** — work orders for customers; advance through the 6-state workflow ENTERED → KITTING → SMT → TH → SHIPPED, with ON_HOLD / CANCELLED off-ramps.
- **Inventory** — ledger-based, lot/UID-tracked. Dual-status model: physical state (`LotStatus`) and workflow state (`AllocationStatus`).
- **Purchase Orders** — POs with sequential numbering from 8833045, PDF generation, history archive.
- **Receiving** — quick-receive flow with three modes (PO, Customer Supplied, Stock) plus PO-mode inspection.
- **Kitting** — UID barcode scanning, BOM aggregation, alternate-material substitution.
- **MRP / Shortages** — buildability analysis, shortage views by material/customer/product, alternate-aware.
- **Cycle Count, Return to Stock, Consumable Orders, AML, Audit, Attachments** — supporting modules.

---

## 2. Architecture at a glance

### Backend — `erp/backend/`

- **Stack**: NestJS + TypeORM + PostgreSQL 16, session auth via Passport.js.
- **22 modules** under `src/modules/`: aml, attachments, audit, auth, bom, consumable-orders, customers, cycle-count, health, inventory, kitting, materials, mrp, orders, production, products, purchase-orders, receiving, receiving-inspection, shared, suppliers, users.
- **33 entities** under `src/entities/` covering all domain concepts above plus join tables (BOM revisions/items/alternates, inventory lots/transactions/allocations, kitting list/orders/items/scans, receiving sessions/lines, PO history, order material sources).
- **47 migrations**, migrations-first (`synchronize: false`).
- **Cross-cutting infra**:
  - `SequenceGeneratorService` — Postgres advisory locks for race-free numbering (PO, order, receiving, kitting, cycle-count, consumable orders).
  - `Audit` module — append-only event log.
  - Entity-agnostic `Attachments` module with SHA256 tamper evidence and soft-delete.
  - PO PDF generation (matches AT&A bilingual template).

### Frontend — `erp/frontend/`

- **Stack**: Next.js 14 (App Router), React, shadcn/ui, Tailwind v4, TypeScript.
- **20 route groups**: aml, audit, bom, consumable-orders, customer-supplied, customers, cycle-counts, inventory, kitting, login, materials, mrp, orders, production, products, purchase-orders, receiving, return-to-stock, settings (placeholder), suppliers.
- **Shared building blocks**:
  - `lib/api.ts` — typed API client + `useApi` / `useMutation` hooks; uploads use raw `fetch` + `FormData`.
  - `DataTable` — Excel-style filters, sorting, resizable columns with localStorage persistence.
  - `VirtualGrid` — virtualized rows + sticky headers for large inventory views (added REV-005).

### Auth & roles

- 4 roles: `ADMIN`, `MANAGER`, `WAREHOUSE_CLERK`, `OPERATOR`.
- Guards: `AuthenticatedGuard`, `RolesGuard`. Decorator: `@Roles(UserRole.X)`.
- Cookie: `secure: false` until HTTPS is enabled (see Issue P-1 below).

### Production topology

- Native install on Windows Server (no Docker).
- **NSSM** runs `erp-backend` and `erp-frontend` directly as Windows services with auto-restart.
- **IIS + URL Rewrite + ARR** as reverse proxy on port 80, forwarding `/api` to backend and root to Next.js.
- PostgreSQL 16 listens on localhost only; `erp_app` application user has scoped GRANTs.
- Backups: nightly pg_dump to `C:\erp-backups\` plus cross-VM copy to FactoryLogix share — **scripts not yet created (Phase 7 pending)**.

---

## 3. Module status

| Module | Status |
|---|---|
| Materials, Products, Customers, Suppliers, BOM | Live |
| Orders (6-state workflow) | Live |
| Inventory (ledger + lots + allocations) | Live |
| Receiving (quick-receive: PO / Customer Supplied / Stock) | Live |
| Receiving Inspection | Live (PO mode only) |
| Purchase Orders (with PDF) | Live |
| AML (Approved Manufacturer List) | Live |
| MRP / Shortages (alternate-aware) | Live |
| Production (WIP, SMT/TH stages, consumption) | Live |
| Kitting (UID scanning, alternates) | Live |
| Cycle Count | Live |
| Return to Stock | Live |
| Consumable Orders | Live (REV-005) |
| Attachments, Audit, Health | Live |
| Quoting | Not started (Phase 5) |
| Label Printing (Dymo) | Not started (Phase 6) |
| Settings page | Placeholder |
| Backups (Phase 7) | Pending |
| HTTPS / TLS | Pending |

---

## 4. Historical issues and corrective actions

### 4.1 Pre-deployment (codebase fixes, 2026-03-30)

| # | Issue | Corrective Action |
|---|---|---|
| C-1 | Duplicate `ResourceType` export in `frontend/src/lib/api.ts` (line 116 and ~756) — TS compile failure. | Removed duplicate at line 116. |
| C-2 | `bomItem` possibly-undefined type error at `inventory.service.ts:1800`. | Assigned to `matchedBomItem` after null-guard so TS narrowing applies. |
| C-3 | **Deployment blocker** — migration path hardcoded to `src/database/migrations/*.ts`; broke in compiled `dist/`. | Changed to `__dirname + '/migrations/*{.ts,.js}'` so it resolves in both dev (`.ts`) and prod (`.js`). |

### 4.2 Migration ordering (2026-03-31)

| # | Issue | Corrective Action |
|---|---|---|
| C-4 | Migration `1768300000000-AddResourceTypeToMaterial`: class-name timestamp `1706600000000` did not match filename `1768300000000`, sorting incorrectly. | Renamed class to match file timestamp. |
| C-5 | Init migration had the latest timestamp (`1768111505273-init`) so it ran last instead of first, blowing up base tables. | Renamed file and class to `1736500000000-init` so it runs before all others. Required dev rebuild + resync to server. |
| **Lesson saved to memory** | TypeORM appends `_enum` suffix to PostgreSQL enum type names (e.g. `LotStatus` → `lot_status_enum`). Always query `pg_type` before writing raw enum SQL. | |

### 4.3 Process management (2026-03-31)

PM2 boot persistence failed three ways before pivoting:

| # | Attempt | Why it failed | Outcome |
|---|---|---|---|
| C-6a | `pm2-windows-service` | Deprecated; service never registered on Windows Server 2019 + Node 22. | Abandoned. |
| C-6b | NSSM + PM2 | NSSM launched Node at boot, but PM2 daemon identity mismatched between SYSTEM and Administrator contexts — `pm2 status` could not see the processes. | Abandoned. |
| C-6c | Task Scheduler `AtStartup` | Worked when triggered manually, never fired on actual boot. | Abandoned. |
| **C-6 fix** | **NSSM running Node directly as `erp-backend` and `erp-frontend` services**, bypassing PM2 entirely. PM2 retained only for manual ad-hoc admin use. | | Adopted; passed all GO/NO-GO tests including headless boot. |

Side-effects noted while wiring NSSM:

- `.env.production` is **not** picked up by `dotenv/config` — file must be named `.env`.
- Frontend service must invoke `node_modules/next/dist/bin/next` directly; `.bin/next` is a shell script that won't run under NSSM.
- Don't mix SYSTEM, Administrator, and interactive session contexts for any PM2-style daemon.

### 4.4 Production runtime (post go-live, 2026-04-01)

| # | Issue | Root cause | Corrective Action |
|---|---|---|---|
| **P-1** | All authenticated API calls returned `401 Unauthorized` after login. | Session cookie set with `secure: true` in production (`secure: config.NODE_ENV === 'production'` in `main.ts`). Site is HTTP, so browser dropped the cookie on subsequent requests. | Changed `secure: false` in `main.ts`, rebuilt, redeployed `dist/main.js`, restarted `erp-backend`. **Revert to `true` once HTTPS is enabled.** |
| P-2 | IIS returned 500 on first proxy attempt. | Missing forwarded-header server variables. | Added `HTTP_X_FORWARDED_FOR`, `HTTP_X_FORWARDED_PROTO`, `HTTP_X_FORWARDED_HOST` to URL Rewrite rules. |

### 4.5 Release deployments

**REV-002 (2026-04-07)** — PO numbering + MRP shortage export fixes

| # | Issue | Corrective Action |
|---|---|---|
| R2-1 | "View by Customer" Excel export showed global shortage on every row → buyers double/triple-counting. | Replaced single `Shortage` column with `Qty (Order)` + `Qty (All Orders)`. Same fix applied to "By Material" Order Details and "Affected Assemblies" exports. |
| R2-2 | `rename current previous` failed with "Access is denied" during deploy. | Services were still running — stop `erp-backend` and `erp-frontend` before the rename. |
| R2-3 | `releases\` folder was empty after deploy script ran. | Script copies to `C:\erp-deploy\`, not `C:\apps\erp\releases\` — robocopy from staging to app dir is required. |
| R2-4 | `rename` placed the folder *inside* `releases\` instead of beside it. | Use `move` instead of `rename`. |

All four lessons folded into `UPGRADE_PROCEDURE.md`.

**REV-003 (2026-04-09)** — Simplified receiving (quick-receive)

| # | Issue | Corrective Action |
|---|---|---|
| R3-1 | Robocopy of frontend `node_modules` interrupted by network timeout after ~2.5 hours. | Re-ran script — robocopy resumed and skipped already-copied files. |
| R3-2 | Frontend failed to start: `ENOENT .next/static`. Partial `.next` copy. | Copied `.next/static` separately from dev via `\\10.12.1.47\erp-deploy\static-temp`. |
| R3-3 | Frontend failed again: `ENOENT .next/server/pages-manifest.json`. | Copied full `.next` folder via dedicated `next-full` staging. **`.next` must be 100% intact — verify `static/` and `server/` after every copy.** |
| R3-4 | Network robocopy of `node_modules` (~538 MB) ran at ~1.5 MB/min. | Future deploys: use junction links for unchanged `node_modules`; move directly from `C:\erp-deploy\releases\` to `C:\apps\erp\current` (skip staging→app hop) where possible. |
| R3-5 | Original 11-step receiving form was too heavyweight for the floor. | Replaced with quick-receive (3 modes: PO / Customer Supplied / Stock). Original preserved as `page.v2.tsx` for future re-integration. |

**REV-004 (2026-04-21)** — Material supply source + MRP alternates + production wiring

- New per-order `OrderMaterialSources` table (default COMPANY); customer-supplied items now excluded from all shortage views.
- New `BomItemAlternates` table (backfilled from legacy `alternate_ipn`); MRP and kitting are alternate-aware end-to-end.
- Production wiring: SMT+PCB consume at SMT completion, TH+MECH at TH completion, with preview dialog. Order detail now exposes contextual buttons (Start Kitting, Complete SMT, Complete TH).

**REV-005 (2026-04-26)** — Operational polish

- Consumable Orders module (CON-YYYYMMDD-NNN), PO PDF generation, Supplier profile fields (attention, terms, FOB, ship-to, currency), VirtualGrid on inventory tabs, Receiving Log tab, Undo Receive (delete a receipt and reverse the txn / lot / PO update), `qty=0` on Return to Stock now marks the lot CONSUMED, breadcrumbs show "Details" instead of UUIDs.

### 4.6 Schema discrepancies resolved (2026-02-12)

Pre-rewrite gaps captured in `IMPLEMENTATION_DISCREPANCY_REPORT.md` and resolved before REV-001:

| # | Discrepancy | Resolution |
|---|---|---|
| D-1 | Order status enum (`PENDING`/`CONFIRMED`/`IN_PRODUCTION`/`COMPLETED`) didn't match new 6-state workflow. | Migrated `CONFIRMED → ENTERED` (only 4 orders existed). New transitions: ENTERED → KITTING → SMT → TH → SHIPPED, with ON_HOLD / CANCELLED. Service `validateStatusTransition` rewritten. |
| D-2 | `materials.package` overlapped with proposed `package_size`. | Renamed `package` → `package_size` (column was empty — no data loss). |
| D-3 | `bom_items.scrap_factor` overlapped with proposed `waste_percentage`. | Renamed to `waste_percentage` (all 753 rows were 0.00); added `waste_source`, `waste_approved_by`, `waste_approved_at`. |
| D-4 | UID status: two different status models (`LotStatus` vs `AllocationStatus`). | Kept dual-status — `LotStatus` for physical/quality state, `AllocationStatus` for workflow state. Added `FLOOR_STOCK` and `RETURNED` to `AllocationStatus`. |
| D-5 | Allocation enum missing FLOOR_STOCK / RETURNED. | Added (no existing allocation rows — clean addition). |
| D-6 | Already-correct: `SCRAP` transaction type and `ResourceType` enum (SMT/TH/MECH/PCB/DNP) — no change needed. |

---

## 5. Standing engineering rules (from prior incidents)

- Always run `npx tsc --noEmit` in `erp/backend/` before committing — catches type errors in ~10s.
- Entities use `null` for nullable columns; interfaces use `undefined` for optional fields. Don't mix across the boundary.
- DTOs that map to entity enum columns must use the actual enum type, not `string`.
- `tsconfig.json` has `isolatedModules: true` + `emitDecoratorMetadata: true` — use `import type` for types in decorated positions.
- When using a new library, install its `@types/*` in the same step.
- TypeORM PG enum names get an `_enum` suffix — verify with `pg_type` before raw SQL.
- `ReceivingInspection.po_line_id` is **not** nullable — only create inspections in PO mode with a matched PO line.
- Stop services before `move`/`rename` of `current`. Verify `.next/static` and `.next/server` after every copy. Use `move`, not `rename`, when relocating release folders.

---

## 6. Outstanding work

- **Phase 5** — Quoting module (vendor API integration, 16–20 hrs).
- **Phase 6** — Dymo label printing (6–8 hrs).
- **Phase 7** — Backup scripts, scheduled tasks, cross-VM copy, monthly off-host (Tier 3).
- **Hardening** — HTTPS / TLS (then revert session cookie `secure` flag back to `true` per Issue P-1).
- **Settings page** — currently a placeholder.
- **VMware snapshot cleanup** — confirm `Pre-ERP-Deploy-2026-03-30` was deleted post go-live (was flagged for removal within 72 hours of stability).

---

## 7. Reference docs

- `IMPLEMENTATION_PLAN_MVP.md` — full phase-by-phase MVP plan.
- `CHANGELOG.md` — release-by-release change control.
- `IMPLEMENTATION_DISCREPANCY_REPORT.md` — resolved schema/enum discrepancies (Feb 2026).
- `PROPOSED_CHANGES_PLAN.md` — pre-implementation design notes.
- `DEPLOYMENT_PLAN.md` / `DEPLOYMENT_LOG.md` — go-live walkthrough and incident log.
- `UPGRADE_PROCEDURE.md` — release deploy steps (incorporates REV-002/003 lessons).
- `DEV_SYNC_PROCEDURE.md` — dev-machine prep before deploy.
- `VERIFICATION_CHECKLIST.md` — post-deploy smoke tests.
- `docs/system-workflows.md` — entity dependencies and setup sequence.
- `erp/TEST_REPORT.md` — current test coverage snapshot.
