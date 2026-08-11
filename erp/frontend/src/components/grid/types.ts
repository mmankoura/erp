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
