"use client"

import { useState, useCallback, useRef, useMemo } from "react"
import {
  useReactTable,
  getCoreRowModel,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
  type ColumnFiltersState,
  getFilteredRowModel,
  flexRender,
} from "@tanstack/react-table"
import { useVirtualizer } from "@tanstack/react-virtual"
import { useApi } from "@/hooks/use-api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
import {
  ArrowUp,
  ArrowDown,
  Search,
  Columns,
  Filter,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"

// Types
interface TransactionRow {
  id: string
  material_id: string
  material: {
    internal_part_number: string
    description: string | null
    customer?: { name: string } | null
  } | null
  transaction_type: string
  quantity: number
  reference_type: string
  reason: string | null
  created_by: string | null
  lot_id: string | null
  lot: { uid: string } | null
  owner_type: string
  owner?: { name: string } | null
  created_at: string
}

interface GridResponse {
  data: TransactionRow[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

const ROW_HEIGHT = 44
const GRID_HEIGHT = 560

// Column filter component
function ColumnFilterPopover({
  column,
  data,
  accessor,
}: {
  column: { getFilterValue: () => unknown; setFilterValue: (val: unknown) => void }
  data: TransactionRow[]
  accessor: (row: TransactionRow) => string
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

// Component
export function RecentTransactionsGrid() {
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [sortColumn, setSortColumn] = useState("date")
  const [sortDirection, setSortDirection] = useState<"ASC" | "DESC">("DESC")
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(value)
    }, 300)
  }, [])

  const handleSort = useCallback((col: string) => {
    if (sortColumn === col) {
      setSortDirection((d) => (d === "ASC" ? "DESC" : "ASC"))
    } else {
      setSortColumn(col)
      setSortDirection("DESC")
    }
  }, [sortColumn])

  const queryParams = new URLSearchParams({
    page: "1",
    pageSize: "10000",
    sortColumn,
    sortDirection,
  })
  if (debouncedSearch) queryParams.set("search", debouncedSearch)

  const { data: response, isLoading } = useApi<GridResponse>(
    `/inventory/transactions/grid?${queryParams.toString()}`
  )

  const tableData = useMemo(() => response?.data ?? [], [response])

  const columnSortId = (col: string) =>
    col === "date" ? "created_at"
      : col === "material" ? "material"
      : col === "type" ? "transaction_type"
      : col === "quantity" ? "quantity"
      : col === "by" ? "created_by"
      : col === "customer" ? "customer"
      : "created_at"

  const columns: ColumnDef<TransactionRow>[] = useMemo(() => [
    {
      id: "created_at",
      header: "Date",
      size: 160,
      accessorFn: (row) => row.created_at,
      cell: ({ row }) => {
        const d = new Date(row.original.created_at)
        return (
          <span className="text-sm tabular-nums whitespace-nowrap">
            {d.toLocaleDateString()} {d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        )
      },
      filterFn: (row, _id, filterValue: string[]) => {
        if (!filterValue?.length) return true
        const d = new Date(row.original.created_at).toLocaleDateString()
        return filterValue.includes(d)
      },
    },
    {
      id: "uid",
      header: "UID",
      size: 150,
      accessorFn: (row) => row.lot?.uid ?? "",
      cell: ({ row }) => (
        <span className="font-mono text-xs">{row.original.lot?.uid ?? "\u2014"}</span>
      ),
      filterFn: (row, _id, filterValue: string[]) => {
        if (!filterValue?.length) return true
        return filterValue.includes(row.original.lot?.uid ?? "")
      },
    },
    {
      id: "customer",
      header: "Customer",
      size: 140,
      accessorFn: (row) => row.material?.customer?.name ?? row.owner?.name ?? "",
      cell: ({ row }) => {
        const name = row.original.material?.customer?.name ?? row.original.owner?.name ?? ""
        return <span className="text-sm truncate block">{name || "\u2014"}</span>
      },
      filterFn: (row, _id, filterValue: string[]) => {
        if (!filterValue?.length) return true
        const name = row.original.material?.customer?.name ?? row.original.owner?.name ?? ""
        return filterValue.includes(name)
      },
    },
    {
      id: "material",
      header: "Material",
      size: 240,
      accessorFn: (row) => row.material?.internal_part_number ?? "",
      cell: ({ row }) => {
        const m = row.original.material
        return (
          <div className="min-w-0">
            <span className="font-medium text-sm">{m?.internal_part_number ?? "\u2014"}</span>
            {m?.description && (
              <p className="text-xs text-muted-foreground truncate">{m.description}</p>
            )}
          </div>
        )
      },
      filterFn: (row, _id, filterValue: string[]) => {
        if (!filterValue?.length) return true
        return filterValue.includes(row.original.material?.internal_part_number ?? "")
      },
    },
    {
      id: "transaction_type",
      header: "Type",
      size: 130,
      accessorFn: (row) => row.transaction_type,
      cell: ({ row }) => {
        const type = row.original.transaction_type
        const isConsumption = type === "CONSUMPTION"
        return (
          <Badge
            variant="outline"
            className={cn(
              "text-xs",
              isConsumption
                ? "bg-red-100 text-red-800 border-red-200"
                : type === "RECEIPT"
                  ? "bg-green-100 text-green-800 border-green-200"
                  : type === "RETURN"
                    ? "bg-blue-100 text-blue-800 border-blue-200"
                    : type === "ADJUSTMENT"
                      ? "bg-yellow-100 text-yellow-800 border-yellow-200"
                      : "bg-gray-100 text-gray-800 border-gray-200"
            )}
          >
            {type}
          </Badge>
        )
      },
      filterFn: (row, _id, filterValue: string[]) => {
        if (!filterValue?.length) return true
        return filterValue.includes(row.original.transaction_type)
      },
    },
    {
      id: "quantity",
      header: "Quantity",
      size: 100,
      accessorFn: (row) => row.quantity,
      cell: ({ row }) => {
        const qty = parseFloat(String(row.original.quantity))
        const isNeg = qty < 0
        return (
          <span className={cn("font-mono text-sm tabular-nums", isNeg && "text-red-600 font-medium")}>
            {qty.toLocaleString()}
          </span>
        )
      },
    },
    {
      id: "created_by",
      header: "By",
      size: 120,
      accessorFn: (row) => row.created_by ?? "",
      cell: ({ row }) => (
        <span className="text-sm truncate block">{row.original.created_by ?? "\u2014"}</span>
      ),
      filterFn: (row, _id, filterValue: string[]) => {
        if (!filterValue?.length) return true
        return filterValue.includes(row.original.created_by ?? "")
      },
    },
  ], [])

  const table = useReactTable({
    data: tableData,
    columns,
    state: { columnVisibility, columnFilters },
    onColumnVisibilityChange: setColumnVisibility,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    manualSorting: true,
  })

  const { rows } = table.getRowModel()
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 15,
  })

  const activeFilterCount = columnFilters.length

  // Accessors for filter popovers
  const filterAccessors: Record<string, (row: TransactionRow) => string> = {
    uid: (row) => row.lot?.uid ?? "",
    customer: (row) => row.material?.customer?.name ?? row.owner?.name ?? "",
    material: (row) => row.material?.internal_part_number ?? "",
    transaction_type: (row) => row.transaction_type,
    created_by: (row) => row.created_by ?? "",
    created_at: (row) => new Date(row.created_at).toLocaleDateString(),
  }

  const sortIdToCol: Record<string, string> = {
    created_at: "date",
    customer: "customer",
    material: "material",
    transaction_type: "type",
    quantity: "quantity",
    created_by: "by",
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">Recent Transactions</CardTitle>
            {activeFilterCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs"
                onClick={() => setColumnFilters([])}
              >
                <X className="h-3 w-3 mr-1" />
                Clear {activeFilterCount} filter{activeFilterCount > 1 ? "s" : ""}
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative w-[250px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search transactions..."
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
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
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {/* Header */}
        <div className="border-t border-b bg-muted/50 flex">
          {table.getHeaderGroups()[0]?.headers.map((header) => {
            const colId = header.column.id
            const colSortKey = sortIdToCol[colId]
            const isSorted = sortColumn === colSortKey
            const isQuantity = colId === "quantity"
            const hasFilter = !!filterAccessors[colId]

            return (
              <div
                key={header.id}
                className={cn(
                  "px-3 py-2 text-xs font-medium text-muted-foreground flex items-center gap-0.5 select-none shrink-0",
                  colSortKey && "cursor-pointer hover:text-foreground",
                  isQuantity && "justify-end"
                )}
                style={{ width: header.getSize(), minWidth: header.getSize() }}
                onClick={() => colSortKey && handleSort(colSortKey)}
              >
                {!isQuantity && (
                  <>
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {colSortKey && (
                      isSorted ? (
                        sortDirection === "ASC" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                      ) : null
                    )}
                    {hasFilter && (
                      <span onClick={(e) => e.stopPropagation()}>
                        <ColumnFilterPopover
                          column={header.column}
                          data={tableData}
                          accessor={filterAccessors[colId]}
                        />
                      </span>
                    )}
                  </>
                )}
                {isQuantity && (
                  <>
                    {colSortKey && (
                      isSorted ? (
                        sortDirection === "ASC" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                      ) : null
                    )}
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </>
                )}
              </div>
            )
          })}
        </div>

        {/* Virtualized rows */}
        <div
          ref={parentRef}
          className="overflow-auto"
          style={{ height: GRID_HEIGHT }}
        >
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
                    const isQuantity = cell.column.id === "quantity"
                    return (
                      <div
                        key={cell.id}
                        className={cn("px-3 py-1.5 shrink-0 overflow-hidden", isQuantity && "text-right")}
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
            <div className="flex items-center justify-center h-40 text-muted-foreground">
              Loading transactions...
            </div>
          )}
          {!isLoading && rows.length === 0 && (
            <div className="flex items-center justify-center h-40 text-muted-foreground">
              No transactions found
            </div>
          )}
        </div>

        {/* Footer */}
        {response && (
          <div className="px-4 py-2 border-t bg-muted/30 text-sm text-muted-foreground">
            {rows.length.toLocaleString()} of {response.total.toLocaleString()} transactions
            {activeFilterCount > 0 && ` (filtered)`}
            {debouncedSearch && ` matching "${debouncedSearch}"`}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
