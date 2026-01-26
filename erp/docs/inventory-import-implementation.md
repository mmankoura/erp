# Inventory Import with Lot/Reel Tracking

## Status: COMPLETED

All planned features have been implemented and additional enhancements added.

## Overview
Add ability to import inventory from Excel/CSV files containing individual reels/lots with unique alphanumeric identifiers (UIDs). Each reel tracks a specific quantity of a material.

**User's file format:**
| UID | IPN | QTY | PACKAGE | PO |
|-----|-----|-----|---------|-----|
| ATA002616 | EN0017 | 2,260 | TR | ... |
| ATA002617 | EN0017 | 2,073 | TR | ... |

- Same IPN can have multiple UIDs (multiple reels of same material)
- UID is alphanumeric (not just numeric)

## Completed Implementation

### 1. Database Migration - DONE
**File:** `erp/backend/src/database/migrations/1736600000024-CreateInventoryLots.ts`

Created `inventory_lots` table with all planned fields.

### 2. Backend Entity - DONE
**File:** `erp/backend/src/entities/inventory-lot.entity.ts`

### 3. Backend DTOs - DONE
**File:** `erp/backend/src/modules/inventory/dto/inventory-import.dto.ts`

### 4. Backend Service - DONE
**File:** `erp/backend/src/modules/inventory/inventory-import.service.ts`

Includes:
- `previewFile()` - decode Base64, parse CSV, return headers + preview rows
- `parseAndMapFile()` - apply column mappings, match materials, validate
- `commitImport()` - create lots + receipt transactions in transaction
- `deleteLot()` - delete single lot with transactions
- `deleteLots()` - bulk delete lots

### 5. Backend Controller Endpoints - DONE
**File:** `erp/backend/src/modules/inventory/inventory.controller.ts`

```
POST /inventory/import/preview
POST /inventory/import/parse
POST /inventory/import/commit
GET  /inventory/lots
GET  /inventory/lots/:id
GET  /inventory/lots/by-uid/:uid
DELETE /inventory/lots/:id
POST /inventory/lots/bulk-delete
```

### 6. Frontend Types - DONE
**File:** `erp/frontend/src/lib/api.ts`

### 7. Frontend Import Wizard - DONE
**File:** `erp/frontend/src/components/inventory-import-wizard.tsx`

4-step wizard with customer association support.

### 8. Inventory Page Integration - DONE
**File:** `erp/frontend/src/app/inventory/page.tsx`

- Import Inventory button
- Lots/Reels tab with DataTable
- Delete functionality (single and bulk)

## Additional Features Implemented

### Customer Association for Imports
- Added customer selector to inventory import wizard
- Imports can be associated with a customer (owner_type: CUSTOMER, owner_id)
- Supports company-owned inventory (default) or customer-owned

### Customer Entity Enhancements
**File:** `erp/backend/src/entities/customer.entity.ts`
**Migration:** `1736600000025-AddCodeAndNotesToCustomers.ts`

- Added `code` field (unique identifier)
- Added `notes` field
- Fixed email validation for empty strings

### Order Delete Functionality
**Files:**
- `erp/backend/src/modules/orders/orders.controller.ts`
- `erp/backend/src/modules/orders/orders.service.ts`
- `erp/frontend/src/app/orders/page.tsx`

Endpoints:
```
DELETE /orders/:id
POST /orders/bulk-delete
```

Features:
- Individual delete button (trash icon) per order row
- Checkbox selection with bulk delete
- Confirmation dialogs
- Toast notifications (using sonner)
- Automatic deallocation of materials on delete

### DataTable Enhancements
**File:** `erp/frontend/src/components/data-table.tsx`

- Added `enableSelection` prop for uncontrolled selection mode
- Added `onBulkDelete` prop for bulk delete callback
- Internal state management for selection
- Delete button appears when items selected

## Commits

1. `8c54eb2` - feat: Auto-create materials during BOM import
2. `60719bb` - feat: Add BOM viewer page with validation and Excel support
3. `089e581` - fix: Add validation decorators to optional DTO fields
4. `6d1d3e7` - feat: Add customer selector to inventory import wizard
5. `20ffdc9` - feat: Add code and notes fields to customers
6. `7c0b3af` - feat: Add delete functionality for inventory lots
7. `9f6ffd5` - fix: Add enableSelection and onBulkDelete support to DataTable
8. `57865ce` - feat: Add delete functionality for orders
9. `1a461a1` - fix: Use sonner toast instead of non-existent useToast hook

## Verification - PASSED

All features tested and working:
- Inventory import with CSV files
- Column auto-detection and mapping
- Material matching (exact and case-insensitive)
- Auto-create missing materials
- Customer association
- Lots tab with delete functionality
- Orders page with delete functionality
