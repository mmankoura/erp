# ERP Release Change Control Log

> **System**: Manufacturing ERP — AT&A Canada
> **Production URL**: http://erp.atacanada.ca
> **Server**: SRV-AT&A (10.12.1.47)

---

## REV-012 — 2026-08-13

**Released by**: Mark Mankoura
**Migration required**: **Yes** — `1769500000000-CreateBomWizardRecipes.ts` creates `bom_wizard_recipes`. Also adds seven endpoints, so this is a full backend + frontend release, not a static rebuild.

**Backup taken**: [ ] (check before deploying)

**Deploy note**: Re-read `deployment_known_issues.md` before starting, and pay closer attention than usual. REV-011 was frontend-only, so the deploy script's smart-skip breaking the documented migration-before-switch ordering did no harm. **This release has a migration, so that ordering actually matters.** Run the migration against the new release before switching, and confirm `bom_wizard_recipes` exists afterwards. `switch-release.bat` still ignores rotate failures.

### Changes

| # | Type | Module | Description |
|---|------|--------|-------------|
| 1 | Feature | BOM | **The BOM Formatting Wizard**, a new page at `/bom/wizard`. Opens a supplier's Excel or CSV file, reshapes it into importable BOM lines, and records every step taken so the same cleanup can be replayed on the next revision. Built for wrapped files the current importer mangles — the AEGIS format recovers 199 parts from 374 rows, and 207 from a second file. |
| 2 | Feature | BOM | The file is read **in the browser**. Nothing is uploaded, and nothing is written until Commit. Every sheet in a workbook is offered; switching sheets starts a fresh document. |
| 3 | Feature | BOM | **Three transformations**: promote a row to column headers, fill values down into the blanks beneath them, and merge a run of continuation rows into one line while concatenating their reference designators. Only *adjacent* rows merge, so two separate appearances of the same part stay two lines. |
| 4 | Feature | BOM | **Column mapping** onto the BOM fields. Anything left unmapped is simply not imported; each field can only come from one column, so choosing it again moves it. |
| 5 | Feature | BOM | **A recorder panel** listing every step in order, with a Comments column. Click a step to see the grid as it stood there; delete a step and the rest replay without it. Undone steps stay listed, greyed, because they are still part of the recipe. |
| 6 | Feature | BOM | **Commit, two ways.** Create a new revision (Admin or Manager, changes nothing that exists), or replace an existing revision's items (Admin only). The dialog reports how many of how many lines are ready before anything is sent. |
| 7 | Feature | BOM | **Recipes.** Save the recorded steps under a name, load them onto a different file, or export and import them as a `.bomrecipe.json` file. A recipe holds the transformation only — never any data from the file it was recorded against. |
| 8 | Backend | API | `PUT /bom/revision/:id/items` — wholesale item replacement in one transaction. Lines are matched on a stable identity so a matched line keeps its row and therefore its alternates; delete-and-reinsert would have silently dropped every alternate on the revision. |
| 9 | Backend | API | That endpoint refuses to rewrite a revision that orders depend on. Orders past ENTERED are refused outright; ENTERED orders require an explicit acknowledgement in the request. |
| 10 | Backend | API | `GET/POST/PATCH/DELETE /bom/wizard/recipes` — recipe storage. Reading is open to all roles; writing is Admin or Manager. |
| 11 | Backend | API | `POST /materials/resolve-part-numbers` — resolves a whole BOM's part numbers in one request, reporting exact matches, case-only matches and misses separately. |
| 12 | Fix | BOM | **The wholesale replace could not set `resource_type`.** The field was missing from its payload while the create path has always had one, so of the two ways to put items on a revision only one could record what kind of part a line is. Wired through; a resource-type change now counts as a real change rather than reading as unchanged. |
| 13 | Enhancement | BOM | **Resource types the enum cannot hold are mapped, not dropped.** AEGIS files carry `PROG IC`, `BLANK IC`, `BRACKET`, `CLAM`, `HTSNK`, `ADHESIVE` and `ASSY`; the enum holds only SMT, TH, MECH, PCB and DNP. The commit dialog shows an editable table seeded with a guess, and appends the file's own wording to the line's notes so nothing is lost. |
| 14 | Enhancement | BOM | **Warnings before committing**: missing part numbers, unusable quantities, a quantity that disagrees with its designator count, a designator used on two lines, a duplicate line identity, and unrecognised resource types. None of them block the commit. |

### Known behavior changes (worth communicating to users)

- **Import BOM now opens the wizard.** The button on a product's page goes to the wizard with that product already selected, instead of the old full-screen import dialog. The old importer's code and its `/bom/import/*` endpoints are untouched and still work, but nothing in the interface reaches them any more — so the wizard is the import path, not an alternative to it.
- **The wizard is also reachable on its own**, from Catalog → BOM Wizard, for importing without starting from a product.
- **The wizard cannot create materials.** A part number with no material is listed and skipped — the rest of the file still imports. Create the missing materials first, then reopen the commit dialog. This is deliberate: the old importer's habit of inventing materials mid-import is what makes a bad BOM expensive to unpick.
- **Replacing a revision's items is Admin-only; creating a new revision is Admin or Manager.** A manager can prepare and save a recipe, and import a new revision, but cannot overwrite an existing one.
- **On a replace, a line with no resource type has its resource type cleared.** The endpoint replaces items wholesale, so an omitted field means "this line has none", not "leave what was there".
- **Fill Down does nothing on AEGIS-shaped files.** Merge already absorbs the continuation rows, and the lead row carries the values Fill Down would have propagated. It is not broken — it is genuinely redundant for that file shape, and remains useful for files that are not merged. Worth saying out loud so nobody spends an afternoon on it.
- **Recipes are shared by everyone**, not private per user. Saving under an existing name replaces that recipe's steps.
- **Part numbers that differ only by case are not silently accepted.** The dialog offers to use the existing material and says which one; declining skips those lines rather than creating a near-duplicate material.
- Switching to a different sheet **discards the recorded steps**, since they address rows and columns of the sheet they were recorded against.

### Verification Steps

- [ ] Run the migration, then confirm: `SELECT to_regclass('public.bom_wizard_recipes');` returns non-null
- [ ] Open `/bom/wizard` → choose an AEGIS file → the grid appears with the row count in the toolbar
- [ ] Use row as headers → the column headers take the file's own words; the row leaves the data
- [ ] Merge continuation rows, grouped on the item column, joining the reference column → the row count drops to the number of real parts
- [ ] A merged row shows a coloured stripe in the gutter; hover it → names how many rows of the file it was built from
- [ ] Check a wrapped line: quantity is the file's stated figure, **not** the sum of the run, and the designator list runs from its first to its last
- [ ] Undo → the rows come back; Redo → they collapse again
- [ ] Click an earlier step in the recorder → the grid returns to that point; click the last → it catches up
- [ ] Delete the middle step → the rest replay without it
- [ ] Type a comment on a step, click away → it sticks; press Escape mid-edit → it reverts
- [ ] Map columns → the headers show the mapped field beside each name
- [ ] Save a recipe → reload the page, open a *different* file of the same format, Load that recipe → the same steps apply and the grid comes out right
- [ ] Export the recipe → open the file → it contains `schema_version` and the steps, and no BOM data
- [ ] Import that file back → same result
- [ ] Edit the exported file to break a step (remove a merge's `separator`) → import → refused, naming the step
- [ ] Commit → Create a new revision → pick a product, set a revision number → the new revision exists with the expected line count
- [ ] Confirm the mapped resource types landed: `SELECT resource_type, count(*) FROM bom_items WHERE bom_revision_id='<id>' GROUP BY 1;`
- [ ] Confirm the original wording survived: `SELECT notes FROM bom_items WHERE bom_revision_id='<id>' AND notes LIKE 'Resource type from file:%' LIMIT 5;`
- [ ] Commit again with a part number that has no material → it is listed as skipped and the other lines still import
- [ ] As a Manager: the replace option is disabled and marked Admin only; creating a revision still works
- [ ] As an Admin: replace an existing revision's items → the counts reported (added/updated/removed/unchanged) match what you expect
- [ ] Replace a revision that an ENTERED order references → refused until the acknowledgement is ticked; with an order further along → refused regardless
- [ ] Confirm alternates survived the replace: an unchanged line still has its `bom_item_alternates` rows
- [ ] As a Warehouse Clerk: recipes can be loaded and imported, but Save and Delete are unavailable
- [ ] Products → BOM → the **old** import wizard still works exactly as it did in REV-011

---

## REV-011 — 2026-08-11

**Released by**: Mark Mankoura
**Migration required**: No — frontend only. No schema change, no new endpoint; cell editing goes through `PATCH /inventory/lots/:id`, shipped in REV-010.

**Backup taken**: [ ] (check before deploying)

**Deploy note**: Frontend build only, but re-read `deployment_known_issues.md` first — the deploy script's smart-skip breaks the documented migration-before-switch ordering, and `switch-release.bat` ignores rotate failures.

### Changes

| # | Type | Module | Description |
|---|------|--------|-------------|
| 1 | Feature | Inventory | **The Lots/Reels tab is now a spreadsheet.** 26px rows, gridlines on every cell, a row-number gutter down the left, and a filter box under every column header. Roughly twice as many reels fit on screen as before. |
| 2 | Feature | Tables | Spreadsheet mode is an opt-in prop on the shared `VirtualGrid`. **Only Lots/Reels uses it** — the other 22 grids in the app are byte-identical to REV-010. It is drawn with the app's existing colours rather than Excel's greys. |
| 3 | Feature | Tables | **Cell cursor and range selection.** Click a cell to focus it; arrows, Tab (wraps at the row end), Enter, Home/End, PageUp/PageDown and Ctrl+Arrow move it. Shift with any of those, or shift-click, or drag, extends the selection; Ctrl+A takes everything; clicking a row number takes the row. Sorting or filtering keeps the same *records* selected, not the same screen positions. |
| 4 | Feature | Tables | **Ctrl+C copies the selection as a block that pastes straight into Excel.** Values copy raw — a quantity arrives as `9875`, not the string `9,875`, so Excel treats it as a number. Implemented on the browser's copy event rather than the clipboard API, which does not exist over plain http and would have silently done nothing in production. |
| 5 | Feature | Tables | **Always-visible filter row**, toggled from the toolbar and remembered per grid. A column filtered from the header's funnel popover shows its selection as a chip in the row, so the two controls can't clobber each other. |
| 6 | Feature | Inventory | **Type directly into a reel.** Quantity, package, PO reference and BIN are editable in place: type over a cell to start, F2 or double-click to edit the existing value, Enter commits and moves down, Tab moves right, Escape reverts, Delete clears. Saved values appear immediately and settle when the refetch lands. |
| 7 | Feature | Inventory | The sheet is **read-only until unlocked** with the Locked/Editing button, which only appears for ADMIN / MANAGER / WAREHOUSE_CLERK. Quantity edits move on-hand stock for MRP and kitting, so a stray keystroke must not be enough to do it. |
| 8 | Feature | Inventory | **Paste a block of values back in.** The block lands at the top-left of the selection, a single copied cell fills the whole selection, and anything past the last row is discarded and reported — a paste never creates reels. Bulk-assigning BINs or PO references from a spreadsheet is now one operation. |
| 9 | Backend | API | No backend change. Edits are grouped into one `PATCH /inventory/lots/:id` per reel and sent four at a time, since that endpoint locks the lot and reconciles open kitting lists inside its transaction. |
| 10 | Enhancement | Inventory | Client-side validation mirrors the API's rules, so a bad value is refused in the cell instead of coming back as a 400: quantity bounds and 4-decimal limit, package normalised to upper case, and the ACTIVE-only rule. An unchanged value is never sent at all. |
| 11 | Refactor | Tables | `virtual-grid.tsx` was decomposed into `components/grid/` (types, filter popover, filter row, cell editor, selection hook, TSV, paste planning) ahead of the feature. The TSV and paste-planning modules are pure and unit-tested — 22 tests. |
| 12 | Fix | Tables | The header's filter popover asserted its value was a list; it now checks, since the filter row can leave a substring there instead. |

### Known behavior changes (worth communicating to users)

- **BIN on the Lots/Reels tab now follows the same ACTIVE-only rule as the other editable fields.** It used to have its own endpoint that accepted any status, so a BIN could be set on a CONSUMED or RETURNED_TO_CLIENT reel from that grid. It no longer can. The Assign Stock Location dialog still uses the old endpoint and is unaffected.
- **The Receiving Log tab is unchanged** — still 44px rows with the old always-on BIN input. So two tabs of the same page now look and behave differently. Deliberate for this pass: that grid renders IPN and description on two lines, which a fixed row height would clip.
- **Cells clip instead of wrapping** on the Lots/Reels tab. Long descriptions are cut off rather than growing the row; widen the column or hover for the full value.
- **Pasting into the quantity column always asks for confirmation**, however few cells, and **there is no undo**. Each write moves on-hand stock, writes an `ADJUSTMENT` transaction and silently adjusts `qty_verified` on any open kitting list the reel is scanned onto. Pastes over 50 cells ask regardless of column.
- If part of a paste fails, **the successful rows stay saved** — they are not rolled back. Failed cells turn red and name the reason; the toast reports both counts.
- Editing is locked by default every time the page loads; the toggle is not remembered.
- The filter row is on by default and its state is remembered per grid, in the browser, per user.
- Status and package no longer render as badges on this grid — they are plain text, to fit the row.

### Verification Steps

- [ ] Inventory → Lots/Reels → click a cell → it gets a focus ring; arrow around; shift-arrow extends the highlight
- [ ] Sort by a column with a selection active → the same reels stay highlighted, not the same screen rows
- [ ] Scroll right → the row-number gutter stays pinned to the left **and** the last column is still reachable
- [ ] Type in the filter box under IPN → rows narrow; use the funnel on the same column → the filter box shows a chip instead; "Clear filters" clears both
- [ ] Toggle Filters off, reload the page → still off
- [ ] Select a 5×2 block → Ctrl+C → paste into Excel → five rows, two columns, quantities land as numbers
- [ ] With editing locked, type over a cell → nothing happens
- [ ] Unlock → type over a BIN → Enter → saves and the cursor moves down; check the grid still shows the new value after the refetch
- [ ] Escape mid-edit → reverts
- [ ] Edit the quantity of a reel that sits in an open physical count → that cell turns red and names the count; the same reel's BIN still saves
- [ ] Confirm the ledger caught it: `SELECT transaction_type, quantity, reason, created_by FROM inventory_transactions WHERE lot_id='<id>' ORDER BY created_at DESC LIMIT 1;`
- [ ] Retype a cell's existing value → no request is sent
- [ ] Try to edit a CONSUMED reel → refused in the cell, without a round trip
- [ ] Copy 5 BINs, select 5 different reels, Ctrl+V → saves all five; paste a block taller than the rows left below the cursor → the overflow is reported as ignored
- [ ] Paste into the quantity column → confirmation dialog naming the row count → Apply → quantities move and an `ADJUSTMENT` row exists for each
- [ ] Select a block spanning BIN and quantity → Delete → BINs clear, quantities are reported as rejected rather than zeroed
- [ ] Open Receiving Log, Stock Levels, Purchase Orders, Products → BOM and Kitting → all unchanged from REV-010, with BOM's tall rows still not clipping

---

## REV-010 — 2026-08-11

**Released by**: Mark Mankoura
**Migration required**: Yes — 2 migrations:
1. `AddRecountQtyToDiscrepancies1769300000000` — adds `recount_qty numeric(12,4) NULL` to `physical_count_discrepancies`. Additive and nullable, so it is backward-compatible with the currently deployed build (TypeORM selects an explicit column list, so the running REV-009 code ignores the new column).
2. `AddCaseInsensitiveUserUniqueness1769400000000` — unique indexes on `LOWER(username)` and `LOWER(email)` on `users`. **This one can fail the deploy**: if production holds two accounts differing only by case, the index cannot be built and the migration aborts. That is deliberate — the alternative is a login that silently resolves to either account. Check first with `SELECT lower(username), count(*) FROM users GROUP BY 1 HAVING count(*) > 1;` (and the same for `email`). Dev's Aug 10 copy of production was clean.

**Backup taken**: [ ] (check before deploying)

**Deploy note**: REV-009's node_modules are **junctions**, so per that release's lesson REV-010 **must materialize** (`npm ci` / `npm install`) — a second consecutive junction hop would self-reference. Also re-read `deployment_known_issues.md` first: the deploy script's smart-skip breaks the documented migration-before-switch ordering, and `switch-release.bat` ignores rotate failures.

### Changes

| # | Type | Module | Description |
|---|------|--------|-------------|
| 1 | Feature | Physical Count | `RECOUNT` resolution now prompts for the re-counted quantity inline at review time instead of deferring to an auto-spawned child count. The entered number is authoritative: on approve the lot is adjusted to it via an `ADJUSTMENT` transaction with reason `"Physical count <#>: adjust to recount"`. Closes the discrepancy in one step. |
| 2 | Feature | Physical Count | Review page shows an auto-focused, required numeric input when `RECOUNT` is selected. Enter submits; Save stays disabled while the value is empty or invalid; helper text explains that the lot will be set to this number. New "Recounted" column in the row summary. |
| 3 | Backend | API | `PATCH /physical-counts/:id/discrepancies/:discId` rejects `RECOUNT` without `recount_qty` (`400`) where the discrepancy has a lot to write back to. An `ORPHAN` scan that matched no lot is exempt — there is nothing to adjust. Audit payload records `recount_qty`, and adjustment audits record `source: RECOUNT \| SCAN`. |
| 4 | Fix | Physical Count | **Auto-spawned recount children were unstartable.** `startCount` re-snapshotted every active customer lot onto a count whose snapshot had already been seeded by the child spawn, violating `UQ_physical_count_lots_count_lot` and surfacing as a 500. It also would have widened a targeted recount into a full count. A pre-seeded snapshot is now left as-is. |
| 5 | Fix | Physical Count | **A count with zero discrepancies could never be approved.** The review page required `discrepancies.length > 0` before enabling Approve, so a count where every scan matched the system was permanently stuck in `PENDING_REVIEW`. The guard now also distinguishes a loaded-but-empty result from the loading and error states, which both surface as `null` data. |
| 6 | Removal | Physical Count | Retired the auto-spawned child recount path. `approveCount` no longer creates a follow-up `PLANNED` count, snapshots lots onto it, or reports `recount_spawned` in its audit payload — the inline recount quantity replaces it. A `RECOUNT` row with no quantity is now an explicit no-op (only reachable for an `ORPHAN` scan that matched no lot), which also removes a latent `NaN` adjustment path. `physical_counts.parent_count_id` is retained for existing lineage but is never written. |
| 7 | Enhancement | Physical Count | Excel variance report gains a "Recounted Qty" column. Review header text now distinguishes loading / error / "No discrepancies — every scan matched the system" / "N of M resolved". |
| 8 | Feature | Auth | **Login is no longer case-sensitive on the username or email.** `validateUser` lower-cases the supplied identifier and matches on `LOWER(username)` / `LOWER(email)`. Stored casing is preserved for display — `Sylvie` stays `Sylvie` — and the **password remains case-sensitive**. |
| 9 | Backend | Auth | User create/update now detect username and email conflicts case-insensitively, backed by unique indexes on `LOWER(username)` / `LOWER(email)`. Without this, an admin could create `sylvie` alongside `Sylvie` and make the login lookup ambiguous. Uses `Raw(LOWER(...))` rather than `ILike`, which would treat `_` and `%` in a username as wildcards. |
| 10 | Fix | Auth | `updateUser` picked its conflict message with a case-sensitive `===` comparison, so a username colliding only by case would have been reported as "Email already exists". Now compared case-insensitively. |
| 11 | Feature | Inventory | **Lot / reel details are now editable on the fly.** New `PATCH /inventory/lots/:id` (ADMIN/MANAGER/WAREHOUSE_CLERK) edits **quantity, package type, PO reference and BIN**. A pencil action on the Lots/Reels and Receiving Log grids opens a dialog showing a live delta (`9,875 → 9,800 (-75)`) and an optional reason. Identity and structural fields (`uid`, `material_id`, `owner`, `status`, `unit_cost`) are deliberately not editable — the global `forbidNonWhitelisted` validation pipe rejects them outright. |
| 12 | Backend | Inventory | A quantity edit writes a compensating `ADJUSTMENT` `InventoryTransaction` for the delta (`reference_type: MANUAL`) before updating the lot, so the ledger still explains the stock level — on-hand is derived from lot quantities, not from the ledger. Runs in one transaction under a `pessimistic_write` lock. No-op saves write nothing at all. New `INVENTORY_LOT_UPDATED` audit event records before/after plus the reason. |
| 13 | Backend | Inventory | **Open kitting lists are auto-reconciled.** Kitting copies a reel's whole quantity into `kitting_list_items.qty_verified` at scan time, so editing that reel afterwards would leave the kit claiming stock that no longer exists. The edit now adjusts `qty_verified` and the scan's stored quantity by the same delta and reports the affected kit. (`is_short`/`shortage_qty` are untouched — kitting only writes those at completion and computes them live.) |
| 14 | Backend | Inventory | Guard rails: only `ACTIVE` lots are editable at all, and a quantity change is refused (400, naming the count) while the lot sits in an open physical count, since the count snapshotted that quantity as `expected_qty`. The other three fields still save in that case. |
| 15 | Fix | Types | `LotStatus` in the frontend API types was missing `RETURNED_TO_CLIENT`, a status held by 803 production lots. |
| 16 | Fix | Physical Count | **Review rows showed only the UID.** The column was already labelled "UID / IPN" and the endpoint already loaded the material relation — the IPN was simply never rendered. Each row now shows the IPN and MPN beneath the UID, with the description on hover. A scan that matched no lot has no material, so it reads *"Not in system"* rather than a blank. |
| 17 | Feature | Reports | **New Customer Inventory report** at `/reports/customer-inventory` (linked in the sidebar and navbar under Warehouse). Pick a customer to see everything AT&A currently holds for them: summary cards, a per-part summary tab and a reel-detail tab. Exports to **Excel** (two sheets — Summary and Reel Detail) and **PDF** (a printable statement in the same style as the client return document, with page breaks). Built for answering "what stock of ours do you hold". |
| 18 | Backend | API | `GET /inventory/customer-report/:customerId` returns the customer, generation timestamp, totals (distinct parts / reels / total quantity), a per-material rollup and the reel-level detail. **ACTIVE lots only** — CONSUMED and RETURNED_TO_CLIENT reels have left the floor and reporting them as held stock would overstate what we owe the client. |

### Known behavior changes (worth communicating to users)

- `RECOUNT` no longer defers work to a separate count. Reviewers must go count the stock and enter the number during review; there is no "decide later" path.
- **Auto-spawned child counts are gone entirely.** Approving a count no longer creates a follow-up `PLANNED` count under any circumstance. Verified safe before removal: production held no counts in `PENDING_REVIEW`, so no in-flight review depended on the old behaviour. Existing child counts keep their `parent_count_id` lineage — the column is retained as historical data and is simply never written any more.
- A perfect count (no discrepancies) is now approvable immediately.
- Users can sign in with any casing of their username or email (`Sylvie`, `sylvie`, `SYLVIE` all work). Passwords are unaffected and stay case-sensitive.
- Two accounts can no longer be created differing only by case; the second attempt returns "Username already exists".
- Warehouse clerks can now change a reel's **quantity**, not just its BIN. Every change is audited and every quantity change writes an inventory transaction, but this is a wider power than before — it moves material on-hand for MRP and kitting.
- Editing a reel's quantity silently updates any open kitting list it is scanned onto. The success toast names the affected kit, but the operator working that kit is not notified.
- Reels that are not `ACTIVE` (CONSUMED, RETURNED_TO_CLIENT) show no edit action at all.
- The Customer Inventory report counts **ACTIVE reels only**, including any with a zero quantity. INTROSPECT currently has 6 empty reels still flagged ACTIVE, which appear as 0-qty lines; this keeps the report reconciling with the Inventory page's reel count, but it is worth tidying those lots before sending a statement to a client.
- The report is always "as of now". There is no point-in-time / month-end view — lot quantities are current-state only.

### Verification Steps

- [ ] Physical Count → open a count in `PENDING_REVIEW` with a shortage → select `RECOUNT` → qty input appears focused; leave it blank → Save disabled and helper text turns red
- [ ] Enter a quantity → Save → row shows it under "Recounted"; approve → lot quantity equals the recounted number, and an `ADJUSTMENT` transaction exists with reason ending `adjust to recount`
- [ ] Approve a count whose scans all matched → Approve button is enabled and header reads "No discrepancies — every scan matched the system"
- [ ] Start an auto-spawned recount child (`parent_count_id` set) → starts without a 500 and `total_expected_lots` stays at the flagged-lot count, not the full customer lot count
- [ ] Variance report Excel → "Recounted Qty" column present and populated for recount rows
- [ ] Login as `Sylvie` using `sylvie` and `SYLVIE` → both succeed; the wrong password still returns 401
- [ ] Login by email in mixed case → succeeds
- [ ] Settings → Users → create a user named `sylvie` while `Sylvie` exists → rejected with "Username already exists"
- [ ] Inventory → Lots/Reels → pencil on an ACTIVE reel → change quantity → dialog shows the delta; save → grid and Stock Levels both move by that delta
- [ ] Confirm an `ADJUSTMENT` row exists: `SELECT transaction_type, quantity, reason, created_by FROM inventory_transactions WHERE lot_id='<id>' ORDER BY created_at DESC LIMIT 1;`
- [ ] Open the dialog and save without changing anything → no transaction and no audit event written
- [ ] Edit the quantity of a reel scanned onto an IN_PROGRESS kit → toast names the kit, and `kitting_list_items.qty_verified` moves by the same delta
- [ ] Try a quantity edit on a reel in an open count → 400 naming the count; changing its BIN on the same reel still succeeds
- [ ] Confirm no pencil renders on a CONSUMED / RETURNED_TO_CLIENT reel
- [ ] Physical Count → review a count → each discrepancy row shows the IPN under the UID; an ORPHAN scan reads "Not in system"
- [ ] Warehouse → Customer Inventory → pick INTROSPECT → totals read 301 parts / 372 reels / 131,994 qty (as of the Aug 10 data)
- [ ] Export Excel → two sheets, Summary and Reel Detail, summary quantities sum to the header total
- [ ] Export PDF → summary table then reel detail, page breaks intact, header repeats on each page

---

## REV-006 — 2026-06-05

**Released by**: Mark Mankoura
**Migration required**: Yes — 2 migrations:
1. `AddCustomerIdToProducts` — **recovery**: the column was manually applied to prod earlier and its row is already present in the `migrations` table. `migration:run` will skip it. The migration file is committed so a fresh DB rebuild stays consistent.
2. `AddBinToInventoryLots` — adds `bin varchar(50) NULL` + index on `inventory_lots` for user-assigned stock locations.

**Backup taken**: [ ] (check before deploying)

### Changes

| # | Type | Module | Description |
|---|------|--------|-------------|
| 1 | Feature | Inventory | BIN column on `inventory_lots` — inline-editable per lot on Lots/Reels and Receiving Log tabs. Saves on blur/Enter via `PATCH /inventory/lots/:id/bin` (ADMIN/MANAGER/WAREHOUSE_CLERK). |
| 2 | Feature | Inventory | Import wizard now supports a BIN mapping field (auto-detects headers: `bin`, `bin location`, `stock location`, `shelf`, `location`). |
| 3 | Enhancement | Inventory | Import Inventory button restored on `/inventory` header (was lost in the warehouse-nav consolidation). |
| 4 | Enhancement | Inventory | Receiving Log column "Location" → "Stage" (the workflow indicator) to make room for the new user-assigned BIN. |
| 5 | Feature | Purchasing | Per-PO Excel export — flat-row format: PO# / DATE / SUPPLIER / AT&A# / MFR / MPN / Description / QTY / Mounting Type / Packaging / Customer / Unit Price / CDN-US / COMMENTS. Button next to existing PDF in the PO detail dialog. |
| 6 | Feature | Purchasing | Per-consumable-PO Excel + PDF exports. PDF mirrors the AT&A supplier bilingual template. Buttons in the consumable orders row actions. |
| 7 | Feature | Purchasing | Manual PO # entry on PO creation. Optional field in the create dialog (leave blank for auto-generation via the 8833xxx sequence). Backend throws `ConflictException` on duplicate, surfaced as a toast. |
| 8 | Feature | Purchasing | Delete PO available from any status (was DRAFT-only). Confirmation message warns about soft-delete and orphaned receipts for non-DRAFT POs. Available from the row dropdown and the detail dialog header. |
| 9 | Feature | Purchasing | PO list rewritten as a flat per-line VirtualGrid (`PoLineRow`). One row per PO line with line number / IPN / MFR / MPN / qty ordered / qty received / unit cost / line total. POs with zero lines render a placeholder row so they remain visible/searchable. |
| 10 | Feature | Purchasing | "Generate PDF by PO #" dialog — search by PO number and download the PDF without opening the PO detail. |
| 11 | Feature | Tables | All major tables migrated from `DataTable` to `VirtualGrid` — AML, Customers, Suppliers, Materials, Products, Product BOM detail, Orders, Production WIP, Consumable Orders, Purchase Orders, PO History. Search bar moved into the grid header on each. |
| 12 | Fix | UI | VirtualGrid: single horizontal-scroll container + sticky opaque header. Eliminates the double scrollbar and the header/row misalignment when scrolling horizontally on wide tables (PO list, materials, inventory). |
| 13 | Fix | Production | WIP table cells (Customer, Product, Total Qty) now render values — they were previously empty (`cell` not defined). |
| 14 | Enhancement | Search | Search broadened on Customers, Suppliers (code / name / email / phone), Materials (+ manufacturer + customer name), Products (+ customer name), Orders (order # / PO # / WO # / customer / product), Product BOM (+ manufacturer / MPN / notes / alternates). |
| 15 | Removal | UI | Bulk-select + bulk-delete toolbar removed across Customers, Materials, Orders, Products, Suppliers. Single-row delete preserved. |
| 16 | Backend | API | `material.customer` joined on `GET /purchase-orders` so the Customer column in the Excel export populates. |
| 17 | Backend | API | Body-parser limit raised to 50 MB (was Express default 100 KB) — was blocking Excel uploads through the inventory import wizard. |
| 18 | Infra | Tests | Vitest + Testing Library devDeps added (`vitest`, `@vitest/ui`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`) plus `test`/`test:watch`/`test:ui` scripts. No runtime impact. |

### Known behavior changes (worth communicating to users)

- Persisted column widths/visibility (per-table `storageKey`) no longer survive a refresh on the migrated tables. Power users who customized columns will see defaults.
- Pagination is gone on the migrated tables — virtualized rendering instead. Large datasets scroll smoothly.
- Row-click navigation removed on Materials, Products, Orders. Per-row Eye / Pencil / BOM icons preserved as the drill-in path.
- Product BOM detail: `Type` and `Notes` columns are now visible by default (previously hidden behind the column toggle).

### Verification Steps

- [ ] Inventory → Lots/Reels: click a BIN cell, type a value, press Enter → saves; reload page → value persists
- [ ] Inventory → Receiving Log: BIN column present, "Stage" column shows RECEIVING/STOCK/WIP/CONSUMED
- [ ] Inventory → Import Inventory: button visible on header; upload a CSV with a `bin` column → it auto-maps; commit → lots created with BIN populated
- [ ] Inventory → Import Inventory: upload a > 100 KB Excel file → no "request entity too large" error
- [ ] Purchase Orders → open any PO → Excel button → downloads `PO# <number>.xlsx` with flat-row format and Customer column populated where the material has a customer
- [ ] Purchase Orders → New PO: leave PO # blank → auto-generated; enter a value → saves; enter a duplicate → toast "PO number "X" already exists"
- [ ] Purchase Orders → open any PO → Delete button visible regardless of status; CANCELLED / RECEIVED POs show stronger confirm message
- [ ] Purchase Orders list: flat per-line view; sort + filter columns work; column widths resize and reset on refresh
- [ ] Purchase Orders → "Generate PDF" header button: enter a PO# → PDF downloads
- [ ] Consumable Orders → row actions: PDF icon + Excel icon both download
- [ ] Wide tables (PO list, materials): horizontal scroll → header scrolls with rows, single scrollbar at bottom
- [ ] AML / Customers / Suppliers / Materials / Products / Orders / Production WIP: VirtualGrid renders, columns sortable/filterable, search works
- [ ] Production WIP: Customer, Product, Total Qty columns now show values

---

## REV-005 — 2026-04-26

**Released by**: Mark Mankoura
**Migration required**: Yes — 3 migrations:
1. `CreateConsumableOrders` — consumable orders and lines tables
2. `AddSupplierAndPOFields` — supplier profile fields + PO terms/revision/fob/ship_to/requested_by

**Backup taken**: [ ] (check before deploying)

### Changes

| # | Type | Module | Description |
|---|------|--------|-------------|
| 1 | Feature | Purchasing | Consumable Orders module — production consumables (solder paste, stencils). Auto-generated CON-YYYYMMDD-NNN. Create/edit/delete, mark received/undo. |
| 2 | Feature | Purchasing | PO PDF generation — matching AT&A bilingual template with logo, supplier info, terms, line items, signature. Download button on PO detail. |
| 3 | Feature | Purchasing | Supplier profile — attention, default_terms, default_fob, default_ship_to, currency fields |
| 4 | Feature | Purchasing | PO fields — terms, revision, fob, ship_to, requested_by for PDF and tracking |
| 5 | Feature | Inventory | VirtualGrid component — virtualized rows, sticky headers, Excel-style column filters. Applied to Stock Levels, Lots/Reels, Receiving Log, Low Stock, Recent Activity. |
| 6 | Feature | Inventory | Receiving Log tab — all lots sorted by date with UID, customer, IPN, qty, package, PO ref, status, location |
| 7 | Feature | Inventory | Recent Activity — UID column added, server-side search includes UID |
| 8 | Enhancement | Inventory | Customer Supplied, Return to Stock, Kitting as buttons on inventory page. Warehouse nav links directly to Inventory. |
| 9 | Feature | Receiving | Undo receive — delete button on receipt log, reverses transaction, deletes lot, updates PO, audit logged |
| 10 | Enhancement | Receiving | Customer Supplied mode — optional PO # / Packing Slip # field |
| 11 | Fix | Receiving | Receipt log is session-only (doesn't persist across page refresh) |
| 12 | Fix | Inventory | Return to Stock qty=0 marks lot as CONSUMED |
| 13 | Fix | Purchasing | PO detail Mfg/MPN falls back to material data when PO line fields are empty |
| 14 | Fix | UI | Breadcrumbs show "Details" instead of UUID |

### Verification Steps

- [ ] Consumable Orders: create, edit, receive, undo receive, delete
- [ ] PO detail: click PDF button — verify PDF downloads with correct layout
- [ ] Inventory: verify VirtualGrid on all tabs (Stock, Lots, Receiving Log, Recent, Low Stock)
- [ ] Inventory: verify Customer Supplied, Return to Stock, Kitting buttons work
- [ ] Warehouse nav: verify links directly to Inventory (no dropdown)
- [ ] Receiving: receive an item, then click delete — verify undo works
- [ ] Receiving (Customer Supplied): verify PO/Packing Slip field appears
- [ ] Return to Stock: qty=0 — verify lot marked CONSUMED
- [ ] PO detail: verify Mfg/MPN shows material data when PO line is empty

---

## REV-004 — 2026-04-21

**Released by**: Mark Mankoura
**Migration required**: Yes — 2 migrations:
1. `CreateOrderMaterialSources` — supply source table (all materials default to COMPANY)
2. `CreateBomItemAlternates` — BOM alternate parts table (backfills from legacy alternate_ipn)

**Backup taken**: [ ] (check before deploying)

### Changes

| # | Type | Module | Description |
|---|------|--------|-------------|
| 1 | Feature | Orders | Per-order material supply source (AT&A/Customer toggle on BOM table). All materials default to COMPANY — customer-supplied items explicitly marked. |
| 2 | Feature | MRP | Customer-supplied materials excluded from all shortage views (by-material, by-customer, buildability, requirements) |
| 3 | Feature | MRP | BOM alternates — when primary material is short, checks alternate stock. Shows "Use Alternate" status with IPN and qty to use |
| 4 | Feature | MRP | Shortages "By Material": Order, Customer, Resource Type dropdown filters |
| 5 | Feature | MRP | Requirements tab: Order, Product, Resource Type dropdown filters |
| 6 | Feature | MRP | All Excel exports include Approved MFG and Approved MPN columns (all 5 export types) |
| 7 | Feature | MRP | Shortages export includes Status, Alternate IPN, Alt On Hand, Alt Qty to Use columns |
| 8 | Feature | BOM | BOM item alternates table — add/remove multiple alternates per BOM line with IPN validation |
| 9 | Feature | Warehouse | Customer Supplied Items page with DataTable sorting/filtering |
| 10 | Feature | Production | Material consumption on stage completion — SMT+PCB at SMT, TH+MECH at TH. Consumption preview dialog. |
| 11 | Feature | Production | Order detail: contextual production buttons (Start Kitting, Complete SMT, Complete TH). Auto-syncs order status. |
| 12 | Feature | Production | WIP tracking page shows all active orders including not-started. Status column, sorting/filtering. |
| 13 | Feature | Orders | Customer PO # and WO # columns with sorting/filtering on all columns |
| 14 | Feature | Kitting | Excel export with pick instructions ("USE: alternate IPN" when primary unavailable) |
| 15 | Feature | Kitting | Barcode scan accepts alternate material UIDs |
| 16 | Enhancement | Receiving | PO mode accepts typed PO number. Stock mode silently matches po_reference to existing POs. |
| 17 | Feature | Warehouse | Return to Stock page — scan UID, enter qty, lot qty set to returned amount |
| 18 | Enhancement | Orders | Allocate/Deallocate buttons disable based on existing allocation state |
| 19 | Fix | UI | Breadcrumbs show "Details" instead of UUID |

### Verification Steps

- [ ] MRP By Material: verify Order/Customer/Type filter dropdowns work
- [ ] MRP By Material: verify "Use Alternate" badge for materials with alternates (e.g., 292008 → 292037)
- [ ] MRP Requirements: verify Order/Product/Type filter dropdowns work
- [ ] MRP Excel export: verify Approved MFG/MPN columns present in all exports
- [ ] Order Buildability: verify customer-supplied materials excluded, alternates considered
- [ ] Order detail (ZPU-SM): verify Supply Source column shows AT&A/ORTHOGONE, toggle works
- [ ] Order detail: Start Kitting → verify status changes and units move
- [ ] Order detail: Complete SMT → verify consumption preview and materials consumed
- [ ] Product BOM page: edit a BOM item → verify Alternates section with add/remove
- [ ] WIP Tracking: verify all orders visible including not-started
- [ ] Kitting detail: verify "Pick Instruction" column shows USE alternate when primary short
- [ ] Kitting Excel export: verify pick instruction column
- [ ] Customer Supplied page: verify items listed with sorting/filtering
- [ ] Receiving (PO mode): type PO number manually
- [ ] Return to Stock: scan UID, enter qty → lot qty SET to returned amount
- [ ] Breadcrumbs: verify "Details" shows instead of UUID on detail pages

---

## REV-003 — 2026-04-08

**Released by**: Mark Mankoura
**Migration required**: No
**Backup taken**: [ ] (check before deploying)

### Changes

| # | Type | Module | Description |
|---|------|--------|-------------|
| 1 | Enhancement | Receiving | Replaced complex 11-step receiving form with simplified quick-receive. Three modes: PO (updates qty on order → on hand), Customer Supplied (customer-owned inventory), Stock (free-form with MFG PN, manufacturer, PO reference). No sessions, no AML validation, no inspections — items go straight to ACTIVE @ STOCK. |
| 2 | Enhancement | Receiving | Added "Complete Receiving" button to navigate back to receiving dashboard |
| 3 | Preservation | Receiving | Original sophisticated receiving code saved as `page.v2.tsx` for future re-integration |

### Files Changed

- `erp/backend/src/modules/receiving/dto/quick-receive.dto.ts` — New DTO for quick receive (3 receipt types)
- `erp/backend/src/modules/receiving/receiving.service.ts` — Added `quickReceive()` method
- `erp/backend/src/modules/receiving/receiving.controller.ts` — Added `POST /receiving/quick-receive` endpoint
- `erp/frontend/src/app/receiving/new/page.tsx` — New simplified receiving form
- `erp/frontend/src/app/receiving/new/page.v2.tsx` — Original complex form (preserved)

### Verification Steps

- [ ] Navigate to Warehouse > Receiving > Receive Materials
- [ ] PO mode: select an open PO, enter UID/IPN/Qty/Package, click Receive — verify item appears in receipt log and MRP shows updated on-hand
- [ ] Customer Supplied mode: select a customer, receive an item — verify lot created with customer ownership
- [ ] Stock mode: enter UID/IPN/MFG PN/MFG/Qty/Package/PO Reference, receive — verify lot created
- [ ] Click "Complete Receiving" — verify navigates to /receiving dashboard
- [ ] Attempt duplicate UID — verify error "UID already in use"
- [ ] Attempt invalid IPN — verify error "Material with IPN not found"

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
