# Sync Dev Environment with Production Data

> **Purpose:** Replace the dev database with a fresh copy of production data.
> **When to use:** Before starting work that requires real data, or to verify production issues locally.
> **Time required:** ~5 minutes
> **Data loss:** All dev database content will be replaced. This is intentional.

---

## Step 1: Dump Production Database (On Server)

RDP into **SRV-AT&A (10.12.1.47)**, open Command Prompt:

```batch
"C:\Program Files\PostgreSQL\16\bin\pg_dump" -U postgres -d erp_production -F c -f "C:\erp-deploy\erp_production.dump"
```

Verify:
```batch
dir C:\erp-deploy\erp_production.dump
```
Note the file size — you'll need to confirm it matches on the dev machine.

---

## Step 2: Copy Dump to Dev Machine (Dev Machine — Windows CMD)

**Important:** Use Windows Command Prompt, not WSL. Delete the old file first to avoid stale cached copies.

```batch
del C:\Users\mark.mankoura\Documents\projects\erp\erp_production.dump
copy \\10.12.1.47\erp-deploy\erp_production.dump C:\Users\mark.mankoura\Documents\projects\erp\erp_production.dump
dir C:\Users\mark.mankoura\Documents\projects\erp\erp_production.dump
```

**Verify the file size matches the server.** If sizes differ, the copy failed or grabbed a cached version. Delete and re-copy.

---

## Step 3: Restore into Dev Database (Dev Machine — WSL/Terminal)

### 3a. Ensure Docker is running

```bash
docker.exe ps --filter name=erp-postgres
```

If not running: `docker.exe start erp-postgres`

### 3b. Copy dump into container

```bash
docker.exe cp "C:\Users\mark.mankoura\Documents\projects\erp\erp_production.dump" erp-postgres:/tmp/erp_production.dump
```

### 3c. Drop and recreate the database (CRITICAL)

**Do NOT use `pg_restore --clean`.** It does not reliably replace all data — rows from the old dev database can survive the restore. Always drop and recreate:

```bash
docker.exe exec erp-postgres psql -U erp -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'erp' AND pid <> pg_backend_pid();"
docker.exe exec erp-postgres dropdb -U erp erp
docker.exe exec erp-postgres createdb -U erp erp
```

> **Note:** Stop the backend dev server before this step, or the `dropdb` may fail due to active connections. Restart it after Step 4.

### 3d. Restore the dump

```bash
docker.exe exec erp-postgres pg_restore -U erp -d erp /tmp/erp_production.dump
```

Ignore errors about `role "postgres" does not exist` and `role "erp_app" does not exist` — these are harmless (production has separate roles, dev uses a single `erp` user).

### 3e. Verify

```bash
docker.exe exec erp-postgres psql -U erp -d erp -c "SELECT count(*) FROM orders;"
```

Row count should match production.

---

## Step 4: Run Pending Migrations

Production may not have the latest dev migrations (features in development). Run them:

```bash
cd /mnt/c/Users/mark.mankoura/Documents/projects/erp/erp/backend
npx ts-node -r tsconfig-paths/register ./node_modules/typeorm/cli.js migration:run -d src/database/data-source.ts
```

If a migration fails with "already exists" errors (enum or table from a previous dev restore), the migration has been updated with `IF NOT EXISTS` guards. If not, either:
- Add `IF NOT EXISTS` / `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END $$` to the migration
- Or manually insert the migration record: `docker.exe exec erp-postgres psql -U erp -d erp -c "INSERT INTO migrations (timestamp, name) VALUES (TIMESTAMP, 'MigrationName');"`

---

## Step 5: Restart Dev Servers

```bash
# Terminal 1 — backend
cd /mnt/c/Users/mark.mankoura/Documents/projects/erp/erp/backend
npm run start:dev

# Terminal 2 — frontend
cd /mnt/c/Users/mark.mankoura/Documents/projects/erp/erp/frontend
npm run dev
```

Open `http://localhost:3000` and verify data matches production.

---

## Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| **File size mismatch** between server and dev | Windows SMB caching | Delete dev file first (`del`), then re-copy |
| **Old data survives restore** | `pg_restore --clean` doesn't fully replace data | Always `dropdb` + `createdb` before restore (Step 3c) |
| **`dropdb` fails: "database is being accessed"** | Backend dev server has active connection | Stop the backend dev server, then retry |
| **Docker container not running** | Docker Desktop not started, or container stopped | `docker.exe start erp-postgres` |
| **Migration fails: "type already exists"** | Enum created in previous dev restore, not in migration table | Migration should use `DO $$ BEGIN CREATE TYPE ... EXCEPTION WHEN duplicate_object THEN NULL; END $$` |
| **Migration fails: "table already exists"** | Same as above | Migration should use `CREATE TABLE IF NOT EXISTS` |
| **Role errors during restore** | Production uses `postgres`/`erp_app` roles, dev uses `erp` | Harmless — ignore these errors |

---

## Quick Reference

```
SERVER:   pg_dump → C:\erp-deploy\erp_production.dump
DEV CMD:  del + copy from \\10.12.1.47\erp-deploy\ (verify size matches)
DEV WSL:  docker cp → dropdb → createdb → pg_restore → migration:run
```
