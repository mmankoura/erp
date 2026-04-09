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

### 1a. Run the deploy script

Open **Windows Command Prompt** (not WSL, not PowerShell) on your dev machine:

```batch
cd C:\Users\mark.mankoura\Documents\projects\erp
deploy.bat REV-XXX YYYY-MM-DD_NNN
```

The script automatically:
- Compares `package-lock.json` against the last deploy
- If **unchanged**: skips `node_modules` copy (saves ~2 hours). You'll create junction links on the server instead.
- If **changed**: does full `node_modules` robocopy (slow but necessary).
- Copies `dist/`, `.next/`, `public/`, `package.json`, `package-lock.json`
- Saves lock file snapshots for next deploy comparison

To force full copy regardless: `deploy.bat REV-XXX YYYY-MM-DD_NNN --full`

**Expected time:** ~5-10 minutes if node_modules skipped, ~2-3 hours if full copy needed.

### 1b. Verify the copy landed

```batch
dir \\10.12.1.47\erp-deploy\releases\YYYY-MM-DD_NNN\backend\dist\main.js
dir \\10.12.1.47\erp-deploy\releases\YYYY-MM-DD_NNN\frontend\.next\BUILD_ID
```

Both files must exist. If the `releases\` folder is empty, the script did not run or the network share is inaccessible — troubleshoot before proceeding.

> **Note on interrupted copies:** If the robocopy is interrupted (network drop), re-run the same `deploy.bat` command. Robocopy resumes and skips already-copied files.

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

## Step 4: Switch Release (On Server)

Use the `switch-release.bat` script on the server. It handles everything: stops services, rotates releases, creates junction links, copies env files, starts services, and verifies.

### If node_modules were SKIPPED by the deploy script (fast path):

```batch
C:\erp-deploy\switch-release.bat YYYY-MM-DD_NNN --link-nm
```

This creates junction links pointing `current\backend\node_modules` and `current\frontend\node_modules` to the previous release's copies. Takes seconds.

### If node_modules were COPIED by the deploy script (full path):

```batch
C:\erp-deploy\switch-release.bat YYYY-MM-DD_NNN
```

No junction links needed — node_modules are already in the release.

### What the script does:

1. Verifies `main.js` and `BUILD_ID` exist in the staging release
2. Stops `erp-frontend` and `erp-backend` services
3. Rotates: `current` → `previous` (for rollback)
4. Moves release from `C:\erp-deploy\releases\` directly to `C:\apps\erp\current` (instant — same drive)
5. Creates node_modules junction links if `--link-nm` flag was used
6. Copies `.env.backend`, `.env.frontend`, `web.config` from `shared\`
7. Starts services
8. Waits 5 seconds and verifies both services are RUNNING
9. Runs health check

**Total downtime:** typically under 30 seconds.

### Manual switch (if script is not available):

```batch
cd /d C:\apps\erp
net stop erp-frontend
net stop erp-backend
if exist previous-backup (rmdir /s /q previous-backup)
if exist previous (rename previous previous-backup)
rename current previous
move C:\erp-deploy\releases\YYYY-MM-DD_NNN current
:: If node_modules were skipped:
mklink /J current\backend\node_modules previous\backend\node_modules
mklink /J current\frontend\node_modules previous\frontend\node_modules
:: Copy env files:
copy shared\.env.backend current\backend\.env
copy shared\.env.frontend current\frontend\.env
copy shared\web.config current\frontend\web.config
net start erp-backend
net start erp-frontend
if exist previous-backup (rmdir /s /q previous-backup)
```

---

## Step 5: Verify (On Server + Workstation)

> If you used `switch-release.bat`, it already verified services and ran the health check. Confirm from a workstation browser below.

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

**If ANY check fails → immediately rollback (Step 6).**

> **If services show RUNNING but health check fails:**
> Check the error log: `type C:\apps\erp\logs\backend-error.log` or `type C:\apps\erp\logs\frontend-error.log`
> Common causes:
> - Missing `.env` file (env copy was skipped)
> - Database connection error (DATABASE_URL wrong in `.env`)
> - Migration not run (new tables/columns missing)
> - Incomplete `.next` folder (interrupted robocopy — see Common Issues)

---

## Step 6: Rollback (If Needed)

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
| Frontend fails with **ENOENT `.next/static`** or **`.next/server/pages-manifest.json`** | The deploy script robocopy was interrupted during the `.next` folder copy. The frontend `.next` directory is incomplete. | Copy the full `.next` from dev machine: `robocopy "...\erp\frontend\.next" "\\10.12.1.47\erp-deploy\next-full" /E /NP`, then on server: `robocopy C:\erp-deploy\next-full C:\apps\erp\current\frontend\.next /E /NP` and restart frontend |
| **Deploy script robocopy interrupted** (network drop, timeout) | Network copy of large `node_modules` or `.next` folders over SMB is slow and fragile | Re-run the deploy script — robocopy resumes and skips already-copied files. After completion, verify `main.js` and `BUILD_ID` exist on server before switching |
| **Robocopy from staging to app directory is very slow** | Copying `node_modules` (~538 MB, thousands of small files) locally still takes 10-30 min | Skip the staging→app copy. Move directly from staging: `move C:\erp-deploy\releases\YYYY-MM-DD_NNN C:\apps\erp\current` (takes seconds). Trade-off: no archive copy in releases\ |

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
[ ] deploy.bat REV-XXX YYYY-MM-DD_NNN run (or --full if package-lock changed)
[ ] Verified files on server share (main.js + BUILD_ID exist)

SERVER (RDP as Administrator):
[ ] Database backup taken (C:\erp-backups\pre-revXXX.dump, size > 0)
[ ] Migration run (if applicable)
[ ] Permissions granted (if migration created new tables)
[ ] switch-release.bat YYYY-MM-DD_NNN [--link-nm] run
[ ] sc query — both RUNNING
[ ] curl health check — healthy
[ ] Frontend loads from workstation browser
[ ] Login works, dashboard shows data
[ ] Rev-specific verification checks passed (see CHANGELOG.md)
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
