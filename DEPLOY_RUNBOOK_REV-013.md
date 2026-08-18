# Deploy runbook — REV-010 + REV-011 + REV-012 + REV-013

**One combined release.** Production is on **REV-009 (July 1, 2026)** and has taken none of the four revisions since. Target: `erp.atacanada.ca` / SRV-AT&A (10.12.1.47).

This is a bigger jump than the usual single-revision deploy: **three migrations**, one of which can legitimately abort, and a `node_modules` situation that will break the backend if the default path is followed. Read all of §0 before running anything.

---

## 0. What makes this deploy different

**Three migrations are pending** (last applied in production: `AddPausedPhysicalCountStatus1769200000000`):

| Migration | Note |
|---|---|
| `1769300000000-AddRecountQtyToDiscrepancies` | Routine |
| `1769400000000-AddCaseInsensitiveUserUniqueness` | **Can abort the deploy** — see §2.2 |
| `1769500000000-CreateBomWizardRecipes` | Routine |

**`node_modules` must be materialized, and the usual path will not do it.** Neither `package-lock.json` has changed since REV-009 — the backend's not since March, the frontend's not since REV-009 itself. So `deploy.bat` will compare, find them identical, and **skip both**, expecting the server to junction to `previous`. But REV-009's `node_modules` are *already* junctions to REV-008, so this would be a second consecutive hop: the junction self-references and the backend cannot load a single module (known issues, Issue 4).

The fix reorders the standard procedure: **materialize `node_modules` in the staging release, before the switch** (§4). Doing it there rather than after the move also solves Issue 1 for free — the migration step needs `node_modules` present, and this puts it there properly instead of via the temporary junction the old workaround used.

**Do not pass `--link-nm` to `switch-release.bat`.** That flag is what creates the junction. Omitting it makes step [4/6] a no-op.

**`switch-release.bat` is safe now.** It was patched in REV-007: it polls `sc query` until both services report STOPPED, and aborts with state restored on any failed rename. Issues 1 and 2 in `deployment_known_issues.md` are history; **Issues 3 and 4 are still live** and are handled in §2.2 and §4.

**Migrations must run as the `postgres` superuser.** PG15+ revoked `CREATE` on schema `public` from non-owner roles, so running as the app user fails with `permission denied for schema public` (Issue 3). Set `DATABASE_URL` inline — dotenv will not override an already-set variable.

---

## 1. Pre-flight, on the dev machine

**1.1 — Pin the commit.** Do not build from a live worktree. `deploy.bat` copies whatever build output it finds and cannot distinguish finished work from half-finished.

```
cd C:\Users\mark.mankoura\Documents\projects\erp-sheet
git status --short          :: must be empty
git log --oneline -1        :: record this hash in DEPLOYMENT_LOG.md
```

> The main worktree (`projects\erp`) has had uncommitted work in it. Build from `erp-sheet`, which carries the merged history of both branches.

**1.2 — Build.**

```
cd C:\Users\mark.mankoura\Documents\projects\erp-sheet\erp\backend
npm run build
cd ..\frontend
npm run build
```

**1.3 — Confirm the build is sound** (all three should be clean; `tsc` has 12 known pre-existing errors in `export-utils.test.ts` only):

```
cd ..\backend  & npx tsc --noEmit
cd ..\frontend & npx tsc --noEmit & npx vitest run
```

Expect **319 frontend tests passing**.

---

## 2. Pre-flight, against production

**2.1 — Take the database dump. This is the rollback of last resort; do not skip it.**

```
pg_dump -U postgres -d erp_production -F c -f C:\erp-backups\pre-rev013.dump
```

Confirm the file exists and is non-trivial in size before continuing.

**2.2 — Check for case-duplicate users. Do this before anything is moved.**

```sql
SELECT lower(username), count(*) FROM users GROUP BY 1 HAVING count(*) > 1;
SELECT lower(email),    count(*) FROM users GROUP BY 1 HAVING count(*) > 1;
```

Both must return zero rows. If either returns anything, **stop here** — `AddCaseInsensitiveUserUniqueness` cannot build its index and the migration will abort. That refusal is deliberate: the alternative is a login that silently resolves to either account. Merge or rename the duplicate accounts first, then restart. Dev's Aug 10 copy of production was clean, so this is expected to pass.

**2.3 — Confirm what production has actually applied**, rather than trusting the changelog:

```sql
SELECT name FROM migrations ORDER BY timestamp DESC LIMIT 5;
```

The newest should be `AddPausedPhysicalCountStatus1769200000000`. If it is newer, stop and reconcile — someone has deployed outside this process.

**2.4 — Snapshot the current release**, so rollback does not depend on the rotate behaving:

```
robocopy C:\apps\erp\current C:\apps\erp\manual-snapshot-REV013 /E /COPY:DAT
```

---

## 3. Copy the release to the server

From the dev machine, pointing the build source at the pinned worktree:

```
set ERP_PROJECT=C:\Users\mark.mankoura\Documents\projects\erp-sheet
cd C:\Users\mark.mankoura\Documents\projects\erp-sheet
deploy.bat REV-013 2026-08-18_001
```

Expect it to report **both `node_modules` SKIPPED** — that is correct and expected here. §4 handles it.

---

## 4. Materialize `node_modules` in the staging release — do not skip

On the server, before the switch. `deploy.bat` copies `package.json` and `package-lock.json` into the release, so `npm ci` works there. Needs internet access to registry.npmjs.org.

```
cd /d C:\erp-deploy\releases\2026-08-18_001\backend
npm ci --omit=dev

cd /d C:\erp-deploy\releases\2026-08-18_001\frontend
npm ci --omit=dev
```

Roughly 4 minutes and 7 minutes. The frontend's `npm ci` was fixed in commit `1c8ffaf`; if it ever returns `EUSAGE ... not in sync`, fall back to `npm install --omit=dev` and re-sync the lock afterwards on dev.

**Why this matters:** the release is now self-contained. That both avoids the self-referencing junction and resets the junction chain, so the *next* deploy may junction to this one for one cycle.

Confirm before continuing:

```
dir C:\erp-deploy\releases\2026-08-18_001\backend\node_modules  :: real folder, not <JUNCTION>
```

---

## 5. Run the migrations — before the switch

```
cd /d C:\erp-deploy\releases\2026-08-18_001\backend
set DATABASE_URL=postgres://postgres:PASSWORD@localhost:5432/erp_production
npx typeorm migration:run -d dist/database/data-source.js
set DATABASE_URL=
```

All three should apply in order. `migration:run` is idempotent, so re-running to verify is safe.

Confirm:

```sql
SELECT name FROM migrations ORDER BY timestamp DESC LIMIT 3;
-- expect CreateBomWizardRecipes, AddCaseInsensitiveUserUniqueness, AddRecountQtyToDiscrepancies
\d bom_wizard_recipes
```

If the case-uniqueness migration aborts here despite §2.2, the whole transaction rolls back cleanly — nothing is applied, production is untouched, and you can stop without needing a rollback.

---

## 6. Switch

```
cd /d C:\apps\erp
C:\erp-deploy\switch-release.bat 2026-08-18_001
```

**No `--link-nm`.** Step [4/6] should print *"Node_modules included in release, no junction needed."*

Watch step **[2/6] Rotating releases**. The patched script aborts and restores on failure, but if it reports a rename failure the cause is usually orphaned `node.exe` processes holding `current\` even after the services report STOPPED. Recovery, services already stopped so it is safe:

```
taskkill /F /IM node.exe
```

then re-run the switch.

---

## 7. Verify

```
sc query erp-backend
sc query erp-frontend
```

Both RUNNING. Then check the logs in `C:\apps\erp\logs\` for `MODULE_NOT_FOUND` — that is the signature of the junction problem and means §4 did not take.

Smoke test at `http://erp.atacanada.ca`:

- Log in
- Inventory loads, grids are 26px rows with a filter row
- Export a grid to Excel and open the file
- Products → a product → BOM tab → **Import BOM opens the wizard** (REV-012)
- `/bom/wizard` loads and accepts a file

Then work the verification checklists in `CHANGELOG.md` for **REV-010, REV-011, REV-012 and REV-013** — four revisions are landing at once, so all four lists apply. REV-013's is the longest.

---

## 8. Rollback

**Application only** (migrations are forward-only but all three are additive — new column, new indexes, new table — so REV-009 code runs against the migrated schema):

```
cd /d C:\apps\erp
net stop erp-frontend & net stop erp-backend
rename current rev013-broken
rename previous current
net start erp-backend & net start erp-frontend
```

If `previous\` is unusable, restore from `C:\apps\erp\manual-snapshot-REV013` (§2.4).

**Database**, only if a migration left the schema wrong:

```
pg_restore -U postgres -d erp_production -c C:\erp-backups\pre-rev013.dump
```

---

## 9. After the deploy

- Fill in the REV-013 section of `DEPLOYMENT_LOG.md` with the commit hash, release folder and timings
- Tick **Backup taken** in the REV-010/011/012/013 changelog headers
- Note in `deployment_known_issues.md` that this release **materialized** `node_modules`, so the next deploy may junction to it for one cycle

**Still outstanding, deliberately deferred:** Phase 7 of `DEPLOYMENT_LOG.md` — nightly `pg_dump`, cross-VM copy and the restore test — remains unchecked. Backups for this deploy are the manual dump in §2.1 only. The automation was flagged as required before go-live in April and has not been built.
