import type { ReactNode } from "react"

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
  return Math.max(40, String(rowCount).length * 8 + 20)
}
