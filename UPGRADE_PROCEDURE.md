# ERP Release Upgrade Procedure

> **Quick reference for deploying a new revision to production.**
> For full deployment details, see DEPLOYMENT_PLAN.md.
> For change history, see CHANGELOG.md.
>
> **Lessons learned from REV-002 deployment (April 7, 2026) are incorporated throughout.**

---

## Overview: Two-Machine Process

The upgrade involves two machines in sequence:

| Machine | What Happens |
|---------|-------------|
| **Dev machine** (your laptop/WSL2) | Build, type-check, run deploy script to copy files to server share |
| **Server** (SRV-AT&A via RDP) | Backup database, copy release from staging to app directory, switch, restart |

**Important:** The deploy script copies files to `C:\erp-deploy\releases\` (the network share staging area), NOT directly to `C:\apps\erp\releases\`. You must robocopy from the staging area to the app directory on the server.

```
Dev machine                          Server (SRV-AT&A)
───────────                          ──────────────────
deploy-revXXX.bat ──robocopy──►  C:\erp-deploy\releases\YYYY-MM-DD_NNN\  (staging)
                                          │
                                     robocopy (on server)
                                          │
                                          ▼
                                 C:\apps\erp\releases\YYYY-MM-DD_NNN\  (app directory)
                                          │
                                     rename → current
                                          │
                                          ▼
                                 C:\apps\erp\current\  (live)
```

---

## Prerequisites (Dev Machine)

Before starting, confirm on your dev machine:

- [ ] All changes committed to git
- [ ] `cd erp\backend && npx tsc --noEmit` passes
- [ ] `cd erp\frontend && npx tsc --noEmit` passes
- [ ] `cd erp\backend && npm run build` passes — verify `dist\main.js` exists
- [ ] `cd erp\frontend && npm run build` passes — verify `.next\BUILD_ID` exists
- [ ] CHANGELOG.md updated with new REV entry (description, files changed, verification steps)

---

## Step 1: Copy Release to Server (Dev Machine)

### 1a. Create a deploy script for this revision

Copy `deploy-rev002.bat` as a template. For each new release, update:
- `set REV=YYYY-MM-DD_NNN` (the release folder name)
- The header comment with the REV number and description

### 1b. Run the deploy script

Open **Windows Command Prompt** (not WSL, not PowerShell) on your dev machine:

```batch
cd C:\Users\mark.mankoura\Documents\projects\erp
deploy-revXXX.bat
```

The script copies build artifacts to `\\10.12.1.47\erp-deploy\releases\YYYY-MM-DD_NNN\`.

**Expected time:** ~5-10 minutes depending on network speed.

### 1c. Verify the copy landed

```batch
dir \\10.12.1.47\erp-deploy\releases\YYYY-MM-DD_NNN\backend\dist\main.js
dir \\10.12.1.47\erp-deploy\releases\YYYY-MM-DD_NNN\frontend\.next\BUILD_ID
```

Both files must exist. If the `releases\` folder is empty, the script did not run or the network share is inaccessible — troubleshoot before proceeding.

---

## Step 2: RDP into Server

RDP into **SRV-AT&A (10.12.1.47)**. Open **Command Prompt as Administrator** for all remaining steps.

---

## Step 3: Database Backup (On Server)

```batch
"C:\Program Files\PostgreSQL\16\bin\pg_dump" -U postgres -d erp_production -F c -f "C:\erp-backups\pre-revXXX.dump"
```

Verify:
```batch
dir C:\erp-backups\pre-revXXX.dump
```
- [ ] File exists with size > 0

> **If this release includes a migration**, run it now BEFORE switching releases:
> ```batch
> cd /d C:\erp-deploy\releases\YYYY-MM-DD_NNN\backend
> set DATABASE_URL=postgres://postgres:PASSWORD@localhost:5432/erp_production
> npx typeorm migration:run -d dist/database/data-source.js
> ```
> Then re-grant permissions:
> ```batch
> "C:\Program Files\PostgreSQL\16\bin\psql" -U postgres -d erp_production -c "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO erp_app; GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO erp_app;"
> ```
> If migration fails, STOP. Do not proceed with the switch. Fix on dev machine.

---

## Step 4: Copy Release from Staging to App Directory (On Server)

The deploy script copies files to `C:\erp-deploy\releases\` (the network share). You must now copy them into `C:\apps\erp\releases\`:

```batch
robocopy C:\erp-deploy\releases\YYYY-MM-DD_NNN C:\apps\erp\releases\YYYY-MM-DD_NNN /E /NP /NFL /NDL
```

Verify the copy:
```batch
dir C:\apps\erp\releases\YYYY-MM-DD_NNN\backend\dist\main.js
dir C:\apps\erp\releases\YYYY-MM-DD_NNN\frontend\.next\BUILD_ID
```
- [ ] Both files exist

> **Why two copies?** The `erp-deploy` share is a staging area accessible over the network. The `C:\apps\erp\` directory is the application directory where services run from. Keeping them separate means a network copy in progress won't interfere with a running release, and the staging area can be cleaned up independently.

---

## Step 5: Stop Services (On Server)

**You MUST stop services before renaming folders.** NSSM holds file locks on the `current\` directory. Attempting to rename while services are running will fail with "Access is denied."

```batch
net stop erp-frontend
net stop erp-backend
```

Verify both stopped:
```batch
sc query erp-backend | find "STOPPED"
sc query erp-frontend | find "STOPPED"
```

---

## Step 6: Switch Release (On Server)

```batch
cd /d C:\apps\erp

:: 6a. Clean up stale backup from a prior deploy
if exist previous-backup (rmdir /s /q previous-backup)

:: 6b. Rotate: current → previous (for rollback)
if exist previous (rename previous previous-backup)
rename current previous

:: 6c. Move new release into place
:: IMPORTANT: "rename" within the same parent dir only.
:: The release is at C:\apps\erp\releases\YYYY-MM-DD_NNN — use "move", not "rename"
move releases\YYYY-MM-DD_NNN current

:: 6d. Copy persistent files (these are NOT in the release)
copy shared\.env.backend current\backend\.env
copy shared\.env.frontend current\frontend\.env
copy shared\web.config current\frontend\web.config
```

**Verify env files copied:**
```batch
dir current\backend\.env
dir current\frontend\.env
dir current\frontend\web.config
```
- [ ] All three files exist and are non-empty

> **Troubleshooting "The system cannot find the file specified" on move/rename:**
> - Verify the release folder exists: `dir releases`
> - Verify the exact folder name matches (date, sequence number)
> - If `releases\` is empty, you skipped Step 4 (copy from staging)

---

## Step 7: Start Services (On Server)

```batch
net start erp-backend
net start erp-frontend
```

Wait 5 seconds, then clean up:
```batch
if exist previous-backup (rmdir /s /q previous-backup)
```

**Total downtime:** from Step 5 `net stop` to Step 7 `net start` — typically under 30 seconds.

---

## Step 8: Verify (On Server + Workstation)

### On the server:

```batch
sc query erp-backend | find "RUNNING"
sc query erp-frontend | find "RUNNING"
curl http://127.0.0.1:3002/api/health
```

| # | Check | Expected |
|---|-------|----------|
| 1 | `sc query erp-backend` | STATE: 4 RUNNING |
| 2 | `sc query erp-frontend` | STATE: 4 RUNNING |
| 3 | `curl http://127.0.0.1:3002/api/health` | `{"status":"healthy",...}` |

### From a workstation browser:

| # | Check | Expected |
|---|-------|----------|
| 4 | Open `http://erp.atacanada.ca` | Login page renders |
| 5 | Log in with your account | Dashboard loads with data |
| 6 | Rev-specific checks from CHANGELOG.md | All pass |

**If ANY check fails → immediately rollback (Step 9).**

> **If services show RUNNING but health check fails:**
> Check the error log: `type C:\apps\erp\logs\backend-error.log`
> Common causes:
> - Missing `.env` file (Step 6d was skipped)
> - Database connection error (DATABASE_URL wrong in `.env`)
> - Migration not run (new tables/columns missing)

---

## Step 9: Rollback (If Needed)

### Code-only rollback (no migration involved):

```batch
cd /d C:\apps\erp
net stop erp-frontend
net stop erp-backend
rename current broken-release
rename previous current
net start erp-backend
net start erp-frontend
```

Verify:
```batch
curl http://127.0.0.1:3002/api/health
```

**Recovery time: < 30 seconds.**

After investigation, clean up: `rmdir /s /q broken-release`

### Rollback with database restore (if migration was non-backward-compatible):

```batch
net stop erp-frontend
net stop erp-backend
"C:\Program Files\PostgreSQL\16\bin\pg_restore" -U postgres -d erp_production --clean --if-exists "C:\erp-backups\pre-revXXX.dump"
rename current broken-release
rename previous current
net start erp-backend
net start erp-frontend
```

---

## Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| `rename current previous` → **"Access is denied"** | NSSM services have files locked in `current\` | Stop services FIRST: `net stop erp-frontend && net stop erp-backend` |
| `rename releases\YYYY-MM-DD_NNN current` → **"The system cannot find the file specified"** | Release folder doesn't exist in `C:\apps\erp\releases\` | You need to robocopy from `C:\erp-deploy\releases\` to `C:\apps\erp\releases\` first (Step 4) |
| `releases\` directory is empty | Deploy script was not run from dev machine, or it copied to `C:\erp-deploy\` only | Run the deploy script from dev machine, then robocopy from staging on the server |
| `rename` moves folder inside `releases\` instead of to `C:\apps\erp\` | `rename` only works within the same directory level | Use `move releases\YYYY-MM-DD_NNN current` instead of `rename` |
| `copy shared\.env.backend current\backend\.env` → **"The system cannot find the path specified"** | `current\backend\` doesn't exist (switch step failed or was skipped) | Verify `dir current\backend\dist\main.js` exists. If not, the move/rename in Step 6c failed |
| Services start but ERP doesn't load | `.env` files not copied, or `web.config` missing | Run Step 6d. Check `dir current\backend\.env` and `dir current\frontend\web.config` |
| Health check returns error after upgrade | New code expects migration that wasn't run | Check `C:\apps\erp\logs\backend-error.log`. If migration-related, run migration or rollback |

---

## Quick Checklist (Print This)

```
REV: ____________    Date: ____________

DEV MACHINE:
[ ] Code committed to git
[ ] Backend tsc --noEmit PASS
[ ] Frontend tsc --noEmit PASS
[ ] Backend npm run build PASS (dist\main.js exists)
[ ] Frontend npm run build PASS (.next\BUILD_ID exists)
[ ] CHANGELOG.md updated with REV entry
[ ] Deploy script created and run
[ ] Verified files on server share (main.js + BUILD_ID exist)

SERVER (RDP as Administrator):
[ ] Database backup taken (C:\erp-backups\pre-revXXX.dump, size > 0)
[ ] Migration run (if applicable)
[ ] Permissions granted (if migration created new tables)
[ ] Release copied from C:\erp-deploy\releases\ to C:\apps\erp\releases\
[ ] Services stopped (erp-frontend, erp-backend)
[ ] current → previous, release → current (via move)
[ ] Env files copied (.env.backend → .env, .env.frontend → .env, web.config)
[ ] Services started (erp-backend, erp-frontend)
[ ] sc query — both RUNNING
[ ] curl health check — healthy
[ ] Frontend loads from workstation browser
[ ] Login works, dashboard shows data
[ ] Rev-specific verification checks passed (see CHANGELOG.md)
[ ] Cleanup: previous-backup removed
```

---

## Key Paths Reference

| Path | Purpose |
|------|---------|
| `C:\erp-deploy\releases\` | Staging area (network share, where deploy script copies to) |
| `C:\apps\erp\releases\` | App release directory (where server copies from staging) |
| `C:\apps\erp\current\` | Live release (services run from here) |
| `C:\apps\erp\previous\` | Rollback target (last known good) |
| `C:\apps\erp\shared\` | Persistent files: `.env.backend`, `.env.frontend`, `web.config`, `uploads\` |
| `C:\apps\erp\logs\` | NSSM service logs (backend-out.log, backend-error.log, etc.) |
| `C:\erp-backups\` | Database backups |
