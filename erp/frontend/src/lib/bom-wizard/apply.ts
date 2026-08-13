/**
 * The pure transformation core.
 *
 * Every function here is `(grid, params) => grid` with no side effects, no
 * React and no DOM, so the whole engine is testable against real customer files
 * and could be lifted to the server unchanged if headless replay is ever wanted.
 * Rows are copied on write: an action that touches 176 of 375 rows shares the
 * other 199 rather than cloning the matrix.
 */

import type {
  ColumnId,
  GridAction,
  WizardColumn,
  WizardGrid,
  WizardRow,
  WizardSource,
} from "./types"

const blank = (v: string | undefined): boolean => !v || v.trim() === ""

/** Build the initial grid: F1..Fn columns, one row per source row, nothing mapped. */
export function gridFromSource(source: WizardSource): WizardGrid {
  const width = source.matrix.reduce((w, r) => Math.max(w, r.length), 0)
  const columns: WizardColumn[] = Array.from({ length: width }, (_, i) => ({
    id: `F${i + 1}`,
    label: `F${i + 1}`,
  }))

  const rows: WizardRow[] = source.matrix.map((cells, srcIndex) => {
    const record: Record<ColumnId, string> = {}
    columns.forEach((col, i) => {
      record[col.id] = (cells[i] ?? "").trim()
    })
    return { srcIndex, cells: record }
  })

  return { columns, rows, mapping: {}, headerRowIndex: null }
}

/**
 * Promote a source row to column headers.
 *
 * The row is addressed by `srcIndex`, not by position, so this still points at
 * the right row after an earlier action deleted rows above it.
 */
function mapRowToHeaders(
  grid: WizardGrid,
  row: number,
  deleteRow: boolean,
): WizardGrid {
  const headerRow = grid.rows.find((r) => r.srcIndex === row)
  if (!headerRow) return grid

  const columns = grid.columns.map((col) => {
    const text = headerRow.cells[col.id]
    return blank(text) ? col : { ...col, label: text.trim() }
  })

  return {
    ...grid,
    columns,
    headerRowIndex: row,
    rows: deleteRow ? grid.rows.filter((r) => r.srcIndex !== row) : grid.rows,
  }
}

/**
 * Propagate values downward into blank cells.
 *
 * With no anchor this is Excel's fill-down: a blank cell inherits the nearest
 * non-blank value above it.
 *
 * The anchor exists because a blank cell means two different things in a real
 * BOM. In the AEGIS files a row whose Item cell is blank is a *continuation* —
 * its other blanks should inherit. But a row whose Item cell is filled is a new
 * part, and its blanks are genuinely empty: SAPIN items 206 and 207 have no
 * reference designators at all, and filling them from the row above would
 * invent designators that aren't in the customer's file. So a non-blank anchor
 * starts a new carry, and that row is left exactly as the customer wrote it.
 */
function fillDown(
  grid: WizardGrid,
  columns: ColumnId[],
  anchorColumn?: ColumnId,
): WizardGrid {
  const targets = columns.filter((c) => c !== anchorColumn)
  if (targets.length === 0) return grid

  const carry: Record<ColumnId, string> = {}
  let touched = false

  const rows = grid.rows.map((row) => {
    const startsNewItem = anchorColumn ? !blank(row.cells[anchorColumn]) : false
    let next: WizardRow | null = null

    for (const col of targets) {
      const value = row.cells[col]

      if (startsNewItem) {
        // Authoritative, even when blank — do not fill, just reset the carry.
        carry[col] = value
        continue
      }
      if (!blank(value)) {
        carry[col] = value
        continue
      }
      if (!blank(carry[col])) {
        next ??= { ...row, cells: { ...row.cells } }
        next.cells[col] = carry[col]
      }
    }

    if (next) touched = true
    return next ?? row
  })

  return touched ? { ...grid, rows } : grid
}

/** Split a designator cell into tokens, dropping the empties that trailing separators leave behind. */
function tokenize(cell: string, separator: string): string[] {
  return cell
    .split(separator)
    .map((t) => t.trim())
    .filter((t) => t !== "")
}

/**
 * Collapse a lead row and the continuation rows beneath it, concatenating one
 * column across them.
 *
 * A row continues the one above it when its key is **blank** — which is how the
 * real customer files wrap a long designator list — or when it **repeats** the
 * lead's key, which is the other convention in the wild. Supporting both means
 * this works whether or not `fill_down` has already run, so the two actions can
 * be applied in either order.
 *
 * Two rules here are load-bearing, and the existing importer gets both wrong:
 *
 * 1. **Adjacent runs only, never a global group-by.** "Do Not Populate" is the
 *    part number on 17 separate lines in one real file and 16 in another.
 *    Grouping by part number fuses them into a single line and loses sixteen
 *    genuine BOM entries. Key on the Item column, and only absorb rows that are
 *    actually next to each other.
 *
 * 2. **Quantity is not summed.** Every row in a run carries the same quantity
 *    once fill-down has run, so summing an 8-row run turns 39 into 312. The
 *    lead row's value is the customer's stated quantity and is kept verbatim;
 *    whether it agrees with the designator count is a question for `validate`,
 *    not a licence to rewrite it.
 */
function mergeReferences(
  grid: WizardGrid,
  keyColumns: ColumnId[],
  mergeColumn: ColumnId,
  separator: string,
  joinWith: string,
  dedupe: boolean,
): WizardGrid {
  if (keyColumns.length === 0) return grid

  const keyless = (r: WizardRow): boolean =>
    keyColumns.every((c) => blank(r.cells[c]))

  const sameKey = (a: WizardRow, b: WizardRow): boolean =>
    keyColumns.every((c) => a.cells[c].trim() === b.cells[c].trim())

  const rows: WizardRow[] = []
  let i = 0

  while (i < grid.rows.length) {
    const lead = grid.rows[i]
    let j = i + 1

    // A run only ever starts at a row that has a key of its own; a keyless row
    // with nothing above it to attach to is left exactly where it is.
    if (!keyless(lead)) {
      while (
        j < grid.rows.length &&
        (keyless(grid.rows[j]) || sameKey(grid.rows[j], lead))
      ) {
        j++
      }
    }

    if (j === i + 1) {
      rows.push(lead)
      i = j
      continue
    }

    const tokens: string[] = []
    for (let k = i; k < j; k++) {
      tokens.push(...tokenize(grid.rows[k].cells[mergeColumn], separator))
    }
    const joined = dedupe ? Array.from(new Set(tokens)) : tokens

    rows.push({
      ...lead,
      cells: { ...lead.cells, [mergeColumn]: joined.join(joinWith) },
      mergedFrom: grid.rows.slice(i + 1, j).map((r) => r.srcIndex),
    })
    i = j
  }

  return rows.length === grid.rows.length ? grid : { ...grid, rows }
}

function deleteRows(grid: WizardGrid, rows: number[]): WizardGrid {
  const drop = new Set(rows)
  const kept = grid.rows.filter((r) => !drop.has(r.srcIndex))
  return kept.length === grid.rows.length ? grid : { ...grid, rows: kept }
}

/**
 * Remove columns from view.
 *
 * The ids are retired, never renumbered — F4 stays F4 after F3 is deleted — so
 * an action recorded earlier still addresses the column it was recorded against.
 * Cell data for the removed column is dropped along with it; replaying from
 * source is what brings it back on undo.
 */
function deleteColumns(grid: WizardGrid, columns: ColumnId[]): WizardGrid {
  const drop = new Set(columns)
  const kept = grid.columns.filter((c) => !drop.has(c.id))
  if (kept.length === grid.columns.length) return grid

  const mapping = { ...grid.mapping }
  for (const id of drop) delete mapping[id]

  return {
    ...grid,
    columns: kept,
    mapping,
    rows: grid.rows.map((row) => {
      const cells: Record<ColumnId, string> = {}
      for (const col of kept) cells[col.id] = row.cells[col.id]
      return { ...row, cells }
    }),
  }
}

/** Fold one action over the grid. Returns the same object when nothing changed, so React can skip re-renders. */
export function applyAction(grid: WizardGrid, action: GridAction): WizardGrid {
  switch (action.type) {
    case "map_row_to_headers":
      return mapRowToHeaders(grid, action.row, action.deleteRow)
    case "set_column_mapping":
      return { ...grid, mapping: { ...action.mapping } }
    case "fill_down":
      return fillDown(grid, action.columns, action.anchorColumn)
    case "merge_references":
      return mergeReferences(
        grid,
        action.keyColumns,
        action.mergeColumn,
        action.separator,
        action.joinWith,
        action.dedupe,
      )
    case "delete_rows":
      return deleteRows(grid, action.rows)
    case "delete_columns":
      return deleteColumns(grid, action.columns)
  }
}

/** Fold a prefix of the action list over the source. This is the only way the displayed grid is ever produced. */
export function replay(
  source: WizardSource,
  actions: GridAction[],
  upTo: number = actions.length,
): WizardGrid {
  let grid = gridFromSource(source)
  for (let i = 0; i < upTo && i < actions.length; i++) {
    grid = applyAction(grid, actions[i])
  }
  return grid
}

/** Look up the raw column currently mapped to a BOM field, if any. */
export function columnFor(
  grid: WizardGrid,
  field: string,
): ColumnId | undefined {
  return grid.columns.find((c) => grid.mapping[c.id] === field)?.id
}
