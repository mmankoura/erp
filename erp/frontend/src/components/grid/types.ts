import type { ReactNode } from "react"
import type { AggregateKind } from "./aggregate"

/**
 * A column in a {@link VirtualGrid}.
 *
 * `accessorFn` returns the raw value used for sorting and, by default, for
 * filtering; `cell` returns what the user actually sees. The two are kept
 * separate so a column can sort on a timestamp while rendering a locale date.
 */
export interface VirtualGridColumn<T> {
  id: string
  header: string
  size?: number
  align?: "left" | "right"
  accessorFn: (row: T) => unknown
  cell: (row: T) => ReactNode
  sortable?: boolean
  filterable?: boolean
  /** Drag-to-resize. Default true. */
  resizable?: boolean
  filterAccessor?: (row: T) => string
  /**
   * What Ctrl+C writes for this cell. Defaults to `accessorFn`, which is the
   * raw value — `9875`, not `9,875`, so Excel receives a number and a
   * copy-paste round trip inside the grid is lossless. Override where the
   * display form is the meaningful one (a date, say, whose accessor is an ISO
   * timestamp).
   */
  copyValue?: (row: T) => string
  /** Present means the column can be typed into, once editing is unlocked. */
  edit?: ColumnEditConfig<T>
  /**
   * Show an aggregate for this column in the totals row. Opt-in per column, and
   * a grid where no column opts in renders no footer at all.
   *
   * Computed over the filtered rows — see `aggregate.ts`.
   */
  aggregate?: AggregateKind
}

/** The value Ctrl+C writes for one cell. */
export function copyValueOf<T>(col: VirtualGridColumn<T>, row: T): string {
  if (col.copyValue) return col.copyValue(row)
  const raw = col.accessorFn(row)
  return raw === null || raw === undefined ? "" : String(raw)
}

/** Row, header and filter-row heights in spreadsheet mode. All fixed. */
export const SHEET_ROW_HEIGHT = 26
export const SHEET_HEADER_HEIGHT = 26
export const SHEET_FILTER_HEIGHT = 24

/**
 * A column filter is either a set of exact values (what the header's funnel
 * popover writes) or a substring (what the filter row writes). One column holds
 * one or the other, never both.
 */
export type GridFilterValue = string[] | { contains: string }

/** A cell, addressed by identity rather than by position. */
export interface CellAddr {
  rowId: string
  colId: string
}

/** The selected rectangle, in row/column indices within the current view. */
export interface SelectionRect {
  r0: number
  r1: number
  c0: number
  c1: number
}

export interface SpreadsheetOptions<T> {
  /**
   * The cell cursor, range selection, Ctrl+C and paste. Default true — it is
   * most of what spreadsheet mode is for.
   *
   * Set false for a grid whose page already owns the arrow keys. The grid's key
   * handler calls `preventDefault` but not `stopPropagation`, so on a page with
   * its own keyboard model both handlers run and one ArrowDown moves two
   * things. Turning the cursor off keeps the presentation — fixed rows,
   * gridlines, the row-number gutter, the filter row — and leaves the keyboard
   * to the page.
   */
  cellCursor?: boolean
  /**
   * Keep the first N columns in place while the rest scroll sideways, so a wide
   * grid doesn't lose the column that says which record you are looking at.
   *
   * Counts *visible* columns, so hiding one doesn't silently freeze a different
   * one. Capped at runtime — see `frozenOffsets` — because a freeze wider than
   * the viewport leaves nothing to scroll.
   */
  frozenColumns?: number
  /** Row-number gutter down the left edge. Default true. */
  rowNumbers?: boolean
  /** Initial state of the filter row. Default true; a saved choice wins. */
  filterRow?: boolean
  /**
   * Master gate for typing into cells. Pages drive this from their own
   * edit-unlock toggle, so the grid is read-only until the user asks for it.
   */
  editable?: boolean
  /**
   * Persist a batch of edits. Batched rather than per-cell because one row's
   * changed fields usually belong in one request.
   */
  onCommit?: (edits: CellEdit<T>[]) => Promise<CellCommitResult[]>
  /** Called (debounced) after at least one edit saved, to refetch. */
  onAfterCommit?: () => void
  /** Paste sizes above this ask for confirmation first. Default 50 cells. */
  pasteConfirmThreshold?: number
}

// =============== Editing ===============

export type EditorSpec =
  | { kind: "text"; maxLength?: number }
  | { kind: "number"; min?: number; max?: number; decimals?: number }
  | { kind: "select"; options: readonly string[]; normalize?: (raw: string) => string }

export interface ColumnEditConfig<T> {
  /**
   * The raw editable value, deliberately separate from `cell` — that one
   * returns a ReactNode, and an editor needs something to put in an input.
   */
  getValue: (row: T) => string | number | null
  editor: EditorSpec
  /** Per-row guard. `true` to allow; a string is the reason it is refused. */
  isEditable?: (row: T) => true | string
  /** Overrides the editor's default parsing. */
  parse?: (raw: string, row: T) => { value: unknown } | { error: string }
  /** Field name in the payload. Defaults to the column id. */
  field?: string
  /**
   * Always confirm before a paste writes this column, whatever the size of the
   * paste. For fields where a wrong bulk write is expensive to undo.
   */
  confirmOnPaste?: boolean
}

export interface CellEdit<T> {
  rowId: string
  row: T
  columnId: string
  field: string
  raw: string
  value: unknown
  previous: string | number | null
}

export type CellCommitResult =
  | { rowId: string; columnId: string; ok: true }
  | { rowId: string; columnId: string; ok: false; error: string }

/** Identifies one cell. Row and column ids never contain this separator. */
export const CELL_KEY_SEPARATOR = "::"

export function cellKey(rowId: string, colId: string): string {
  return `${rowId}${CELL_KEY_SEPARATOR}${colId}`
}

export function parseCellKey(key: string): { rowId: string; colId: string } {
  const at = key.indexOf(CELL_KEY_SEPARATOR)
  return { rowId: key.slice(0, at), colId: key.slice(at + CELL_KEY_SEPARATOR.length) }
}

/**
 * Turn what the user typed into what the API wants. Mirroring the server's
 * bounds here means a bad value is refused inline instead of costing a round
 * trip and coming back as an anonymous 400.
 */
export function parseCellInput(
  spec: EditorSpec,
  raw: string
): { value: unknown } | { error: string } {
  const trimmed = raw.trim()

  switch (spec.kind) {
    case "text": {
      if (spec.maxLength && trimmed.length > spec.maxLength) {
        return { error: `Longer than ${spec.maxLength} characters` }
      }
      return { value: trimmed === "" ? null : trimmed }
    }
    case "number": {
      if (trimmed === "") return { error: "Enter a number" }
      // Accept what a spreadsheet would paste.
      const cleaned = trimmed.replace(/,/g, "")
      if (!/^-?\d*\.?\d+$/.test(cleaned)) return { error: `"${trimmed}" is not a number` }
      const value = Number(cleaned)
      if (!Number.isFinite(value)) return { error: `"${trimmed}" is not a number` }
      if (spec.min !== undefined && value < spec.min) return { error: `Must be at least ${spec.min}` }
      if (spec.max !== undefined && value > spec.max) return { error: `Must be at most ${spec.max}` }
      if (spec.decimals !== undefined) {
        const decimals = cleaned.split(".")[1]?.length ?? 0
        if (decimals > spec.decimals) {
          return { error: `At most ${spec.decimals} decimal places` }
        }
      }
      return { value }
    }
    case "select": {
      if (trimmed === "") return { error: "Pick a value" }
      const normalized = spec.normalize ? spec.normalize(trimmed) : trimmed
      if (!spec.options.includes(normalized)) {
        return { error: `Must be one of ${spec.options.join(", ")}` }
      }
      return { value: normalized }
    }
  }
}

/** Width of the row-number gutter, sized to fit the largest row number. */
export function gutterWidthFor(rowCount: number): number {
  // The extra room over the bare digits is for the status stripe down the
  // left edge.
  return Math.max(44, String(rowCount).length * 8 + 24)
}

/**
 * Where each frozen column has to be pinned: the gutter's width plus the widths
 * of the frozen columns to its left. One entry per column, `null` for the ones
 * that scroll.
 *
 * The count is capped so the frozen block can never exceed `maxRatio` of the
 * viewport. A freeze wider than the scrollport is not a cosmetic problem —
 * there would be nothing left to scroll, and the columns the user was trying to
 * reach become unreachable. Honouring less of the request is better than
 * breaking the grid.
 */
export function frozenOffsets({
  count,
  widths,
  gutterWidth,
  viewportWidth,
  maxRatio = 0.6,
}: {
  count: number
  widths: number[]
  gutterWidth: number
  viewportWidth: number
  maxRatio?: number
}): (number | null)[] {
  const offsets: (number | null)[] = widths.map(() => null)
  if (count <= 0) return offsets

  // Before the first measurement the viewport reads 0; freeze as asked rather
  // than collapsing to nothing for one frame.
  const budget = viewportWidth > 0 ? viewportWidth * maxRatio - gutterWidth : Infinity
  let running = gutterWidth
  let used = 0

  for (let i = 0; i < Math.min(count, widths.length); i++) {
    // The first column is always allowed: a grid whose identity column alone
    // exceeds the budget is still better off pinning it than pinning nothing.
    if (i > 0 && used + widths[i] > budget) break
    offsets[i] = running
    running += widths[i]
    used += widths[i]
  }
  return offsets
}

/** Width of the stripe-only rail shown when there are no row numbers. */
export const STRIPE_RAIL_WIDTH = 4

/**
 * A status stripe painted down the left edge of the gutter. `color` is a
 * background utility (`"bg-amber-500"`); `label` becomes the gutter's tooltip,
 * so the colour is discoverable rather than folklore.
 *
 * This is where row status belongs in a sheet: the cell background is the
 * selection's, and a left border on the row itself would sit underneath the
 * sticky gutter and vanish as soon as the grid is scrolled sideways.
 */
export type RowStripe = { color: string; label?: string } | null

/**
 * Sorting and global search happen on the server. The grid stops doing its own
 * — it renders the header arrows from `sort` and reports clicks rather than
 * acting on them.
 *
 * Column filters and the filter row stay client-side, over the rows actually
 * loaded. That's a real distinction on a windowed endpoint: the search box
 * reaches the whole table, the filter row only reaches what's in front of you.
 * Set `totalRows` so the footer can say so.
 */
export interface ServerGridOptions {
  sort: { columnId: string; desc: boolean } | null
  onSortChange: (next: { columnId: string; desc: boolean } | null) => void
  /** Debounced by the grid. Omit to keep the search box client-side. */
  onSearchChange?: (search: string) => void
  searchDebounceMs?: number
  /** Row count on the server, for the footer. */
  totalRows?: number
}
