# ERP Release Change Control Log

> **System**: Manufacturing ERP — AT&A Canada
> **Production URL**: http://erp.atacanada.ca
> **Server**: SRV-AT&A (10.12.1.47)

---

## REV-002 — 2026-04-07

**Released by**: Mark Mankoura
**Migration required**: No
**Backup taken**: [ ] (check before deploying)

### Changes

| # | Type | Module | Description |
|---|------|--------|-------------|
| 1 | Enhancement | Purchase Orders | PO numbering sequence changed from `PO-YYYYMM-NNNN` format to sequential numeric starting at `8833045` |
| 2 | Bug Fix | MRP/Shortages | "View by Customer" Excel export showed global shortage on every row, causing buyers to double/triple-count quantities. Replaced single `Shortage` column with `Qty (Order)` and `Qty (All Orders)` |
| 3 | Enhancement | MRP/Shortages | "View by Material" Excel export (Order Details sheet) added `Qty (All Orders)` column alongside per-order quantity for consistency |
| 4 | Bug Fix | MRP/Shortages | "Affected Assemblies" Excel export showed global shortage per product. Replaced with `Qty (Product)` and `Qty (All Orders)` columns |

### Files Changed

- `erp/backend/src/modules/purchase-orders/purchase-orders.service.ts` — New PO number generator (sequential from 8833045)
- `erp/backend/src/modules/mrp/mrp.service.ts` — Added `required_quantity` and `total_required` to customer shortage response
- `erp/frontend/src/lib/api.ts` — Updated `CustomerShortageOrder` interface with new fields
- `erp/frontend/src/lib/export-utils.ts` — Updated 3 Excel exports (By Customer, By Material detail, Affected Assemblies)

### Verification Steps

- [ ] Create a new PO — verify number starts at 8833045 (or next in sequence)
- [ ] Export shortages "By Customer" — verify OR3947 shows 400 + 100, not 500 + 500
- [ ] Export shortages "By Material" (Order Details sheet) — verify `Qty (All Orders)` column present
- [ ] Export "Affected Assemblies" — verify `Qty (Product)` and `Qty (All Orders)` columns

---

## REV-001 — 2026-04-01

**Released by**: Mark Mankoura
**Migration required**: Yes (46 migrations — initial deployment)

### Changes

| # | Type | Description |
|---|------|-------------|
| 1 | Initial Release | Full ERP system deployed to production. 17 backend modules, ~165 API endpoints, 22 entities, 32 migrations. Next.js frontend with all CRUD pages, BOM import, receiving, kitting, MRP. |

### Notes

- First production deployment on SRV-AT&A
- NSSM direct services for boot persistence (PM2 bypassed)
- IIS reverse proxy at http://erp.atacanada.ca
- See DEPLOYMENT_LOG.md for full deployment details
