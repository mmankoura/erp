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
