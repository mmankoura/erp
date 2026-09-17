# CLAUDE.md

Manufacturing ERP for **AT&A Canada**, an electronics contract manufacturer (SMT / through-hole assembly). It is an internal intranet app, live since 2026-04-01.

- **Production:** http://erp.atacanada.ca on **SRV-AT&A (10.12.1.47)**, Windows Server 2019 VM. It is served over **plain HTTP** (see the gotchas below).
- **Repo:** `https://github.com/mmankoura/erp`. Mainline is `master`. Current work is on `feat/bom-wizard`, which was level with `master` at REV-016.
- **Latest release:** REV-016 (2026-08-31), commit `12fa3df`. Newest migration in production: `CreateManualStockEntries1769600000000`.
- The only developer is Mark Mankoura. Releases are numbered `REV-NNN`.

## Layout

```
erp/                      repo root: docs, deploy scripts, change control
├── CHANGELOG.md          release-by-release change control (REV entries, newest first)
├── DEPLOYMENT_LOG.md     what actually happened on each deploy + lessons
├── UPGRADE_PROCEDURE.md  standard release steps (dev machine → server)
├── DEV_SYNC_PROCEDURE.md copy the production DB into the local dev DB
├── ERP_SYSTEM_OVERVIEW.md orientation + historical incidents (module list is dated, as of REV-005)
├── docs/system-workflows.md  entity dependencies and setup order
├── deploy.bat / switch-release.bat / deploy/   release tooling (Windows batch)
├── MISCELLANEOUS/        sample BOM/inventory spreadsheets (real customer files in SAMPLES/test), server notes
└── erp/
    ├── docker-compose.yml   local Postgres 16 (container `erp-postgres`, user/pass/db = erp/erp/erp)
    ├── backend/             NestJS 11 + TypeORM 0.3 + PostgreSQL, session auth (Passport local)
    └── frontend/            Next.js 16 (App Router) + React 19 + Tailwind v4 + shadcn/ui
```

Untracked local files at the root (`erp_production.dump`, `on-order-*.csv`) are scratch data. Do not commit them.

## Running locally

Prerequisites: Node 22 (pinned in `.nvmrc` to match the production server; run `nvm use` in the repo root), Docker Desktop, and git. Some dev machines still run Node 25 / npm 11.6.2 — see the npm-version caveat under Releasing.

```bash
# 1. Database
cd erp && docker compose up -d            # creates erp-postgres on :5432

# 2. Backend  → http://localhost:3002/api
cd erp/backend
npm ci
cp .env.example .env                      # then set SESSION_SECRET:
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# (the app exits at startup if SESSION_SECRET is missing)
npm run migration:run
npm run start:dev

# 3. Frontend → http://localhost:3000
cd erp/frontend
npm ci
npm run dev
```

- The frontend calls a relative `/api`. `next.config.ts` rewrites that to `http://localhost:3002/api`, so **the backend must run on port 3002**. `NEXT_PUBLIC_API_URL` is not actually read by the code.
- On an empty `users` table, the backend creates **`admin` / `admin123`** (ADMIN) at startup.
- To work against real data, follow `DEV_SYNC_PROCEDURE.md`: `pg_dump` on the server, then `dropdb`/`createdb`, then `pg_restore`, then `migration:run`. **Never use `pg_restore --clean`**, because old rows survive it.
- If the backend fails with `EADDRINUSE :3002`, orphaned `node.exe` processes are holding the port. Run `npm run kill-node` (it kills **all** node.exe), or use `npm run dev`, which kills them first and then starts the server.

## Working on more than one machine

Both repos (`erp`, `QMS`) are owned by the GitHub account **`mmankoura`**. A second
account, `markmankoura`, has read-only access — authenticating as it produces
`Permission to mmankoura/erp.git denied`, which looks like a login failure but is
an authorization failure.

Remotes use **SSH**, not HTTPS. HTTPS goes through Git Credential Manager, which
cannot prompt from a non-interactive shell and crashes when invoked from WSL.

Per-machine setup:

1. Generate a key for that machine (one key per device, never copy the private key):
   `ssh-keygen -t ed25519 -C "erp-dev-<machine>" -f ~/.ssh/id_ed25519 -N ""`
2. **The corporate network blocks outbound port 22.** GitHub's alternate SSH
   endpoint on 443 works. Put this in `~/.ssh/config` (`%USERPROFILE%\.ssh\config`
   on Windows):
   ```
   Host github.com
       HostName ssh.github.com
       Port 443
       User git
       IdentityFile ~/.ssh/id_ed25519
   ```
3. Add the **public** key at https://github.com/settings/ssh/new while signed in
   as `mmankoura`.
4. Verify with `ssh -T git@github.com` — it must greet you as `mmankoura`.
5. `git config --global core.autocrlf false` **before the first commit.** The index
   holds a mix of LF and CRLF files; Git for Windows defaults `autocrlf=true` and
   would rewrite a large share of the repo into one noise commit.

Node: `.nvmrc` pins **22**, matching the production server. Dev machines have run
Node 25 / npm 11.6.2, and that mismatch is what produces the `EUSAGE Missing:
@emnapi/core` failure on the server (see the release notes). `nvm use` in the repo
root before installing.

Environment files: copy `erp/backend/.env.example` to `erp/backend/.env` and
generate a fresh `SESSION_SECRET`. The frontend needs no env file.

Git worktrees (`../erp-mrp`, `../erp-labels`, `../erp-sheet`) are **machine-local**
— they are not part of the repo and do not sync. Branches sync; worktrees do not.
On another machine just check the branch out, or recreate worktrees locally.
Before switching machines, check every worktree for unpushed work, not just the
main checkout: `git worktree list`, then `git status` in each.

## Checks: run before any commit or release

| | Backend (`erp/backend`) | Frontend (`erp/frontend`) |
|---|---|---|
| Typecheck | `npx tsc --noEmit`: must be clean | `npx tsc --noEmit`: **12 known pre-existing errors in `export-utils.test.ts`** are expected. Anything else is new. |
| Tests | `npm test` (Jest, `*.spec.ts` next to source; 282 at REV-016) | `npm test` (Vitest + jsdom, `*.test.ts(x)`; 420 at REV-016) |
| Build | `npm run build` → `dist/main.js` | `npm run build` → `.next/BUILD_ID` |

Backend unit tests mock TypeORM with `src/test-utils/repo-mock.ts`. Put pure logic in testable modules. For example, the BOM wizard engine in `frontend/src/lib/bom-wizard/` is plain TS with fixtures of real customer files.

## Backend conventions

- **One module per domain** under `src/modules/<name>/` containing `controller`, `service`, `module`, `dto/`, and `*.spec.ts`. **Register every new module in `app.module.ts`.** Entities live in `src/entities/` and are exported from `entities/index.ts`. Modules load them via `autoLoadEntities`.
- All routes sit under the global prefix `/api`. The global `ValidationPipe` uses `whitelist + forbidNonWhitelisted + transform`, so **every accepted field needs a class-validator decorator on the DTO**, or the request is rejected.
- **Auth:** `@UseGuards(AuthenticatedGuard, RolesGuard)` goes on the controller. `@Roles(UserRole.ADMIN, UserRole.MANAGER, ...)` goes on mutating routes. There are four roles: `ADMIN`, `MANAGER`, `WAREHOUSE_CLERK`, `OPERATOR`. Use `@CurrentUser()` to get the user and `@Public()` to opt out.
- **Audit:** use the `AuditService` (global) methods `emit` / `emitCreate` / `emitStateChange` / `emitDelete`. Record meaningful master-data and state changes with before and after values narrowed to the fields that changed.
- **Numbering** (PO, orders, receiving, kitting, consumables) goes through `SequenceGeneratorService` in `modules/shared`, which uses Postgres advisory locks. Do not hand-roll counters.
- **Inventory is a ledger:** `inventory_transactions` plus lots (UID-tracked) and allocations. It has two independent statuses: `LotStatus` (physical/quality) and `AllocationStatus` (workflow). Don't collapse them.
- **Migrations only** (`synchronize: false`). Files are `src/database/migrations/<timestamp>-<Name>.ts` and **the class name suffix must equal the file timestamp**, because ordering bugs have broken production before. Hand-written SQL is the norm. Use `IF NOT EXISTS` / `DO $$ ... EXCEPTION WHEN duplicate_object` guards so a restored prod dump can re-run them. Keep migrations additive where possible so rolling back the app needs no DB restore.
- TypeORM names Postgres enum types with an `_enum` suffix. Check `pg_type` before writing raw enum SQL.
- `tsconfig` sets `isolatedModules` and `emitDecoratorMetadata`, so **use `import type`** for types in decorated positions. Entities use `null` for nullable columns, and interfaces/DTOs use `undefined` for optional fields. DTOs mapping enum columns must use the enum type, not `string`.
- `src/database/data-source.ts` (CLI data source) lists only a subset of entities. That is fine for running raw-SQL migrations. **Don't rely on `migration:generate`**.
- Order workflow: `ENTERED → KITTING → SMT → TH → SHIPPED`, with `ON_HOLD` / `CANCELLED` as off-ramps. Production consumes SMT+PCB lines when SMT completes and TH+MECH lines when TH completes.

## Frontend conventions

- Every page is a client component under `src/app/<route>/page.tsx`. `layout.tsx` wraps everything in `AuthProvider` + `AuthenticatedLayout`. **When adding a page, add it to `components/app-navbar.tsx`** — the top navbar, rendered by `authenticated-layout.tsx`: a past release shipped a page with no way to reach it. `components/app-sidebar.tsx` is dead code with no importers; editing it changes nothing.
- Data access: `useApi<T>("/path")` / `useMutation` from `hooks/use-api.ts`, and `api.get/post/patch/delete` from `lib/api.ts`. `lib/api.ts` also holds **all shared API types**. Check it for an existing type before creating one. Uploads use raw `fetch` + `FormData`.
- Use UI primitives from `components/ui` (shadcn), icons from `lucide-react`, and toasts from `sonner`.
- **Grids:** use `components/virtual-grid.tsx` (TanStack Table + Virtual) with `VirtualGridColumn<T>` from `components/grid/types.ts`. Most lists run in `spreadsheet` mode, which provides cell selection, copy/paste as TSV, a fill handle, frozen columns, saved views, export, a totals row, and a filter row. Pure grid logic lives in `components/grid/*.ts` with tests. `SHEET_ROW_HEIGHT` (26px) is a **floor**: rows grow to fit their content.
- **BOM Wizard** (`/bom/wizard`, engine in `lib/bom-wizard/`, UI in `components/bom-wizard/`): the document is an immutable source matrix plus an ordered action list. The grid is always `actions.slice(0, cursor)` folded over the source. Undo, redo, deleting a step, and replaying a saved recipe all work by editing the action list, **never by mutating the grid**. Columns have stable ids (`F1..Fn`), and rows are addressed by `srcIndex`. Import can create missing materials and fill blank material master fields, but only through a reviewed table, never as a hidden side effect of Commit.
- PDF and Excel outputs are generated client-side (`lib/*-pdf.ts` with jsPDF, `lib/*-excel.ts` with xlsx).

## Production gotchas (learned the hard way)

- **Production is HTTP, not HTTPS.** Secure-context browser APIs fail there but work on localhost: `crypto.randomUUID`, `crypto.subtle`, `navigator.clipboard`, and service workers. **Use `newId()` from `lib/utils`** instead of `crypto.randomUUID`. For the same reason the session cookie is `secure: false` in `main.ts`. Flip it only once TLS exists.
- The backend CORS origin list is hard-coded to localhost:3000. Production doesn't need CORS because IIS serves both the site and `/api` from the same origin.
- Excel imports are sent as JSON, which is why the body limit is 50mb.

## Releasing (summary: read `UPGRADE_PROCEDURE.md` + the latest `DEPLOYMENT_LOG.md` entry first)

1. Dev machine: commit, run both typechecks, tests, and builds. **Add a `CHANGELOG.md` REV entry** in the existing format: header (released by, migration required, backup taken, deploy note), a Changes table (`# | Type | Module | Description`), Known behavior changes, and a Verification Steps checklist.
2. From **Windows cmd** at the repo root, run `deploy.bat REV-XXX YYYY-MM-DD_NNN`. It stages to `\\10.12.1.47\erp-deploy\releases\...` and skips `node_modules` when the lockfiles haven't changed. Its closing "next steps" text is **stale**. Ignore it and use the patched `switch-release.bat`.
3. Server (RDP, admin cmd): `pg_dump` backup → run migrations **as `postgres`** against the staged `backend` **before** switching, then re-grant to `erp_app` → stop **IIS** and the NSSM services (`erp-backend`, `erp-frontend`) → `switch-release.bat <release> [--link-nm]` → health check `curl http://127.0.0.1:3002/api/health` → run the CHANGELOG verification list.
4. **node_modules junction rule:** a release may junction (`--link-nm`) to the previous release's `node_modules` **for one cycle only**. After that it must materialize them with `npm ci --omit=dev`, because a second hop self-references and the backend loses every module. REV-016 materialized, so REV-017 may junction.
5. Server npm is 10.9.7 and dev npm is 11.6.2, which resolve the frontend lock differently (`EUSAGE Missing: @emnapi/core`). On the server, run **`npx -y npm@11.6.2 ci --omit=dev`**.
6. Afterwards, fill in `DEPLOYMENT_LOG.md` (commit, release folder, BUILD_ID, issues, lessons) and tick "Backup taken" in the changelog.

Never run `npm install`, `npm run build`, or `git pull` on the production server. Never commit credentials: real `.env` values live only in the password manager and on the server under `C:\apps\erp\shared\`.

## Open threads (as of 2026-09-17)

- **WIP branches, now pushed** (2026-09-17): `feat/mrp` (MRP run entity, demand lines, admission service) and `feat/receiving-labels` (DYMO label printing) were local-only and are now on the remote as single `wip:` commits. Both are behind `master` and need a deliberate rebase. `feat/mrp` carries two unapplied migrations (`1769700000000`, `1769700000001`). They were developed in worktrees at `../erp-mrp` and `../erp-labels`; worktrees are machine-local, so on another PC just check the branches out normally.
- `feat/spreadsheet-grid` holds the REV-013 changelog entry and `DEPLOY_RUNBOOK_REV-013.md`, which never reached `master`.
- Older docs reference `deployment_known_issues.md` (numbered deploy "Issues"). That file lived in Claude's memory on the original PC and **is not in the repo**. `DEPLOYMENT_LOG.md` covers the same issues.
- Outstanding: Phase 7 automated backups (nightly `pg_dump`, cross-VM copy, restore test; still manual only), HTTPS/TLS, rotating the `postgres` password (exposed in shell history during REV-014), a Quoting module, and a real Settings page. Ideas and backlog are in `FUTURE FEATURES.txt` and `fixed needed.md`.

## Working style

- Commit messages use conventional-commit scopes with a plain-English subject that says what the user experiences, e.g. `fix(bom-wizard): count what a designator range stands for, not the token`. Scopes match module names (`bom-wizard`, `grid`, `materials`, `deploy`, ...).
- Changelog prose explains *why* and names behavior changes users will notice. Keep that voice.
- Development used to run from WSL calling Windows `node.exe`/`docker.exe`. Old docs show `/mnt/c/...` paths and `docker.exe`. On a plain Windows setup, use the normal commands.
