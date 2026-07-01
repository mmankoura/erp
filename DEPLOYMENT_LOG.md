# ERP Deployment Log

> **Started**: March 30, 2026
> **Target**: SRV-AT&A (10.12.1.47)
> **Plan**: See DEPLOYMENT_PLAN.md

---

## Pre-Deployment: Dev Machine Preparation

### Codebase Fixes (March 30, 2026)

Three issues were discovered and fixed before deployment:

| # | Issue | File | Fix |
|---|-------|------|-----|
| 1 | Duplicate `ResourceType` export | `erp/frontend/src/lib/api.ts` | Removed duplicate at line 116 (original at ~756) |
| 2 | `bomItem` possibly-undefined type error | `erp/backend/src/modules/inventory/inventory.service.ts:1800` | Assigned to `matchedBomItem` after null-guard to help TS narrowing |
| 3 | **DEPLOYMENT BLOCKER** — migration path hardcoded to `src/database/migrations/*.ts` | `erp/backend/src/database/data-source.ts` | Changed to `__dirname + '/migrations/*{.ts,.js}'` — works in both dev (`.ts`) and production `dist/` (`.js`) |

All fixes committed. Both backend and frontend build cleanly.

### Build Verification

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` (backend) | PASS — no type errors |
| `npm run build` (backend) | PASS — `dist/main.js` created |
| `npm run build` (frontend) | PASS — `.next/BUILD_ID` created |
| `dist/database/data-source.js` migration path | PASS — uses `__dirname + '/migrations/*{.ts,.js}'` |
| Compiled migrations in `dist/database/migrations/` | PASS — all migrations compiled including `1768300000000-AddResourceTypeToMaterial.js` |

---

## Pre-RDP Checklist

Everything below must be done on the dev machine BEFORE RDP-ing into the server.

### 1. Generate Credentials (do this now, save securely)

- [x] **PostgreSQL `postgres` superuser password** — generated 2026-03-30, 48-char hex, stored in password manager
- [x] **PostgreSQL `erp_app` application password** — generated 2026-03-30, 48-char hex, stored in password manager
- [x] **Session secret (64 bytes hex)** — generated 2026-03-30, 128-char hex, stored in password manager
- [x] **Pre-filled `.env.backend`** — saved locally outside git (see `C:\erp-installers\.env.backend`)
- [x] **Pre-filled `.env.frontend`** — saved locally outside git (see `C:\erp-installers\.env.frontend`)

> **NEVER commit real credentials to git.** Actual values are in your password manager only.

### 2. Download Installers (to bring to server via shared drive or USB)

Download these to `C:\erp-installers\`:

- [x] **Node.js LTS v22.22.2** — `node-v22.22.2-x64.msi` (30 MB)
- [x] **PostgreSQL 16.13** — `postgresql-16.13-2-windows-x64.exe` (347 MB)
- [x] **IIS URL Rewrite 2.1** — `rewrite_amd64_en-US.msi` (5.8 MB)
- [x] **IIS ARR 3.0** — `requestRouter_amd64.msi` (2.4 MB)

> **Why pre-download?** The server may have restricted or slow internet access.

### 3. Verify Build Script Configuration

- [ ] Check the `SERVER_SHARE` path in `deploy\build-release.bat`:
  ```
  set SERVER_SHARE=\\erp.company.local\erp-deploy
  ```
  This won't resolve until DNS is configured in Phase 1. For the first deploy, you'll copy manually or use the server IP: `\\10.12.1.47\erp-deploy`

- [x] Test date formatting: `echo %date%` → `Mon 03/30/2026` — standard `DDD MM/DD/YYYY` format, build script parsing works as-is

### 4. Verify Server Access

- [ ] Confirm you can RDP into `10.12.1.47` (SRV-AT&A)
- [ ] Confirm your RDP user has local Administrator privileges (needed for IIS, services, firewall)
- [ ] Confirm you know the VMware ESXi login (needed for snapshot before changes)

### 5. Prepare the First Admin User

- [ ] Decide on the first ERP admin username/email and password
  - The app uses session-based auth with 4 roles: ADMIN, MANAGER, WAREHOUSE_CLERK, OPERATOR
  - First user must be ADMIN — you'll create it after the app is running
  - Record: username `_______________` / password `_______________`

### 6. Communication

- [ ] Notify anyone who uses SRV-AT&A shared drives that you'll be doing maintenance
  - Phase 1 installs are low-risk (adding new software, not changing existing)
  - But a reboot will be needed during PM2 GO/NO-GO testing (Phase 5)
  - Plan for a short maintenance window: `_______________`

---

## Phase 1: Install Prerequisites & DNS

**Date/time started**: March 30, 2026
**VMware snapshot taken**: [x] Yes — snapshot name: `Pre-ERP-Deploy-2026-03-30` (created 16:09:46 -0400)

### 1.1 — DNS Record
- [x] Opened `dnsmgmt.msc`
- [x] Added A record: `erp` → `10.12.1.47` in zone `atacanada.ca` (FQDN: `erp.atacanada.ca`)
- [ ] Verified from workstation: `ping erp.atacanada.ca` → resolves to `10.12.1.47`
- Notes: Actual domain is `atacanada.ca`, not `company.local`. Updated `.env.backend` (CORS_ORIGIN) and `.env.frontend` (API URL) to use `http://erp.atacanada.ca`. Entire `C:\erp-installers\` folder copied to `C:\erp-installers\` on the server — all installers, env files, SQL scripts, and config files available locally on server.

### 1.2 — Node.js
- [x] Installed Node.js LTS v22.22.2 (default settings, native tools unchecked)
- [x] `node -v` output: v22.22.2
- [x] `npm -v` output: 10.9.7
- Notes: Server confirmed Windows Server 2019 (10.0.17763.6854)

### 1.3 — PostgreSQL 16
- [x] Installed PostgreSQL 16.13 (default data dir, port 5432, service account NT AUTHORITY\NetworkService)
- [x] Set `postgres` superuser password (recorded in password manager)
- [x] Locale: [DEFAULT] (UTF-8 on US/English Windows)
- [x] Stack Builder unchecked
- [x] `services.msc` → "postgresql-x64-16" status: Running
- [x] Startup type: Automatic
- Notes: pgAdmin 4 and Command Line Tools also installed

### 1.4 — PM2
- [x] `npm install -g pm2` — success (133 packages)
- [x] `npm install -g pm2-windows-service` — success (126 packages, deprecation warning: recommends pm2-installer instead)
- [x] `pm2 install pm2-logrotate` — success, module online
- [x] Configured log rotation: max_size 10M, retain 30, compress true
- Notes: pm2-windows-service deprecated but functional. If GO/NO-GO gate fails in Phase 5, fallback to NSSM.

### 1.5 — IIS Modules
- [x] URL Rewrite 2.1 module installed (rewrite_amd64_en-US.msi)
- [x] Application Request Routing 3.0 module installed (requestRouter_amd64.msi)
- Notes: Both default settings

### 1.6 — Shared Folder for Releases
- [x] Created `C:\erp-deploy`
- [x] Shared as `erp-deploy` with read/write
- [x] Verified from dev machine: `dir \\10.12.1.47\erp-deploy` — success (69 GB free shown)
- Notes: Share accessible via IP. DNS-based access (`\\erp.atacanada.ca\erp-deploy`) can be tested after DNS propagates.

**Phase 1 completed**: March 30, 2026

---

## Phase 2: Create Folder Structure

- [x] Created all directories (current\backend, current\frontend, previous, releases, shared, shared\uploads, logs, C:\erp-backups)
- Notes: Verified in File Explorer — all 5 top-level folders visible under C:\apps\erp\

**Phase 2 completed**: March 30, 2026

---

## Phase 3: Database Setup

### 3.1 — Configure PostgreSQL
- [x] Edited `postgresql.conf` — listen_addresses='localhost', max_connections=30, shared_buffers=512MB, work_mem=16MB, maintenance_work_mem=128MB, wal_level=replica, autovacuum=on, logging configured (daily rotation, 100MB max, slow query > 1s)
- [x] Replaced `pg_hba.conf` with hardened rules (localhost only, scram-sha-256, deny all remote)
- [x] Restarted PostgreSQL service — confirmed Running
- [x] Verified startup type = Automatic
- Notes: Original postgresql.conf backed up to desktop before editing. Code page warning (437 vs 1252) is cosmetic.

### 3.2 — Create Database and User
- [x] Connected: `psql -U postgres -h 127.0.0.1` — success
- [x] `CREATE USER erp_app` — CREATE ROLE
- [x] `CREATE DATABASE erp_production OWNER postgres ENCODING 'UTF8'` — CREATE DATABASE
- [x] `GRANT CONNECT ON DATABASE erp_production TO erp_app` — GRANT
- Notes: All commands succeeded

### 3.3 — Backup Credentials
- [x] Created `%APPDATA%\postgresql\pgpass.conf` (copied from C:\erp-installers\)
- [x] Restricted permissions via `icacls` — Administrator read-only, inheritance removed
- Notes: pgpass.conf at C:\Users\Administrator\AppData\Roaming\postgresql\pgpass.conf

**Phase 3 completed**: March 30, 2026

---

## Phase 4: First Release Deployment

### 4.1 — Copy Release to Server
- [x] Backend `dist/`, `node_modules/`, `package.json` copied
- [x] Frontend `.next/`, `node_modules/`, `public/`, `package.json` copied
- Copy method: robocopy from dev machine to `\\10.12.1.47\erp-deploy\releases\2026-03-30_001\`, then robocopy to `C:\apps\erp\current\`
- Notes: Network dropped once during backend node_modules copy — resumed successfully. 78,256 files, 1.39 GB total.

### 4.2 — Move to App Directory
- [x] `robocopy C:\erp-deploy\releases\2026-03-30_001 C:\apps\erp\current /E /NP` — success

### 4.3 — Create Environment Files
- [x] Created `C:\apps\erp\shared\.env.backend` with real credentials (copied from `C:\erp-installers\`)
- [x] Created `C:\apps\erp\shared\.env.frontend`
- [x] Copied to `current\backend\.env.production` and `current\frontend\.env.production`
- Notes: Domain updated to `erp.atacanada.ca` (not `company.local`)

### 4.4 — Run Migrations
> **NOTE**: The deployment plan says `dist/data-source.js` but the correct path is `dist/database/data-source.js`
- [x] All 46 migrations executed successfully
- Issues encountered and fixed:
  1. `1768300000000-AddResourceTypeToMaterial` — class name timestamp `1706600000000` didn't match file timestamp `1768300000000`, causing wrong sort order. Fixed class name.
  2. `1768111505273-init` — init migration that creates base tables had latest timestamp, so it ran last instead of first. Renamed file and class to `1736500000000-init` so it runs before all other migrations.
  3. Both fixes required rebuilding on dev machine and resyncing migration files to server via batch scripts.

### 4.5 — Grant App User Permissions
- [x] Ran `grant-permissions.sql` as postgres — all 5 statements succeeded (GRANT x3, ALTER DEFAULT PRIVILEGES x2)

**Phase 4 completed**: March 31, 2026

---

## Phase 5: Process Management

### Architecture Change: PM2 → NSSM Direct Services (March 31, 2026)

PM2 boot persistence was attempted via three approaches, all failed:

1. **`pm2-windows-service`** — deprecated, service never registered on Windows Server 2019 / Node 22
2. **NSSM + PM2** — NSSM launched Node processes at boot (confirmed via `tasklist`), but PM2 daemon architecture caused identity mismatch between SYSTEM service context and Administrator user context. `pm2 status` could not see running processes.
3. **Task Scheduler `AtStartup`** — task worked when manually triggered (`schtasks /run`), but `AtStartup` trigger never fired on boot (cause undetermined).

**Decision:** Switch to NSSM running Node.js directly as two Windows services, bypassing PM2 entirely for boot persistence. PM2 remains optional for manual admin use.

### Lessons Learned
- `.env.production` does not work with `dotenv/config` — must be named `.env`
- Frontend script must use `node_modules/next/dist/bin/next` (not `node_modules/.bin/next` which is a shell script)
- Do not mix SYSTEM, Administrator, and interactive session contexts for PM2

### 5.0 — Clean Up Previous Attempts
- [x] Removed scheduled task: `schtasks /delete /TN "PM2 ERP Startup" /F`
- [x] Killed orphaned Node processes
- [x] Killed PM2 daemon

### 5.1 — Install Backend Service (NSSM)
- [x] `nssm install erp-backend` with all parameters (AppParameters, AppDirectory, AppEnvironmentExtra, stdout/stderr, rotation, auto-start)
- [x] Recovery options set in services.msc (restart on all 3 failures, reset after 1 day)

### 5.2 — Install Frontend Service (NSSM)
- [x] `nssm install erp-frontend` with all parameters
- [x] Recovery options set in services.msc (restart on all 3 failures, reset after 1 day)

### 5.3 — Start Services
- [x] `net start erp-backend` — success
- [x] `net start erp-frontend` — success
- [x] Backend health check: `{"status":"healthy","database":{"connected":true}}`
- [x] Frontend responds: serving "Manufacturing ERP" HTML

### 5.4 — GO/NO-GO GATE

| # | Test | Result | Notes |
|---|------|--------|-------|
| 1 | Crash recovery (taskkill backend PID) | [x] PASS | NSSM auto-restarted, health check OK within 10s |
| 2 | Full reboot (sc query both services) | [x] PASS | Both services RUNNING after reboot, health check OK |
| 3 | Service stop recovery (services.msc) | N/A | Manual stop doesn't trigger recovery (expected Windows behavior — recovery only fires on unexpected exits) |
| 4 | Headless boot (browser from dev machine) | [x] PASS | Rebooted server, did NOT log in via RDP, waited 5 min — `http://erp.atacanada.ca` loaded and login worked |

**Phase 5 completed**: April 1, 2026 — All tests passed.

---

## Phase 6: IIS Reverse Proxy

### 6.1 — Enable Proxy
- [x] IIS Manager → ARR → Enable proxy → Apply (timeout 120s, X-Forwarded-For configured)

### 6.2 — Create Site
- [x] Site "ERP" created on port 80 (physical path `C:\apps\erp\current\frontend`)
- [x] Default Web Site stopped

### 6.3 — Rewrite Rules
- [x] `web.config` copied to `C:\apps\erp\current\frontend\web.config`
- [x] URL Rewrite rules visible: API Proxy and Frontend Proxy
- [x] Server variables added: `HTTP_X_FORWARDED_FOR`, `HTTP_X_FORWARDED_PROTO`, `HTTP_X_FORWARDED_HOST` (required to fix 500 error)

### 6.4 — Firewall
- [x] Port 80 already allowed inbound (pre-existing rules)

### 6.5 — Test
- [x] `http://erp.atacanada.ca` → login page loads
- [x] `http://10.12.1.47` → login page loads
- [x] Login with admin account → dashboard loads

**Phase 6 completed**: April 1, 2026

---

## Phase 7: Backup Configuration

### 7.1 — Scripts
- [ ] Created `C:\erp-backups\backup.bat`
- [ ] Created `C:\erp-backups\restore-test.bat`

### 7.2 — Cross-VM (Tier 2)
- [ ] FactoryLogix shared folder `\\FactoryLogix\erp-backups\` accessible
- [ ] Write test passed

### 7.3 — Scheduled Tasks
- [ ] Nightly backup at 2:00 AM — created
- [ ] Weekly restore test — created
- [ ] Cross-VM copy at 2:30 AM — created

### 7.4 — First Backup Test
- [ ] Ran `backup.bat` manually — success
- [ ] Ran `restore-test.bat` — success
- [ ] Backup file size: _______________

**Phase 7 completed**: _______________

---

## Post-Deployment

- [ ] Create first ADMIN user account
- [ ] Verify from multiple workstations
- [ ] Communicate ERP URL to team: `http://erp.company.local`
- [ ] Schedule first monthly off-host backup (Tier 3): _______________
- [ ] Delete VMware snapshot (do NOT leave running long-term)

**Phases 1-6 completed**: April 1, 2026

---

## Production Issues Found During Testing

### Issue 1: 401 Unauthorized on all authenticated requests (April 1, 2026)
- **Symptom**: After logging in, all API calls (create customer, create user, etc.) returned `{"message":"Authentication required","error":"Unauthorized","statusCode":401}`
- **Root cause**: Session cookie had `secure: true` in production (`secure: config.NODE_ENV === 'production'` in `main.ts`). The `secure` flag tells the browser to only send the cookie over HTTPS. Since the deployment uses HTTP, the browser received the cookie on login but refused to send it back on subsequent requests.
- **Fix**: Changed to `secure: false` in `main.ts`, rebuilt, and copied updated `dist/main.js` to server. Restarted `erp-backend` service.
- **Follow-up**: When HTTPS is enabled (Post-Launch Hardening item #1), change `secure` back to `true`.
**Phase 7 (Backup Configuration)**: Deferred — to be completed before go-live

---

## REV-002 Deployment — April 7, 2026

- **Changes**: PO numbering sequence (8833045+), MRP shortage Excel export fix
- **Migration**: None
- **Backup**: `C:\erp-backups\pre-rev002.dump` (329 KB)
- **Issues during deploy**:
  - "Access is denied" on `rename current previous` — services were still running. Fix: stop services before renaming.
  - `releases\` folder was empty — deploy script copies to `C:\erp-deploy\`, not `C:\apps\erp\releases\`. Fix: robocopy from staging to app directory.
  - `rename` placed folder inside `releases\` — Fix: use `move` instead of `rename`.
- **Result**: Deployed successfully. PO numbering and shortage exports verified.
- **Lessons**: All incorporated into UPGRADE_PROCEDURE.md.

---

## REV-003 Deployment — April 9, 2026

- **Changes**: Simplified receiving module (quick-receive with 3 modes: PO, Customer Supplied, Stock)
- **Migration**: None
- **Backup**: `C:\erp-backups\pre-rev003.dump`
- **Issues during deploy**:
  - Deploy script robocopy interrupted during frontend `.next` copy (network timeout after ~2.5 hours on node_modules). Re-ran script — robocopy resumed and skipped already-copied files.
  - Frontend failed to start: `ENOENT .next/static` — the `.next/static` directory was missing from the interrupted copy. Copied separately from dev machine via `\\10.12.1.47\erp-deploy\static-temp`.
  - Frontend failed again: `ENOENT .next/server/pages-manifest.json` — `.next/server` also incomplete. Copied full `.next` folder from dev machine (`next-full` staging folder).
  - After full `.next` was in place, frontend started successfully.
- **Result**: Deployed successfully. Quick receive tested in all 3 modes.
- **Lessons**: 
  - Network robocopy of `node_modules` (~538 MB) is extremely slow (~1.5 MB/min). Future deploys should use junction links for unchanged node_modules.
  - The `.next` folder must be fully intact — partial copies cause runtime crashes. Always verify `static\` and `server\` directories exist after copy.
  - Moving directly from `C:\erp-deploy\releases\` to `C:\apps\erp\current` (skipping the staging→app robocopy) saves significant time.
**VMware snapshot**: Remember to delete `Pre-ERP-Deploy-2026-03-30` within 72 hours of confirming stability

---

## REV-006 Deployment — June 5, 2026

- **Changes**: BIN stock locations on inventory_lots (inline-editable + import wizard mapping), per-PO Excel + per-consumable-PO Excel/PDF exports, VirtualGrid migration across all major tables (AML / Customers / Suppliers / Materials / Products / Product BOM / Orders / Production WIP / Consumable Orders / Purchase Orders / PO History), VirtualGrid sticky-header + single-scrollbar fix, manual PO# entry with duplicate validation, PO delete from any status, "Generate PDF by PO#" lookup, body-parser limit raised to 50 MB for inventory imports, `material.customer` joined on PO list query, Import Inventory button restored. See `CHANGELOG.md` REV-006 for the full table.
- **Migration**: Yes — 2 migrations applied.
  - `AddCustomerIdToProducts1768400000000` — already in prod's `migrations` table from an earlier manual application; TypeORM skipped it as expected.
  - `AddBinToInventoryLots1768900000000` — ran; added `inventory_lots.bin varchar(50) NULL` + `IDX_inventory_lots_bin`.
- **Backup**: `C:\erp-backups\pre-rev006.dump`
- **Issues during deploy**:
  - **Migration failed with `Cannot find module 'dotenv/config'`** when run from `C:\erp-deploy\releases\2026-06-05_001\backend\`. Cause: `deploy.bat`'s smart-skip optimization did not copy backend `node_modules` (lockfile unchanged), so the staging release had no module tree for `data-source.js` to resolve `dotenv` against. The documented step 3 in `UPGRADE_PROCEDURE.md` assumes `node_modules` is in the release folder and doesn't cover the smart-skip case. **Workaround**: created a temp junction `mklink /J <staging>\backend\node_modules C:\apps\erp\current\backend\node_modules`, re-ran migration successfully, then `rmdir` the junction before the switch.
  - **`switch-release.bat` step `[2/6] Rotating releases...` printed `Access is denied.`** but the script continued. Step `[3/6]` succeeded with `1 dir(s) moved.` and step `[4/6]` reported the node_modules junctions "already existed" so they were skipped. After completion, `C:\apps\erp\previous\` did not exist — REV-005's deploy had been consumed by the failed rotate. The junction `current\backend\node_modules → previous\backend\node_modules` pointed to nothing, so the backend service crashed with `Cannot find module 'dotenv/config'`. Frontend was unaffected. **Recovery**: `rmdir` the broken junction, then `npm ci --omit=dev` in `C:\apps\erp\current\backend\` (registry.npmjs.org reachable from the server; installed 286 packages in ~4 min from the committed `package-lock.json`). Backend started cleanly and stayed up.
  - Root cause of the "Access is denied" not identified — likely a file lock held briefly after `net stop`. The deeper problem is that `switch-release.bat` does not check ERRORLEVEL between rotate commands and proceeds even when the rotate fails silently.
- **Result**: REV-006 live on production. Backend healthy, frontend healthy, migration applied. **Rollback safety degraded**: there is no `previous\` directory, so the standard `rename current broken & rename previous current` rollback is not available — if REV-006 turns out broken, recovery requires either restoring `pre-rev006.dump` or rebuilding REV-005 from git tag `3380f06` and redeploying (~15 min).
- **Lessons** (added to memory as `deployment_known_issues.md`):
  - `deploy.bat`'s smart-skip + `UPGRADE_PROCEDURE.md`'s migrate-before-switch step are incompatible without a temp junction. Until the scripts are reconciled, perform the junction dance for any side that was SKIPPED.
  - `switch-release.bat` step 2 must be watched for "Access is denied". If it appears, do NOT let the script proceed — Ctrl-C and investigate the file lock. Until the script is patched to `exit /b 1` on rotate failure, treat the rotate as a "verify after" operation.
  - Take a manual `robocopy C:\apps\erp\current C:\apps\erp\manual-snapshot-<REV>` before every deploy as a safety net against destructive rotates.
  - `npm ci --omit=dev` in `current\backend\` is a reliable recovery for MODULE_NOT_FOUND crashes when registry.npmjs.org is reachable.

---

## REV-007 Deployment — June 25, 2026

- **Changes**: Lot-based inventory on-hand (on-hand is now summed from ACTIVE `inventory_lots`, not the transaction ledger, which had drifted via return-to-stock double counts — fixes 532 drifted materials and makes on-hand match the physical reels); kitting shortage computed live (required vs. verified), kitting items table → VirtualGrid, kitting Resume workflow (Complete with shortages parks the kit in new `AWAITING_MATERIALS` status; **Resume Kitting** returns it to IN_PROGRESS to scan in received material); removed "Set stock level" (endpoint + service + UI) now that on-hand is lot-derived; production auto-consume toggle on SMT→TH / TH→shipping moves; "Return to client" on return-to-stock (fully removes the reel via new `RETURNED_TO_CLIENT` lot status + generates a client return PDF); physical-count feature; cycle-count removed. Deploy scripts hardened (see Issues).
- **Migration**: Yes — 4 migrations (prod was on `AddBinToInventoryLots1768900000000`):
  - `CreatePhysicalCountTables1769000000000`
  - `DropCycleCountTables1769000000001` — **IRREVERSIBLE** (drops `cycle_counts`/`cycle_count_items`; `DROP ... IF EXISTS`, idempotent)
  - `AddAwaitingMaterialsKittingStatus1769100000000` (enum add)
  - `AddReturnedToClientLotStatus1769100000001` (enum add)
- **Backup**: `C:\erp-backups\pre-REV-007.dump` (1.48 MB) + `manual-snapshot-rev006`.
- **Issues during deploy**:
  - **Orphaned `node.exe` after `net stop` → "Access is denied" on `rename current previous`** (REV-006 redux). Both services reported `STOPPED`, but two `node.exe` (the NSSM-managed children) survived and held `current\`. **Recovery**: `taskkill /F /IM node.exe`, then the rename succeeded. **Nothing was destroyed this time** — the rename failed *before* mutating anything, so `previous\` was not consumed. Root-fix: `switch-release.bat` patched to poll `sc query` until both services report STOPPED before the rotate, and to `exit /b 1` on any rotate `rename` failure (restoring state + restarting services).
  - **Migration failed with `permission denied for schema public`** (PG16, code 42501) when run via the staged release with `DATABASE_URL` falling back to `.env`'s **app user** — a non-owner can't `CREATE` in `public` on PG15+. The transaction **rolled back cleanly** (nothing applied). **Fix**: re-ran with `set DATABASE_URL=postgres://postgres:...@localhost:5432/erp_production` inline (dotenv won't override an already-set var) → all 4 migrations applied + committed. The documented procedure always ran migrations as the `postgres` superuser inline; a simplified "run from current\backend" shortcut dropped that and hit this.
  - **Migration step was initially skipped** in the manual switch (went straight from env-copy to `net start`). Caught by running `migration:run` afterward; it's idempotent so re-running was safe, and the 4 then applied. Did a clean `net stop & net start erp-backend` after.
- **Result**: REV-007 live. `current\` = REV-007, `previous\` = REV-006 (rollback capability **restored** — the patched switch avoided the REV-006 destructive rotate). All 4 migrations applied. Verified: inventory on-hand now lot-based, kitting / production auto-consume / return-to-client all working.
  - **Apparent "Resume kitting doesn't work"**: not a bug. `KIT-20260519-001` was already `COMPLETED` (under old code, before the new parking logic was live). Parking happens *at completion time* and never reclassifies an already-completed kit. Forward completions of short kits park correctly. The specific kit was reclassified to `AWAITING_MATERIALS` (status + `completed_at=NULL`) via SQL to bring it into the resume workflow.
- **Lessons** (memory `deployment_known_issues.md` updated):
  - **Run migrations as the `postgres` superuser with `DATABASE_URL` set inline**, never the app user — PG15+ revoked `CREATE` on `public` from non-owners, so app-user migrations fail with 42501. A failed migration transaction rolls back cleanly (no partial state).
  - **`net stop` can leave orphaned `node.exe`** that holds `current\`; `taskkill /F /IM node.exe` before the rotate. The patched `switch-release.bat` now waits for STOPPED first.
  - **`switch-release.bat` now aborts on rotate failure** (no more silent `previous\` destruction) — Issues 1 & 2 from REV-006 are addressed in the script itself.
  - **Don't skip the migration step** in the manual switch — run it before `net start`. `migration:run` is idempotent, so re-running to verify is safe.

---

## REV-008 Deployment — June 26, 2026

- **Changes**: Pause/Resume for Physical Count (count can be paused mid-session and resumed; new `PAUSED` status, IN_PROGRESS↔PAUSED, Pause button on the scan page, Resume on the detail page; existing in-progress counts are pausable immediately — no backfill needed, unlike kitting).
- **Migration**: Yes — 1 migration (`AddPausedPhysicalCountStatus1769200000000`, enum add, ran as `postgres`).
- **Backup**: `C:\erp-backups\pre-REV-008.dump` + `manual-snapshot-rev007`.
- **Issues during deploy**:
  - **node_modules junction self-references on a 2nd consecutive smart-skip deploy.** REV-007's `node_modules` were junctions → REV-006; this rotation deletes REV-006, so junctioning REV-008 → "previous" (REV-007) would chain to a deleted/self-referential target → backend can't load modules. **Fix**: instead of junctioning, **materialized real `node_modules` with `npm ci`/`npm install` on the server** (backend `npm ci --omit=dev` ~4 min; frontend below). REV-008 is now self-contained → next deploy can junction to it for one cycle. Lesson: junctions only survive ONE rotation past a release with real `node_modules`.
  - **Frontend `npm ci` failed: `package.json` and `package-lock.json` out of sync** (`@emnapi/*` optional-dep drift, EUSAGE). `npm ci` is strict and refused. **Fix**: `npm install --omit=dev` (lenient; reconciles the lock) — ~7 min, installed 537 packages. Frontend ran fine. **Follow-up**: the repo's `frontend/package-lock.json` needs regenerating so `npm ci` works; until then, frontend deploys should use `npm install`, not `npm ci`.
  - The `taskkill /F /IM node.exe` after `net stop` cleared two orphaned node processes again (REV-007 pattern) — rotate then succeeded with no lock.
- **Result**: REV-008 live. `current\` = REV-008 (real `node_modules`, self-contained), `previous\` = REV-007 (its `node_modules` junctions are now broken → rollback to REV-007 needs `npm ci` first; `pre-REV-008.dump` is the DB safety net). Migration applied. Backend + frontend healthy.
- **Lessons** (memory `deployment_known_issues.md` updated):
  - **node_modules junctions survive only one rotation.** After two consecutive smart-skip deploys, junctions self-reference. Materialize with `npm ci` (backend) / `npm install` (frontend) on the server, or force `deploy.bat --full` (slow network copy). A release with real `node_modules` resets the chain.
  - **Frontend `npm ci` is currently broken** (lock out of sync) — use `npm install --omit=dev` until the lock is regenerated in the repo.

---

## REV-009 Deployment — July 1, 2026

- **Changes**: Kitting Print Pick Sheet (and Shortage Report) sorted by IPN; shortages moved from a top card into a "Shortages" tab; delete a kitting job (`DELETE /kitting/:id/permanent`, hard delete with FK cascade + WIP→STOCK reset, distinct from Cancel); one-kitting-per-order guard in create(); assign-customer multi-select now follows the grid's sort order (new `VirtualGrid.onVisibleRowsChange`).
- **Migration**: None.
- **Backup**: `pre-REV-009.dump` + `manual-snapshot-rev008`.
- **node_modules**: **Junctioned** (fast) — safe this time because REV-008 (→ `previous`) had **real** node_modules from being materialized last deploy. Junction to a real release is good for exactly one rotation.
- **Result**: Clean deploy, no issues. `taskkill` cleared the two orphaned node procs, rotate/junction/start all succeeded first try, health green. `current\` = REV-009 (backend/frontend node_modules junctioned → REV-008), `previous\` = REV-008 (real node_modules — solid rollback target).
- **Lesson**: **REV-010 MUST materialize** (`npm ci`/`npm install`), not junction — REV-009's node_modules are junctions, so a second consecutive junction hop would self-reference. Rule of thumb: junction only when `previous` has real node_modules (i.e. the deploy right after a materialized one); otherwise materialize.
