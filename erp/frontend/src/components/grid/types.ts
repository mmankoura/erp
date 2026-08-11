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
  filterAccessor?: (row: T) => string
}

/** Row height and header height in spreadsheet mode. Both are fixed. */
export const SHEET_ROW_HEIGHT = 26
export const SHEET_HEADER_HEIGHT = 26

export interface SpreadsheetOptions {
  /** Row-number gutter down the left edge. Default true. */
  rowNumbers?: boolean
}

/** Width of the row-number gutter, sized to fit the largest row number. */
export function gutterWidthFor(rowCount: number): number {
  return Math.max(40, String(rowCount).length * 8 + 20)
}
