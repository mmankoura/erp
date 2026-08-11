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
import { ArrowUp, ArrowDown, Search, Columns, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { ColumnFilterPopover } from "@/components/grid/column-filter-popover"
import type { VirtualGridColumn } from "@/components/grid/types"

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
  rowHeight = 44,
  headerActions,
  rowClassName,
  onVisibleRowsChange,
  getRowId,
  className,
}: VirtualGridProps<T>) {
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
            ? (row: { original: T }, _id: string, filterValue: string[]) => {
                if (!filterValue?.length) return true
                const accessor = col.filterAccessor ?? ((r: T) => String(col.accessorFn(r) ?? ""))
                return filterValue.includes(accessor(row.original))
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
    // content (e.g. multi-line ref designators) aren't clipped.
    measureElement:
      typeof window !== "undefined"
        ? (el) => el?.getBoundingClientRect().height ?? rowHeight
        : undefined,
  })

  const activeFilterCount = columnFilters.length

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
          <div style={{ minWidth: `${table.getTotalSize()}px` }}>
        {/* Header */}
        <div className="border-t border-b bg-muted flex sticky top-0 z-10">
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
                  "px-3 py-2 text-xs font-medium text-muted-foreground flex items-center gap-0.5 select-none shrink-0 relative",
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

        {/* Virtualized rows */}
        <div style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const row = rows[virtualRow.index]
              return (
                <div
                  key={row.id}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  className={cn(
                    "flex border-b hover:bg-muted/30 transition-colors items-stretch",
                    rowClassName?.(row.original),
                  )}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    minHeight: `${rowHeight}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  {row.getVisibleCells().map((cell) => {
                    const colDef = gridColumns.find((c) => c.id === cell.column.id)
                    return (
                      <div
                        key={cell.id}
                        className={cn(
                          "px-3 py-2 shrink-0 self-center overflow-hidden",
                          colDef?.align === "right" && "text-right"
                        )}
                        style={{ width: cell.column.getSize(), minWidth: cell.column.getSize() }}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
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
