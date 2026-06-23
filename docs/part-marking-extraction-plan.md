# Part Marking Extraction — Implementation Plan

## Goal
Automatically extract and persist the **part marking** (top-mark / package marking) for every manufacturer part number in a BOM, sourced from vendor APIs with datasheet fallback.

## Summary of Decisions

| Area | Decision |
|---|---|
| Architecture | NestJS module inside existing ERP (not a standalone Python tool) |
| Data model | New columns on `materials` table; new `vendor_api_cache` table; new `part_marking_lookups` audit table |
| Trigger | Manual per-BOM, manual per-Material, **no cron** |
| Vendor APIs | Digi-Key + Mouser + Nexar (all three, priority order with logging) |
| Datasheet fallback | Regex first, Claude LLM on explicit user request only |
| Skip logic | By `resource_type` + manufacturer + description keyword heuristic |
| Conflict resolution | Priority: Digi-Key → Mouser → Nexar; first valid wins, log all |
| Marking format | Store raw as returned from source |
| Credentials | Environment variables via `ConfigService` |
| Cache / rate-limit | Postgres `vendor_api_cache` table + per-vendor token-bucket limiter |
| Bulk job | Background (BullMQ) with progress polling |
| Permissions | Admin + Manager only |
| UI surfaces | BOM revision page button, Material page button, BOM viewer column |
| Re-run | Skip if set (manual force-refresh available) |
| Manual edits | Allowed, flagged with `source='manual'` |
| Export | CSV export button on BOM revision page |
| Confidence UI | Show marking plain; hover tooltip reveals source/timestamp/raw response |
| Tests | Unit (mocked APIs) + integration (fixed test-PN set against real APIs) |

---

## 1. Data Model Changes

### 1.1 `materials` table — new columns
```sql
ALTER TABLE materials
  ADD COLUMN part_marking TEXT,
  ADD COLUMN part_marking_source VARCHAR(32),     -- 'digikey' | 'mouser' | 'nexar' | 'datasheet_regex' | 'datasheet_llm' | 'manual' | 'n_a'
  ADD COLUMN part_marking_verified_at TIMESTAMPTZ,
  ADD COLUMN part_marking_notes TEXT,              -- free-form (e.g. LLM reasoning)
  ADD COLUMN part_marking_skip_reason VARCHAR(64); -- populated when skipped by heuristic: 'resource_type:MECH', 'passive:resistor', etc.
```

### 1.2 New `vendor_api_cache` table (reusable by Phase 5 Quoting)
```sql
CREATE TABLE vendor_api_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor VARCHAR(16) NOT NULL,         -- 'digikey' | 'mouser' | 'nexar'
  endpoint VARCHAR(64) NOT NULL,       -- 'product_search' | 'product_details' | ...
  cache_key VARCHAR(255) NOT NULL,     -- normalized: "{manufacturer}|{mpn}"
  request_payload JSONB,
  response_payload JSONB NOT NULL,
  http_status INT,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ttl_seconds INT NOT NULL DEFAULT 2592000, -- 30 days default
  UNIQUE (vendor, endpoint, cache_key)
);
CREATE INDEX idx_vendor_api_cache_lookup ON vendor_api_cache(vendor, endpoint, cache_key);
CREATE INDEX idx_vendor_api_cache_fetched ON vendor_api_cache(fetched_at);
```

### 1.3 New `part_marking_lookups` table (audit log)
```sql
CREATE TABLE part_marking_lookups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  triggered_by_user_id UUID REFERENCES users(id),
  triggered_from VARCHAR(32) NOT NULL, -- 'bom_revision' | 'material_page' | 'bulk_job'
  bom_revision_id UUID REFERENCES bom_revisions(id), -- nullable
  vendor_attempts JSONB NOT NULL,      -- [{vendor, status, marking, ms}, ...]
  final_source VARCHAR(32),
  final_marking TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_pml_material ON part_marking_lookups(material_id, created_at DESC);
```

---

## 2. Module Layout

```
erp/backend/src/modules/
  part-marking/
    part-marking.module.ts
    part-marking.controller.ts          # HTTP endpoints
    part-marking.service.ts             # orchestration: skip-check → cache → vendors → persist
    extractor.service.ts                # per-source extraction logic + normalization
    datasheet-parser.service.ts         # regex + LLM fallback
    skip-heuristics.service.ts          # resource_type + keyword rules
    bulk-job.processor.ts               # BullMQ worker for BOM-level jobs
    dto/
    entities/
    tests/

  shared/vendor-api/                    # shared across part-marking + future quoting
    vendor-api.module.ts
    digikey-client.service.ts
    mouser-client.service.ts
    nexar-client.service.ts
    vendor-cache.service.ts             # Postgres-backed cache
    rate-limiter.service.ts             # per-vendor token bucket
    types.ts                            # unified Part / PriceBreak / Marking shapes
```

---

## 3. Core Flow

### 3.1 Single-material lookup
```
extractMarking(materialId, opts):
  material = load material
  if material.part_marking and not opts.force: return { skipped: 'already_set' }
  if shouldSkip(material): persist(skip_reason); return
  for vendor in [digikey, mouser, nexar]:
    try:
      cached = vendorCache.get(vendor, mpn, mfr)
      resp = cached ?? await vendor.fetch(mpn, mfr)
      vendorCache.put(vendor, resp)
      marking = extractor.extract(vendor, resp)
      if marking:
        material.part_marking = marking
        material.part_marking_source = vendor
        material.part_marking_verified_at = now()
        audit.log({ vendor_attempts, final_source })
        return
    catch e: record attempt, continue
  audit.log({ all misses })
  return { status: 'not_found' }
```

### 3.2 Skip heuristic (`skip-heuristics.service.ts`)
```
shouldSkip(material):
  if resource_type in (MECH, PCB, DNP): return { skip: true, reason: 'resource_type:' + rt }
  desc = (material.description || '').toLowerCase()
  passive_terms = ['resistor', 'capacitor', 'inductor', 'ferrite', 'fuse',
                   'connector', 'header', 'socket', 'terminal', 'jumper',
                   'crystal', 'oscillator', 'led' /* review */, ...]
  for term in passive_terms:
    if term in desc: return { skip: true, reason: 'passive:' + term }
  return { skip: false }
```
Tunable via a DB-backed allowlist later if needed.

### 3.3 Datasheet fallback (explicit user action)
- Endpoint: `POST /part-marking/materials/:id/datasheet-lookup`
- Requires `datasheet_url` on material (from vendor API responses already cached, or manual entry)
- Regex pass: download PDF, `pdf-parse` → text → regex on phrases `/(top[\s-]?mark|package[\s-]?mark|marking)[\s:]+([A-Z0-9\-\/\s]{2,40})/i`
- If regex fails and user explicitly requests LLM: call Claude Haiku with datasheet text (truncated) + structured prompt

---

## 4. HTTP API

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/part-marking/materials/:id/extract` | Admin/Manager | Lookup single material |
| POST | `/part-marking/materials/:id/datasheet-lookup` | Admin/Manager | Regex/LLM fallback |
| PATCH | `/part-marking/materials/:id` | Admin/Manager | Manual edit (sets source='manual') |
| POST | `/part-marking/materials/:id/force-refresh` | Admin/Manager | Re-run ignoring current value |
| POST | `/part-marking/bom-revisions/:id/extract` | Admin/Manager | Queue bulk job |
| GET | `/part-marking/jobs/:jobId` | Admin/Manager | Poll bulk job progress |
| GET | `/part-marking/bom-revisions/:id/export.csv` | Admin/Manager | Download CSV |
| GET | `/part-marking/materials/:id/history` | Admin/Manager | Audit log for a material |

---

## 5. Background Job (BullMQ)

- Queue: `part-marking-bulk`
- Job payload: `{ bomRevisionId, userId, forceRefresh }`
- Worker: iterates items → calls `partMarking.extract(materialId)` → emits progress events
- Progress model: `{ total, processed, hits, skipped, misses, errors }`
- Persisted to a lightweight `background_jobs` table (or reuse existing if present) for recovery
- Concurrency: 1 job at a time per vendor to respect rate limits

---

## 6. Frontend (Next.js)

### 6.1 BOM revision page
- Button: **"Extract part markings"** (Admin/Manager only)
- Progress modal subscribing to job status
- On complete: summary toast + refresh BOM items table

### 6.2 BOM viewer DataTable
- New toggleable columns: **Part Marking**, **Source**
- Hover on marking cell → popover with `{source, verified_at, raw_response_snippet}`
- Inline "Force refresh" and "Edit" icons (Admin/Manager)

### 6.3 Material detail page
- New section: **Part Marking**
  - Current marking + source badge
  - Buttons: *Fetch marking*, *Try datasheet (regex)*, *Try datasheet (LLM)*, *Edit*, *Force refresh*
  - Audit history table (last N lookups)

### 6.4 CSV export
- Button on BOM revision page: downloads `bom-{rev}-part-markings.csv`
- Columns: `IPN, MPN, Manufacturer, Description, Part Marking, Source, Verified At, Notes`

---

## 7. Vendor API Details

### 7.1 Digi-Key (`shared/vendor-api/digikey-client.service.ts`)
- API: ProductSearch v4, OAuth2 client-credentials
- Marking field: `Product.Parameters[]` where `ParameterText == 'Package Marking'` → `ValueText`
- Rate limit: 1000 req/day (free tier) → token bucket
- Env: `DIGIKEY_CLIENT_ID`, `DIGIKEY_CLIENT_SECRET`

### 7.2 Mouser (`shared/vendor-api/mouser-client.service.ts`)
- API: Search API v2 (keyword search by MPN, filter by manufacturer)
- Marking field: `ProductAttributes[]` where `AttributeName == 'Marking'`
- Rate limit: ~30/min → token bucket
- Env: `MOUSER_API_KEY`

### 7.3 Nexar/Octopart (`shared/vendor-api/nexar-client.service.ts`)
- API: GraphQL, `supSearchMpn` query
- Marking field: part specs array where `attribute.shortname == 'marking'`
- Rate limit: 1000/month (free) — use sparingly, last in priority
- Env: `NEXAR_CLIENT_ID`, `NEXAR_CLIENT_SECRET`

### 7.4 Shared extractor normalizer
Map every vendor response to:
```ts
interface NormalizedMarking {
  vendor: 'digikey' | 'mouser' | 'nexar';
  mpn: string;
  manufacturer: string;
  marking: string | null;         // raw as returned
  datasheetUrl?: string;
  rawResponse: unknown;           // for cache + audit
}
```

---

## 8. Credentials & Config

`erp/backend/.env.example` additions:
```
DIGIKEY_CLIENT_ID=
DIGIKEY_CLIENT_SECRET=
MOUSER_API_KEY=
NEXAR_CLIENT_ID=
NEXAR_CLIENT_SECRET=
ANTHROPIC_API_KEY=   # for LLM fallback
PART_MARKING_CACHE_TTL_DAYS=30
```
`ConfigService` exposes typed getters. Missing creds → vendor is skipped with warning log (not fatal).

---

## 9. Testing

### 9.1 Unit tests (Jest, mocked vendor HTTP)
- `skip-heuristics.service.spec.ts` — resource_type matrix, keyword matrix
- `extractor.service.spec.ts` — per-vendor response fixtures → normalized output
- `part-marking.service.spec.ts` — priority/fallback logic, cache hit/miss, force-refresh semantics
- `datasheet-parser.service.spec.ts` — regex against 10+ real datasheet text fixtures

### 9.2 Integration tests (real APIs, gated by env)
- Test-PN set (~15 parts spanning ICs/transistors/diodes/known-markings)
- Run on-demand via `npm run test:integration:part-marking`
- Assert marking contains expected token (not exact match, to tolerate format drift)
- Skipped in CI unless secrets present

---

## 10. Implementation Order

1. **Migration** — add material columns, `vendor_api_cache`, `part_marking_lookups`
2. **Shared vendor-api module** — clients, cache, rate limiter (reusable by Quoting)
3. **Part-marking service** — orchestration + skip heuristic, no UI
4. **Unit tests** — before wiring UI
5. **HTTP endpoints** — single-material first, then bulk-queue
6. **BullMQ worker** — bulk processing
7. **Integration tests** — against real APIs with fixed PN set
8. **Frontend: material detail** (simplest surface)
9. **Frontend: BOM revision bulk action + progress modal**
10. **Frontend: BOM viewer column + hover metadata**
11. **CSV export**
12. **Datasheet regex fallback**
13. **Datasheet LLM fallback (explicit user action)**
14. **Documentation update** in `IMPLEMENTATION_PLAN_MVP.md`

---

## 11. Open Questions / Future Work

- LED skip heuristic: LEDs often have markings; flag "led" keyword as review-before-skip
- Markings for multi-variant parts (same base, different package codes) — current design stores one per material; if ERP ever tracks variants separately, revisit
- Multilingual datasheets (Japanese MFRs like Renesas/Toshiba) — regex may need locale-specific patterns
- Vendor-agnostic "strong-match" confidence: later, compute agreement score across vendors when we have more data
- Quoting phase will extend `vendor_api_cache` usage to pricing / stock / lifecycle — no schema changes needed; different `endpoint` values

---

## 12. Rollout

1. Deploy migrations to staging, validate schema
2. Register vendor API credentials (one-time setup task for operator)
3. Smoke test on a small BOM (10–20 lines), inspect audit log
4. Roll to production
5. Announce feature via existing ERP changelog/notifications
