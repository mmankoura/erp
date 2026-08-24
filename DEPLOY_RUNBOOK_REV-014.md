# Deploy runbook — REV-014 (carries REV-010 → REV-014)

**Supersedes `DEPLOY_RUNBOOK_REV-013.md`** for this deploy. Production is on **REV-009 (July 1, 2026)**.
Target: `erp.atacanada.ca` / SRV-AT&A (10.12.1.47).

## Build facts (dev-side — already done, 2026-08-20)

| | |
|---|---|
| Pinned commit | `40d228334f3016e845fe21fabd939fc5f6290622` (`40d2283`), tree clean |
| Built from | `C:\Users\mark.mankoura\Documents\projects\erp` (main worktree, `feat/bom-wizard`) |
| Frontend BUILD_ID | `IYzC5JiDU00xEgyyKe3LB` |
| Backend | `tsc --noEmit` clean, **273/273** tests |
| Frontend | `tsc --noEmit` = 12 known pre-existing `export-utils.test.ts` errors only, **319/319** tests |
| `npm ci --dry-run` | passes both sides — no EUSAGE |
| Release folder | `C:\erp-deploy\releases\2026-08-20_001` |
| Staged | backend `dist` 758/758 files, frontend `.next` 5241/5241, `public` 6/6, both `package.json` + locks |

## Differences from the REV-013 runbook — read these first

1. **FOUR migrations pending, not three.** `CreateManualStockEntries` is added. Additive only
   (one table, three indexes, no FKs, no ALTER), so the rollback story is unchanged.
2. **The frontend needs `npm ci` too.** REV-013's runbook said both locks were unchanged. The
   frontend lock actually changed on Jul 1 (commit `1c8ffaf`, the Issue-5 reconcile) and the
   server's `current-locks` snapshot was stale.
3. **The release contains a PARTIAL frontend `node_modules`** (~679 MB) from an aborted copy.
   **Do not use it.** `npm ci` in §4 deletes and replaces it — that is the fix, no manual cleanup.
4. **Use `switch-release-rev007.bat`, NOT `switch-release.bat`.** The copy on the server
   (`C:\erp-deploy\switch-release.bat`, Apr 9, 4,895 bytes) is the **unpatched** version — no wait
   for STOPPED, no ERRORLEVEL check between rotate renames. That is the script that destroyed
   REV-005's `previous\` in REV-006. The REV-007 patch never reached the server. The patched
   version is now staged as `C:\erp-deploy\switch-release-rev007.bat` (6,223 bytes).
5. **`current-locks` was deliberately NOT updated.** It is a §9 step now, after a successful
   switch — an aborted deploy must not leave snapshots claiming these locks shipped.

---

## §2 — Pre-flight against production (RDP, cmd as Administrator)

**2.1 Dump the database. Rollback of last resort; do not skip.**
```
"C:\Program Files\PostgreSQL\16\bin\pg_dump" -U postgres -d erp_production -F c -f "C:\erp-backups\pre-rev014.dump"
dir C:\erp-backups\pre-rev014.dump
```
Confirm non-trivial size before continuing.

**2.2 Check for case-duplicate users — BEFORE anything moves.**
```
"C:\Program Files\PostgreSQL\16\bin\psql" -U postgres -d erp_production -c "SELECT lower(username), count(*) FROM users GROUP BY 1 HAVING count(*) > 1;"
"C:\Program Files\PostgreSQL\16\bin\psql" -U postgres -d erp_production -c "SELECT lower(email), count(*) FROM users GROUP BY 1 HAVING count(*) > 1;"
```
Both must return zero rows. If either returns anything, **STOP** — `AddCaseInsensitiveUserUniqueness`
cannot build its index and will abort. Merge/rename the duplicates first.
(The username index is NOT partial, so it has no escape hatch. The email index has
`WHERE "email" IS NOT NULL`, so NULL emails are excluded — empty strings would not be.)

**2.3 Confirm what production has actually applied.**
```
"C:\Program Files\PostgreSQL\16\bin\psql" -U postgres -d erp_production -c "SELECT name FROM migrations ORDER BY timestamp DESC LIMIT 5;"
```
Newest must be `AddPausedPhysicalCountStatus1769200000000`. If newer, **STOP** and reconcile —
someone deployed outside this process.

**2.4 Snapshot the current release so rollback doesn't depend on the rotate.**
```
robocopy C:\apps\erp\current C:\apps\erp\manual-snapshot-REV014 /E /COPY:DAT
```

---

## §4 — Materialize node_modules in the staging release (before the switch)

Needs internet to registry.npmjs.org. `npm ci` removes the partial tree itself.
```
cd /d C:\erp-deploy\releases\2026-08-20_001\backend
npm ci --omit=dev

cd /d C:\erp-deploy\releases\2026-08-20_001\frontend
npm ci --omit=dev
```
~4 min backend, ~7 min frontend. Confirm both are REAL folders, not `<JUNCTION>`:
```
dir C:\erp-deploy\releases\2026-08-20_001\backend
dir C:\erp-deploy\releases\2026-08-20_001\frontend
```

---

## §5 — Run the migrations (still before the switch)

Must run as the **postgres superuser** — PG15+ revoked CREATE on schema public from non-owners.
dotenv will not override an already-set variable.
```
cd /d C:\erp-deploy\releases\2026-08-20_001\backend
set DATABASE_URL=postgres://postgres:PASSWORD@localhost:5432/erp_production
npx typeorm migration:run -d dist/database/data-source.js
set DATABASE_URL=
```
All FOUR should apply in order:
`AddRecountQtyToDiscrepancies`, `AddCaseInsensitiveUserUniqueness`,
`CreateBomWizardRecipes`, `CreateManualStockEntries`.

Confirm:
```
"C:\Program Files\PostgreSQL\16\bin\psql" -U postgres -d erp_production -c "SELECT name FROM migrations ORDER BY timestamp DESC LIMIT 4;"
"C:\Program Files\PostgreSQL\16\bin\psql" -U postgres -d erp_production -c "SELECT to_regclass('public.bom_wizard_recipes'), to_regclass('public.manual_stock_entries');"
```
Both `to_regclass` must be non-null. If a migration aborts, the transaction rolls back cleanly —
nothing applied, production untouched, stop without needing a rollback.

---

## §6 — Switch

```
cd /d C:\apps\erp
C:\erp-deploy\switch-release-rev007.bat 2026-08-20_001
```
**No `--link-nm`.** Step [4/6] should print *"Node_modules included in release, no junction needed."*

Watch step **[2/6] Rotating releases**. The patched script waits for both services to report
STOPPED and aborts with state restored on a failed rename. If it reports a rename failure, the
usual cause is orphaned `node.exe` holding `current\` (services already stopped, so this is safe):
```
taskkill /F /IM node.exe
```
then re-run the switch.

---

## §7 — Verify

```
sc query erp-backend
sc query erp-frontend
curl http://127.0.0.1:3002/api/health
```
Both RUNNING. Then check `C:\apps\erp\logs\` for `MODULE_NOT_FOUND` — that is the signature of the
junction problem and means §4 did not take.

Smoke test at `http://erp.atacanada.ca`:
- Log in
- Inventory loads; grids are 26px rows with a filter row
- Export a grid to Excel and open the file
- Products → a product → BOM tab → **Import BOM opens the wizard**
- `/bom/wizard` loads and accepts a file
- `/manual-stock` loads and a row can be keyed and saved

Then work the CHANGELOG verification checklists for **REV-010, REV-011, REV-012, REV-013** — four
revisions land at once, so all four lists apply.

---

## §8 — Rollback

**Application only.** All four migrations are additive (new column, new indexes, two new tables),
so REV-009 code runs against the migrated schema.
```
cd /d C:\apps\erp
net stop erp-frontend & net stop erp-backend
rename current rev014-broken
rename previous current
net start erp-backend & net start erp-frontend
```
If `previous\` is unusable, restore from `C:\apps\erp\manual-snapshot-REV014` (§2.4).

**Database**, only if a migration left the schema wrong:
```
"C:\Program Files\PostgreSQL\16\bin\pg_restore" -U postgres -d erp_production -c C:\erp-backups\pre-rev014.dump
```

---

## §9 — After a SUCCESSFUL switch only

**9.1 Update the lock snapshots** (deliberately deferred — do not run if the deploy was aborted):
```
copy /Y C:\apps\erp\current\backend\package-lock.json C:\erp-deploy\current-locks\backend-package-lock.json
copy /Y C:\apps\erp\current\frontend\package-lock.json C:\erp-deploy\current-locks\frontend-package-lock.json
```

**9.2 Replace the unpatched switch script** so the next deploy cannot pick it up by habit:
```
copy /Y C:\erp-deploy\switch-release.bat C:\erp-deploy\switch-release-apr09.bak
copy /Y C:\erp-deploy\switch-release-rev007.bat C:\erp-deploy\switch-release.bat
```

**9.3 Records:** fill in REV-014 in `DEPLOYMENT_LOG.md` (commit `40d2283`, release
`2026-08-20_001`, timings); tick **Backup taken** in the REV-010/011/012/013 changelog headers.

**9.4** Note in `deployment_known_issues.md` that this release **materialized** node_modules, so
the next deploy may junction to it for one cycle.

**Still outstanding, deliberately deferred:** Phase 7 — nightly `pg_dump`, cross-VM copy, restore
test. Backups for this deploy are the manual dump in §2.1 only.
