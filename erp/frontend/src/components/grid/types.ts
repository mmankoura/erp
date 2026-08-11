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

export interface SpreadsheetOptions {
  /** Row-number gutter down the left edge. Default true. */
  rowNumbers?: boolean
  /** Initial state of the filter row. Default true; a saved choice wins. */
  filterRow?: boolean
  /** Namespace for remembering the filter-row toggle in localStorage. */
  storageKey?: string
}

/** Width of the row-number gutter, sized to fit the largest row number. */
export function gutterWidthFor(rowCount: number): number {
  return Math.max(40, String(rowCount).length * 8 + 20)
}
