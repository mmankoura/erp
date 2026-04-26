"use client"

import { useState, useRef, useMemo, type ReactNode } from "react"
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
  type ColumnFiltersState,
  flexRender,
} from "@tanstack/react-table"
import { useVirtualizer } from "@tanstack/react-virtual"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ArrowUp, ArrowDown, Search, Columns, Filter, X } from "lucide-react"
import { cn } from "@/lib/utils"

// =============== Column Filter Popover ===============

function ColumnFilterPopover<T>({
  column,
  data,
  accessor,
}: {
  column: { getFilterValue: () => unknown; setFilterValue: (val: unknown) => void }
  data: T[]
  accessor: (row: T) => string
}) {
  const [filterSearch, setFilterSearch] = useState("")
  const allValues = useMemo(() => {
    const vals = new Set<string>()
    data.forEach((row) => {
      const v = accessor(row)
      if (v) vals.add(v)
    })
    return Array.from(vals).sort()
  }, [data, accessor])

  const filteredValues = filterSearch
    ? allValues.filter((v) => v.toLowerCase().includes(filterSearch.toLowerCase()))
    : allValues

  const selectedValues = (column.getFilterValue() as string[] | undefined) ?? []
  const isFiltered = selectedValues.length > 0

  const toggleValue = (val: string) => {
    const current = selectedValues
    if (current.includes(val)) {
      const next = current.filter((v) => v !== val)
      column.setFilterValue(next.length > 0 ? next : undefined)
    } else {
      column.setFilterValue([...current, val])
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className={cn("ml-1", isFiltered ? "text-primary" : "text-muted-foreground/50 hover:text-muted-foreground")}>
          <Filter className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-2" align="start">
        {allValues.length > 8 && (
          <Input
            placeholder="Search..."
            value={filterSearch}
            onChange={(e) => setFilterSearch(e.target.value)}
            className="h-7 text-xs mb-2"
          />
        )}
        <div className="max-h-[200px] overflow-auto space-y-1">
          {filteredValues.map((val) => (
            <label key={val} className="flex items-center gap-2 px-1 py-0.5 text-xs hover:bg-muted rounded cursor-pointer">
              <Checkbox
                checked={selectedValues.includes(val)}
                onCheckedChange={() => toggleValue(val)}
                className="h-3.5 w-3.5"
              />
              {val}
            </label>
          ))}
        </div>
        <div className="flex gap-1 mt-2 pt-2 border-t">
          <Button variant="ghost" size="sm" className="h-6 text-xs flex-1" onClick={() => column.setFilterValue(allValues)}>
            All
          </Button>
          <Button variant="ghost" size="sm" className="h-6 text-xs flex-1" onClick={() => column.setFilterValue(undefined)}>
            Clear
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

// =============== VirtualGrid Props ===============

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
}: VirtualGridProps<T>) {
  const [search, setSearch] = useState("")
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])

  // Convert VirtualGridColumn to TanStack ColumnDef
  const tanstackColumns: ColumnDef<T>[] = useMemo(
    () =>
      gridColumns.map((col) => ({
        id: col.id,
        header: col.header,
        size: col.size ?? 150,
        accessorFn: col.accessorFn,
        cell: ({ row }) => col.cell(row.original),
        enableSorting: col.sortable ?? false,
        filterFn: col.filterable
          ? (row: { original: T }, _id: string, filterValue: string[]) => {
              if (!filterValue?.length) return true
              const accessor = col.filterAccessor ?? ((r: T) => String(col.accessorFn(r)))
              return filterValue.includes(accessor(row.original))
            }
          : undefined,
        meta: { align: col.align },
      })),
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
    state: { sorting, columnVisibility, columnFilters },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  const { rows } = table.getRowModel()
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 15,
  })

  const activeFilterCount = columnFilters.length

  return (
    <Card>
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
        {/* Header */}
        <div className="border-t border-b bg-muted/50 flex">
          {table.getHeaderGroups()[0]?.headers.map((header) => {
            const col = gridColumns.find((c) => c.id === header.column.id)
            const align = col?.align
            const canSort = col?.sortable
            const canFilter = col?.filterable && col.filterAccessor

            return (
              <div
                key={header.id}
                className={cn(
                  "px-3 py-2 text-xs font-medium text-muted-foreground flex items-center gap-0.5 select-none shrink-0",
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
                          accessor={col!.filterAccessor!}
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
              </div>
            )
          })}
        </div>

        {/* Virtualized rows */}
        <div ref={parentRef} className="overflow-auto" style={{ height }}>
          <div style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const row = rows[virtualRow.index]
              return (
                <div
                  key={row.id}
                  className="flex border-b hover:bg-muted/30 transition-colors items-center"
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  {row.getVisibleCells().map((cell) => {
                    const colDef = gridColumns.find((c) => c.id === cell.column.id)
                    return (
                      <div
                        key={cell.id}
                        className={cn("px-3 py-1.5 shrink-0 overflow-hidden", colDef?.align === "right" && "text-right")}
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
