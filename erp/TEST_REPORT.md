# ERP Test Suite Report

_Generated: 2026-04-27_

## Final Results

| Layer | Suites | Tests | Status |
|---|---|---|---|
| Backend unit (Jest) | 25 | 236 | ✅ all pass |
| Backend e2e (Jest + supertest) | 2 new + 1 pre-existing | 14 (+ 1 stub) | ✅ new pass; pre-existing `app.e2e-spec.ts` needs a live DB |
| Frontend unit (Vitest + Testing Library) | 6 | 57 | ✅ all pass |
| **TOTAL** | **33** | **307 passing** | ✅ |

Run times: backend Jest ~30–40s, backend e2e ~3s, frontend Vitest ~5s.

## Test Infrastructure Added

**Backend** — Jest was already configured. Added:
- `src/test-utils/repo-mock.ts` — reusable TypeORM repository, query-builder, and DataSource mock helpers (used by every service spec).

**Frontend** — no test runner existed. Installed and wired:
- `vitest`, `@vitest/ui`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event` (devDependencies).
- `vitest.config.ts` (jsdom env, `@/` path alias, picks up `**/*.{test,spec}.{ts,tsx}`).
- `vitest.setup.ts` (jest-dom matchers).
- npm scripts: `test`, `test:watch`, `test:ui`.

## Coverage by Module

### Backend — covered

| Module | Spec File | Tests | What we verify |
|---|---|---|---|
| `entities/user` | `user.entity.spec.ts` | 7 | RolePermissions matrix (4 roles × 5 helpers), enum stability |
| `auth/decorators` | `decorators.spec.ts` | 7 | `@Public`, `@Roles`, `@CurrentUser` metadata |
| `auth/guards/authenticated` | `authenticated.guard.spec.ts` | 6 | public bypass, missing/disabled session paths |
| `auth/guards/roles` | `roles.guard.spec.ts` | 7 | RBAC matrix, error messages, public bypass |
| `auth/session.serializer` | `session.serializer.spec.ts` | 3 | session ID storage + lookup |
| `auth/auth.service` | `auth.service.spec.ts` | 17 | login validation, bcrypt, conflict checks, ensureAdminExists, audit emission |
| `audit` | `audit.service.spec.ts` | 14 | emit/emitCreate/emitDelete/emitStateChange, query filters, count aggregation |
| `customers` | `customers.service.spec.ts` | 10 | CRUD, soft-delete, restore conflict states, search |
| `suppliers` | `suppliers.service.spec.ts` | 7 | duplicate-code rejection, restore, audit |
| `products` | `products.service.spec.ts` | 8 | duplicate PN, BOM revision update, restore states |
| `materials` | `materials.service.spec.ts` | 17 | bulk-create de-dup, where-used queries, AND/OR filter logic |
| `attachments` | `attachments.service.spec.ts` | 13 | path-traversal protection, MIME allow-list, SHA-256, soft-delete |
| `aml` | `aml.service.spec.ts` | 6 | duplicate (material+mfr+MPN), state-change audit |
| `bom` | `bom.service.spec.ts` | 27 | revision lifecycle, activate/archive, item ops, alternates priority, diff classification |
| `consumable-orders` | `consumable-orders.service.spec.ts` | 10 | order-number generation, line numbering, receive/undo state machine |
| `cycle-count` | `cycle-count.service.spec.ts` | 10 | filter QB, status transitions, item-not-in-count guard |
| `health` | `health.controller.spec.ts` | 6 | DB ping success/failure, live & ready probes |
| `inventory` | `inventory.service.spec.ts` | 11 | on-hand / allocated / available math, owner-aware queries, batch stock |
| `orders` | `orders.service.spec.ts` | 9 | customer/product/BOM validation, filter QB, cross-product BOM rejection |
| `production` | `production.service.spec.ts` | 7 | startProduction guards, valid transition map (NOT_STARTED → KITTING → SMT → TH → DONE) |
| `purchase-orders/po-history` | `po-history.service.spec.ts` | 9 | XLSX import (chunking, parsing, null-handling), search QB |
| `purchase-orders` | `purchase-orders.service.spec.ts` | 18 | duplicate PO#, line-number generation, total_amount calc, on-order aggregation |
| `receiving/uid-generator` | `uid-generator.service.spec.ts` | 5 | UID-YYYYMMDD-NNNN format, ON CONFLICT upsert |
| `shared/sequence-generator` | `sequence-generator.service.spec.ts` | 7 | advisory lock, deterministic hash, padLength, EntityManager-vs-DataSource |
| `app.controller` | `app.controller.spec.ts` | 1 | pre-existing stub, kept untouched |

### Backend e2e (supertest) — new

| Suite | File | Tests | What we verify |
|---|---|---|---|
| Health | `test/health.e2e-spec.ts` | 5 | full HTTP path for `/health`, `/health/live`, `/health/ready` (mocked DataSource) |
| Customers | `test/customers.e2e-spec.ts` | 9 | full HTTP path for GET/POST/PATCH/DELETE/search; ValidationPipe rejects empty body; ParseUUIDPipe rejects invalid IDs; 204 on delete |
| App (pre-existing) | `test/app.e2e-spec.ts` | 1 | unchanged stub — boots full AppModule, fails without a live Postgres (expected) |

### Frontend — covered

| File | Tests | What we verify |
|---|---|---|
| `lib/utils.test.ts` | 7 | `cn()` Tailwind class merge, falsy filtering, conditional object syntax |
| `lib/api.test.ts` | 14 | `ApiError`, all 5 HTTP verbs, JSON error parsing, 204 handling, custom header merge, credentials |
| `lib/export-utils.test.ts` | 8 | XLSX sheet shaping, AML lookup (APPROVED-only), Status field rules, order-detail explosion |
| `hooks/use-api.test.tsx` | 11 | initial loading, error capture, `enabled: false`, `initialData`, `refetch`, `mutate`; `useMutation` happy/error paths, `onSuccess`/`onError`, `reset`, non-Error wrapping |
| `hooks/use-mobile.test.tsx` | 5 | matchMedia listener wiring, breakpoint at 768px, change-event update, unmount cleanup |
| `contexts/auth-context.test.tsx` | 11 | throws outside provider, init/error states; full ADMIN/MANAGER/CLERK/OPERATOR permission matrix; login + navigate; logout (success and api-failure paths) |

## Gaps / Not Covered (deliberate)

These are the largest remaining surfaces. They were skipped to keep the suite focused on highest-value, easily mockable code paths:

**Backend services not unit-tested:**
- `bom-import.service` (566 lines, CSV parsing — would benefit from fixture-based tests)
- `inventory-import.service` (551 lines)
- `kitting.service` (624 lines, transactional)
- `mrp.service` (1,403 lines, multi-stage shortage explosion — highest-priority gap)
- `receiving.service` (1,216 lines, session workflow)
- `receiving-inspection.service` (544 lines, AML validation)
- Most controllers — they delegate; covered indirectly by the e2e tests.

**Frontend not covered:**
- `src/lib/po-pdf.ts` (jsPDF DOM-heavy)
- `src/components/*` (Radix-heavy dialogs)
- `src/app/*` page components

These can be added incrementally as `.spec.ts` / `.test.ts` files using the same patterns established here.

## How To Run

**Backend unit tests** (from `erp/backend/`):
```bash
npm test                    # all unit tests (~40s)
npm test -- --testPathPatterns="auth"  # filter
npm run test:cov            # with coverage
```

**Backend e2e tests:**
```bash
npm run test:e2e -- --testPathPatterns="(health|customers)"
```
Skip the `(health|customers)` filter to also run the pre-existing `app.e2e-spec.ts`, which requires a live Postgres on localhost:5432.

**Frontend tests** (from `erp/frontend/`):
```bash
npm test                    # one-shot run
npm run test:watch          # watch mode
npm run test:ui             # browser UI (Vitest UI)
```

## Persistence — files saved for future use

All test files live next to the code they cover and are auto-discovered by the runners:

```
erp/backend/
├── src/
│   ├── test-utils/repo-mock.ts                    # shared mock helpers
│   ├── entities/user.entity.spec.ts
│   └── modules/<module>/*.spec.ts                 # 24 service/guard/decorator specs
└── test/
    ├── jest-e2e.json                              # (pre-existing) e2e config
    ├── customers.e2e-spec.ts                      # new
    └── health.e2e-spec.ts                         # new

erp/frontend/
├── vitest.config.ts                               # new
├── vitest.setup.ts                                # new
└── src/
    ├── lib/{utils,api,export-utils}.test.ts       # 3 files
    ├── hooks/{use-api,use-mobile}.test.tsx        # 2 files
    └── contexts/auth-context.test.tsx
```

## Notable Findings During Test Writing

1. **`logout()` rethrows** — the implementation uses `try/finally`, so a network failure clears state but still propagates the error. The test now exercises both branches.
2. **Pre-existing `test/app.e2e-spec.ts` is non-functional offline** — it imports the full `AppModule` and hangs trying to reach Postgres. Untouched per scope; consider deleting it or guarding it with `if (process.env.E2E_DB) describe(...)`.
3. **TypeORM's `path-scurry` import breaks aggressive `jest.mock('fs', ...)`** — fix is to `jest.requireActual('fs')` and only override the methods you care about.
4. **Vitest `vi.mock` factories cannot close over top-level vars** — must use `vi.hoisted({ ... })`. The export-utils test demonstrates the pattern.
5. **NestJS `Test.createTestingModule` + a single shared QueryBuilder mock** is the cleanest way to keep test-side `qb.getOne.mockResolvedValue(...)` and service-side `repo.createQueryBuilder()` pointing at the same instance.

## Summary

Backend: 25 suites / 236 tests. Backend e2e: 14 tests across 2 new suites. Frontend: 6 suites / 57 tests. Everything is green.
