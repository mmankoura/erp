"use client"

import { useState, useRef, useMemo, useEffect, type ReactNode } from "react"
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
  type ColumnFiltersState,
  type ColumnSizingState,
  flexRender,
} from "@tanstack/react-table"
import { useVirtualizer } from "@tanstack/react-virtual"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ArrowUp, ArrowDown, Search, Columns, X, ListFilter } from "lucide-react"
import { cn } from "@/lib/utils"
import { ColumnFilterPopover } from "@/components/grid/column-filter-popover"
import { FilterRowCell } from "@/components/grid/filter-row"
import {
  SHEET_ROW_HEIGHT,
  SHEET_HEADER_HEIGHT,
  SHEET_FILTER_HEIGHT,
  gutterWidthFor,
  type VirtualGridColumn,
  type SpreadsheetOptions,
  type GridFilterValue,
} from "@/components/grid/types"

export type { VirtualGridColumn } from "@/components/grid/types"

// =============== VirtualGrid Props ===============

interface VirtualGridProps<T> {
  data: T[] | null
  columns: VirtualGridColumn<T>[]
  title?: string
  isLoading?: boolean
  searchPlaceholder?: string
  searchFn?: (row: T, search: string) => boolean
  height?: number
  rowHeight?: number
  headerActions?: ReactNode
  /** Optional per-row className for tinting (e.g., status backgrounds). */
  rowClassName?: (row: T) => string
  /**
   * Fires with the rows in their current displayed order (after the grid's own
   * sorting/filtering). Use this when the parent needs the on-screen order —
   * e.g. shift-click range selection that must match what the user sees.
   */
  onVisibleRowsChange?: (rows: T[]) => void
  /**
   * Stable identity for a row. Without it TanStack falls back to the row's
   * index in the current data array, which changes as rows are sorted or
   * filtered.
   */
  getRowId?: (row: T) => string
  /** Applied to the outer Card — several pages nest this grid in their own. */
  className?: string
  /**
   * Excel-like presentation: fixed 26px rows, gridlines on every cell and a
   * row-number gutter. Cells clip instead of wrapping, so don't turn this on
   * for a grid whose cells rely on multi-line content.
   */
  spreadsheet?: boolean
  spreadsheetOptions?: SpreadsheetOptions
}

// =============== VirtualGrid Component ===============

export function VirtualGrid<T>({
  data,
  columns: gridColumns,
  title,
  isLoading,
  searchPlaceholder = "Search...",
  searchFn,
  height = 560,
  rowHeight: rowHeightProp,
  headerActions,
  rowClassName,
  onVisibleRowsChange,
  getRowId,
  className,
  spreadsheet = false,
  spreadsheetOptions,
}: VirtualGridProps<T>) {
  const rowHeight = rowHeightProp ?? (spreadsheet ? SHEET_ROW_HEIGHT : 44)
  const showRowNumbers = spreadsheet && (spreadsheetOptions?.rowNumbers ?? true)
  const filterRowStorageKey = spreadsheetOptions?.storageKey
  const [filterRowOpen, setFilterRowOpen] = useState(spreadsheetOptions?.filterRow ?? true)
  const [search, setSearch] = useState("")
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({})

  // Convert VirtualGridColumn to TanStack ColumnDef
  // Default: every column is sortable + filterable unless explicitly opted out.
  const tanstackColumns: ColumnDef<T>[] = useMemo(
    () =>
      gridColumns.map((col) => {
        const filterable = col.filterable ?? true
        return {
          id: col.id,
          header: col.header,
          size: col.size ?? 150,
          minSize: 60,
          maxSize: 800,
          enableResizing: true,
          accessorFn: col.accessorFn,
          cell: ({ row }) => col.cell(row.original),
          enableSorting: col.sortable ?? true,
          filterFn: filterable
            ? (row: { original: T }, _id: string, filterValue: GridFilterValue) => {
                const accessor = col.filterAccessor ?? ((r: T) => String(col.accessorFn(r) ?? ""))
                // A list of exact values from the header popover…
                if (Array.isArray(filterValue)) {
                  if (!filterValue.length) return true
                  return filterValue.includes(accessor(row.original))
                }
                // …or a substring from the filter row.
                const needle = filterValue?.contains?.trim().toLowerCase()
                if (!needle) return true
                return accessor(row.original).toLowerCase().includes(needle)
              }
            : undefined,
          meta: { align: col.align },
        }
      }),
    [gridColumns]
  )

  // Global search filter
  const filteredData = useMemo(() => {
    if (!data) return []
    if (!search || !searchFn) return data
    const q = search.toLowerCase()
    return data.filter((row) => searchFn(row, q))
  }, [data, search, searchFn])

  const table = useReactTable({
    data: filteredData,
    columns: tanstackColumns,
    state: { sorting, columnVisibility, columnFilters, columnSizing },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnFiltersChange: setColumnFilters,
    onColumnSizingChange: setColumnSizing,
    // Only override TanStack's index-based default when the caller supplies a
    // real identity — row.id feeds the virtualizer's height cache below.
    ...(getRowId ? { getRowId: (row: T) => getRowId(row) } : {}),
    enableColumnResizing: true,
    columnResizeMode: "onChange",
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  const { rows } = table.getRowModel()
  const parentRef = useRef<HTMLDivElement>(null)

  // Report the on-screen row order to the parent (for selection logic that must
  // follow the sort). Keyed on the ordered ids so it only fires when the
  // displayed order actually changes; a ref keeps the callback fresh without
  // re-firing on every render.
  const onVisibleRowsChangeRef = useRef(onVisibleRowsChange)
  onVisibleRowsChangeRef.current = onVisibleRowsChange
  const orderSignature = useMemo(() => rows.map((r) => r.id).join(","), [rows])
  useEffect(() => {
    onVisibleRowsChangeRef.current?.(rows.map((r) => r.original))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderSignature])

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 15,
    // Key heights by the row's stable id, not by its current index. Without
    // this, sorting reuses the slot's cached height for whatever row now
    // occupies that slot, causing taller rows to overflow into their
    // neighbours.
    getItemKey: (index) => rows[index]?.id ?? index,
    // Dynamic row heights: measure each rendered row so cells with wrapping
    // content (e.g. multi-line ref designators) aren't clipped. Spreadsheet
    // mode is deliberately fixed-height, so measuring is switched off there —
    // this has to go together with dropping the measureElement ref on the row,
    // since attaching that ref is what triggers a measurement.
    measureElement:
      !spreadsheet && typeof window !== "undefined"
        ? (el) => el?.getBoundingClientRect().height ?? rowHeight
        : undefined,
  })

  // Read the saved toggle after mount, not in the useState initializer —
  // localStorage isn't there during SSR and reading it inline mismatches the
  // hydrated markup.
  useEffect(() => {
    if (!filterRowStorageKey) return
    const saved = window.localStorage.getItem(`vgrid:${filterRowStorageKey}:filterRow`)
    if (saved !== null) setFilterRowOpen(saved === "1")
  }, [filterRowStorageKey])

  const toggleFilterRow = () => {
    setFilterRowOpen((open) => {
      const next = !open
      if (filterRowStorageKey) {
        window.localStorage.setItem(`vgrid:${filterRowStorageKey}:filterRow`, next ? "1" : "0")
      }
      return next
    })
  }

  const activeFilterCount = columnFilters.length
  const gutterWidth = showRowNumbers ? gutterWidthFor(rows.length) : 0
  const showFilterRow = spreadsheet && filterRowOpen

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {title && <CardTitle className="text-lg">{title}</CardTitle>}
            {activeFilterCount > 0 && (
              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setColumnFilters([])}>
                <X className="h-3 w-3 mr-1" />
                Clear {activeFilterCount} filter{activeFilterCount > 1 ? "s" : ""}
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {searchFn && (
              <div className="relative w-[250px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={searchPlaceholder}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
              </div>
            )}
            {spreadsheet && (
              <Button
                variant={filterRowOpen ? "secondary" : "outline"}
                size="sm"
                className="h-8"
                onClick={toggleFilterRow}
                title={filterRowOpen ? "Hide the filter row" : "Show the filter row"}
              >
                <ListFilter className="h-4 w-4 mr-1" />
                Filters
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8">
                  <Columns className="h-4 w-4 mr-1" />
                  Columns
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {table.getAllLeafColumns().map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) => column.toggleVisibility(!!value)}
                  >
                    {typeof column.columnDef.header === "string" ? column.columnDef.header : column.id}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {headerActions}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div ref={parentRef} className="overflow-auto" style={{ height }}>
          {/* The shim gives header and rows one shared width so they scroll
              together. The gutter is not a TanStack column, so its width has to
              be added here or the last column clips at the right edge. */}
          <div style={{ minWidth: `${table.getTotalSize() + gutterWidth}px` }}>
        {/* Header */}
        <div
          className="border-t border-b bg-muted flex sticky top-0 z-10"
          style={spreadsheet ? { height: SHEET_HEADER_HEIGHT } : undefined}
        >
          {showRowNumbers && (
            <div
              className="sticky left-0 z-20 shrink-0 bg-muted border-r border-border h-full"
              style={{ width: gutterWidth, minWidth: gutterWidth }}
            />
          )}
          {table.getHeaderGroups()[0]?.headers.map((header) => {
            const col = gridColumns.find((c) => c.id === header.column.id)
            const align = col?.align
            const canSort = header.column.getCanSort()
            const canFilter = !!header.column.getFilterFn()
            const filterAccessor = col?.filterAccessor ?? ((r: T) => String(col?.accessorFn(r) ?? ""))
            const isResizing = header.column.getIsResizing()

            return (
              <div
                key={header.id}
                className={cn(
                  "text-muted-foreground flex items-center gap-0.5 select-none shrink-0 relative",
                  spreadsheet
                    ? "px-2 h-full text-[11px] font-semibold border-r border-border"
                    : "px-3 py-2 text-xs font-medium",
                  canSort && "cursor-pointer hover:text-foreground",
                  align === "right" && "justify-end"
                )}
                style={{ width: header.getSize(), minWidth: header.getSize() }}
                onClick={() => canSort && header.column.toggleSorting()}
              >
                {align !== "right" && (
                  <>
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {canSort && header.column.getIsSorted() === "asc" && <ArrowUp className="h-3 w-3" />}
                    {canSort && header.column.getIsSorted() === "desc" && <ArrowDown className="h-3 w-3" />}
                    {canFilter && (
                      <span onClick={(e) => e.stopPropagation()}>
                        <ColumnFilterPopover
                          column={header.column}
                          data={filteredData}
                          accessor={filterAccessor}
                        />
                      </span>
                    )}
                  </>
                )}
                {align === "right" && (
                  <>
                    {canSort && header.column.getIsSorted() === "asc" && <ArrowUp className="h-3 w-3" />}
                    {canSort && header.column.getIsSorted() === "desc" && <ArrowDown className="h-3 w-3" />}
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </>
                )}
                {/* Resize handle */}
                <div
                  onMouseDown={(e) => {
                    e.stopPropagation()
                    header.getResizeHandler()(e)
                  }}
                  onTouchStart={(e) => {
                    e.stopPropagation()
                    header.getResizeHandler()(e)
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className={cn(
                    "absolute right-0 top-0 h-full w-1 cursor-col-resize select-none touch-none hover:bg-primary/60 transition-colors",
                    isResizing && "bg-primary"
                  )}
                />
              </div>
            )
          })}
        </div>

        {/* Filter row — a second sticky band, offset by the header's fixed
            height. Opaque for the same reason the header is: rows scroll
            underneath it. */}
        {showFilterRow && (
          <div
            className="flex sticky z-10 bg-background border-b border-border"
            style={{ top: SHEET_HEADER_HEIGHT, height: SHEET_FILTER_HEIGHT }}
          >
            {showRowNumbers && (
              <div
                className="sticky left-0 z-20 shrink-0 bg-muted border-r border-border h-full"
                style={{ width: gutterWidth, minWidth: gutterWidth }}
              />
            )}
            {table.getHeaderGroups()[0]?.headers.map((header) => (
              <FilterRowCell
                key={header.id}
                column={header.column}
                width={header.getSize()}
                disabled={!header.column.getFilterFn()}
              />
            ))}
          </div>
        )}

        {/* Virtualized rows */}
        <div style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const row = rows[virtualRow.index]
              return (
                <div
                  key={row.id}
                  data-index={virtualRow.index}
                  ref={spreadsheet ? undefined : virtualizer.measureElement}
                  className={cn(
                    "flex border-b hover:bg-muted/30 transition-colors",
                    spreadsheet ? "border-border items-center" : "items-stretch",
                    rowClassName?.(row.original),
                  )}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    ...(spreadsheet
                      ? { height: `${rowHeight}px` }
                      : { minHeight: `${rowHeight}px` }),
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  {showRowNumbers && (
                    <div
                      className="sticky left-0 z-[1] shrink-0 bg-muted border-r border-border h-full flex items-center justify-end px-1.5 text-[11px] text-muted-foreground tabular-nums select-none"
                      style={{ width: gutterWidth, minWidth: gutterWidth }}
                    >
                      {virtualRow.index + 1}
                    </div>
                  )}
                  {row.getVisibleCells().map((cell) => {
                    const colDef = gridColumns.find((c) => c.id === cell.column.id)
                    const rendered = flexRender(cell.column.columnDef.cell, cell.getContext())
                    return (
                      <div
                        key={cell.id}
                        className={cn(
                          "shrink-0 overflow-hidden",
                          spreadsheet
                            ? "px-2 h-full flex items-center border-r border-border text-xs"
                            : "px-3 py-2 self-center",
                          colDef?.align === "right" && (spreadsheet ? "justify-end text-right" : "text-right")
                        )}
                        style={{ width: cell.column.getSize(), minWidth: cell.column.getSize() }}
                      >
                        {/* truncate has to sit on a block child — on the flex
                            container itself it does nothing. */}
                        {spreadsheet ? <div className="truncate w-full">{rendered}</div> : rendered}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>

          {isLoading && rows.length === 0 && (
            <div className="flex items-center justify-center h-40 text-muted-foreground">Loading...</div>
          )}
          {!isLoading && rows.length === 0 && (
            <div className="flex items-center justify-center h-40 text-muted-foreground">No data found</div>
          )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t bg-muted/30 text-sm text-muted-foreground">
          {rows.length.toLocaleString()}{rows.length !== (data?.length ?? 0) ? ` of ${(data?.length ?? 0).toLocaleString()}` : ""} rows
          {activeFilterCount > 0 && " (filtered)"}
          {search && ` matching "${search}"`}
        </div>
      </CardContent>
    </Card>
  )
}
