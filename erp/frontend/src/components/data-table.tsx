"use client"

import * as React from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
// ScrollArea from Radix doesn't work well with max-h constraints in popovers,
// so we use a plain div with overflow-y-auto for the filter list.
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Settings2,
  GripVertical,
  RotateCcw,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  ListFilter,
  X,
  Check,
} from "lucide-react"

export interface Column<T> {
  key: string
  header: string
  cell?: (item: T) => React.ReactNode
  sortable?: boolean
  sortAccessor?: (item: T) => string | number | null
  filterable?: boolean
  filterAccessor?: (item: T) => string
  className?: string
  defaultWidth?: number
  minWidth?: number
  maxWidth?: number
  defaultVisible?: boolean
  resizable?: boolean
}

interface ColumnSettings {
  visible: boolean
  width: number
}

// Per-column filter state
interface ColumnFilterState {
  text: string
  selectedValues: Set<string> | null // null = all selected (no filter)
}

interface DataTableProps<T> {
  data: T[] | null
  columns: Column<T>[]
  isLoading?: boolean
  searchPlaceholder?: string
  searchKey?: keyof T | (keyof T)[]
  searchFilter?: (item: T, search: string) => boolean
  onRowClick?: (item: T) => void
  emptyMessage?: string
  pageSize?: number
  selectable?: boolean
  selectedIds?: string[]
  onSelectionChange?: (selectedIds: string[]) => void
  enableSelection?: boolean
  onBulkDelete?: (ids: string[]) => void
  enableColumnVisibility?: boolean
  enableColumnResize?: boolean
  storageKey?: string
}

const PAGE_SIZE_OPTIONS = [20, 50, 100]
const DEFAULT_COLUMN_WIDTH = 150
const MIN_COLUMN_WIDTH = 50
const MAX_COLUMN_WIDTH = 500
const MAX_FILTER_VALUES = 200

function getStoredColumnSettings(storageKey: string): Record<string, ColumnSettings> | null {
  if (typeof window === "undefined") return null
  try {
    const stored = localStorage.getItem(`datatable-columns-${storageKey}`)
    return stored ? JSON.parse(stored) : null
  } catch {
    return null
  }
}

function saveColumnSettings(storageKey: string, settings: Record<string, ColumnSettings>) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(`datatable-columns-${storageKey}`, JSON.stringify(settings))
  } catch {
    // Ignore storage errors
  }
}

// Get the raw string value for a column from a row (used for filtering)
function getColumnValue<T>(item: T, column: Column<T>): string {
  if (column.filterAccessor) {
    return column.filterAccessor(item)
  }
  if (column.sortAccessor) {
    const val = column.sortAccessor(item)
    return val != null ? String(val) : ""
  }
  const val = (item as Record<string, unknown>)[column.key]
  return val != null ? String(val) : ""
}

// ============================================================
// ColumnHeaderMenu — Excel-style popover per column
// ============================================================
function ColumnHeaderMenu<T extends { id: string }>({
  column,
  data,
  sortKey,
  sortDirection,
  onSort,
  columnFilter,
  onFilterChange,
}: {
  column: Column<T>
  data: T[]
  sortKey: string | null
  sortDirection: "asc" | "desc"
  onSort: (key: string) => void
  columnFilter: ColumnFilterState | undefined
  onFilterChange: (key: string, filter: ColumnFilterState | undefined) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [filterSearch, setFilterSearch] = React.useState("")

  const isSorted = sortKey === column.key
  const hasFilter = columnFilter && columnFilter.selectedValues !== null

  // Compute unique values for the filter list
  const uniqueValues = React.useMemo(() => {
    if (!column.filterable) return []
    const values = new Map<string, number>()
    for (const item of data) {
      const val = getColumnValue(item, column)
      const display = val || "(Blank)"
      values.set(display, (values.get(display) || 0) + 1)
    }
    // Sort alphabetically, blanks last
    return [...values.entries()]
      .sort(([a], [b]) => {
        if (a === "(Blank)") return 1
        if (b === "(Blank)") return -1
        return a.localeCompare(b, undefined, { sensitivity: "base" })
      })
      .slice(0, MAX_FILTER_VALUES)
  }, [data, column])

  // Filter the unique values by the search input
  const filteredValues = React.useMemo(() => {
    if (!filterSearch) return uniqueValues
    const q = filterSearch.toLowerCase()
    return uniqueValues.filter(([val]) => val.toLowerCase().includes(q))
  }, [uniqueValues, filterSearch])

  const selectedSet = columnFilter?.selectedValues ?? null

  const toggleValue = (val: string) => {
    let newSet: Set<string>
    if (selectedSet === null) {
      // Currently "all selected" — deselect this one value
      newSet = new Set(uniqueValues.map(([v]) => v))
      newSet.delete(val)
    } else {
      newSet = new Set(selectedSet)
      if (newSet.has(val)) {
        newSet.delete(val)
      } else {
        newSet.add(val)
      }
    }

    // If all values are selected again, clear the filter
    if (newSet.size === uniqueValues.length) {
      onFilterChange(column.key, undefined)
    } else {
      onFilterChange(column.key, { text: "", selectedValues: newSet })
    }
  }

  const selectAll = () => {
    onFilterChange(column.key, undefined)
  }

  const clearAll = () => {
    onFilterChange(column.key, { text: "", selectedValues: new Set() })
  }

  const isValueSelected = (val: string) => {
    if (selectedSet === null) return true
    return selectedSet.has(val)
  }

  const allSelected = selectedSet === null
  const noneSelected = selectedSet !== null && selectedSet.size === 0

  const hasSortOrFilter = column.sortable || column.filterable
  if (!hasSortOrFilter) return null

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setFilterSearch("") }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`shrink-0 p-0.5 rounded hover:bg-accent ${hasFilter || isSorted ? "text-foreground" : "text-muted-foreground/40 hover:text-muted-foreground"}`}
          onClick={(e) => e.stopPropagation()}
        >
          {hasFilter ? (
            <ListFilter className="h-3.5 w-3.5" />
          ) : isSorted ? (
            sortDirection === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
          ) : (
            <ListFilter className="h-3.5 w-3.5" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-56 p-0"
        onInteractOutside={() => setOpen(false)}
      >
        <div className="p-2 space-y-1">
          {/* Sort options */}
          {column.sortable && (
            <>
              <button
                type="button"
                className={`flex items-center gap-2 w-full rounded px-2 py-1.5 text-sm hover:bg-accent ${isSorted && sortDirection === "asc" ? "bg-accent font-medium" : ""}`}
                onClick={() => { onSort(column.key); if (!isSorted || sortDirection === "desc") { /* will become asc */ } setOpen(false) }}
              >
                <ArrowUp className="h-3.5 w-3.5" />
                Sort Ascending
                {isSorted && sortDirection === "asc" && <Check className="h-3.5 w-3.5 ml-auto" />}
              </button>
              <button
                type="button"
                className={`flex items-center gap-2 w-full rounded px-2 py-1.5 text-sm hover:bg-accent ${isSorted && sortDirection === "desc" ? "bg-accent font-medium" : ""}`}
                onClick={() => {
                  // If already sorted asc on this key, clicking again will toggle to desc
                  // If not sorted on this key, first click sets asc, so click twice
                  if (isSorted && sortDirection === "asc") {
                    onSort(column.key) // toggles to desc
                  } else if (!isSorted) {
                    onSort(column.key) // sets asc
                    // We need to call again immediately for desc
                    setTimeout(() => onSort(column.key), 0)
                  }
                  setOpen(false)
                }}
              >
                <ArrowDown className="h-3.5 w-3.5" />
                Sort Descending
                {isSorted && sortDirection === "desc" && <Check className="h-3.5 w-3.5 ml-auto" />}
              </button>
            </>
          )}

          {/* Filter section */}
          {column.filterable && uniqueValues.length > 0 && (
            <>
              {column.sortable && <div className="border-t my-1" />}
              <div className="px-1 py-1">
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Filter</p>
                {uniqueValues.length > 8 && (
                  <div className="relative mb-1.5">
                    <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Search..."
                      value={filterSearch}
                      onChange={(e) => setFilterSearch(e.target.value)}
                      className="h-7 pl-7 text-xs"
                    />
                  </div>
                )}
                <div className="flex items-center gap-2 mb-1">
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={selectAll}
                  >
                    Select All
                  </button>
                  <span className="text-xs text-muted-foreground">|</span>
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={clearAll}
                  >
                    Clear
                  </button>
                  {hasFilter && (
                    <>
                      <span className="text-xs text-muted-foreground">|</span>
                      <button
                        type="button"
                        className="text-xs text-destructive hover:underline flex items-center gap-0.5"
                        onClick={() => { onFilterChange(column.key, undefined); setOpen(false) }}
                      >
                        <X className="h-3 w-3" />
                        Reset
                      </button>
                    </>
                  )}
                </div>
                <div className="max-h-48 overflow-y-auto border rounded">
                  <div className="space-y-0.5 p-1">
                    {filteredValues.map(([val, count]) => (
                      <label
                        key={val}
                        className="flex items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-accent cursor-pointer"
                      >
                        <Checkbox
                          checked={isValueSelected(val)}
                          onCheckedChange={() => toggleValue(val)}
                          className="h-3.5 w-3.5"
                        />
                        <span className="truncate flex-1">{val}</span>
                        <span className="text-muted-foreground shrink-0">{count}</span>
                      </label>
                    ))}
                    {filteredValues.length === 0 && (
                      <p className="text-xs text-muted-foreground py-1 text-center">No matches</p>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ============================================================
// DataTable
// ============================================================
export function DataTable<T extends { id: string }>({
  data,
  columns,
  isLoading = false,
  searchPlaceholder = "Search...",
  searchKey,
  searchFilter,
  onRowClick,
  emptyMessage = "No data found",
  pageSize: initialPageSize = 20,
  selectable = false,
  selectedIds: controlledSelectedIds = [],
  onSelectionChange,
  enableSelection = false,
  onBulkDelete,
  enableColumnVisibility = true,
  enableColumnResize = true,
  storageKey,
}: DataTableProps<T>) {
  const [search, setSearch] = React.useState("")
  const [currentPage, setCurrentPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(initialPageSize)
  const [internalSelectedIds, setInternalSelectedIds] = React.useState<string[]>([])
  const [sortKey, setSortKey] = React.useState<string | null>(null)
  const [sortDirection, setSortDirection] = React.useState<"asc" | "desc">("asc")

  // Per-column filters
  const [columnFilters, setColumnFilters] = React.useState<Record<string, ColumnFilterState>>({})

  // Column settings state
  const [columnSettings, setColumnSettings] = React.useState<Record<string, ColumnSettings>>(() => {
    if (storageKey) {
      const stored = getStoredColumnSettings(storageKey)
      if (stored) return stored
    }
    const initial: Record<string, ColumnSettings> = {}
    columns.forEach((col) => {
      initial[col.key] = {
        visible: col.defaultVisible !== false,
        width: col.defaultWidth || DEFAULT_COLUMN_WIDTH,
      }
    })
    return initial
  })

  // Resizing state
  const [resizing, setResizing] = React.useState<{ key: string; startX: number; startWidth: number } | null>(null)
  const tableRef = React.useRef<HTMLDivElement>(null)

  // Sync column settings when columns prop changes
  React.useEffect(() => {
    setColumnSettings((prev) => {
      const updated = { ...prev }
      let changed = false
      columns.forEach((col) => {
        if (!updated[col.key]) {
          updated[col.key] = {
            visible: col.defaultVisible !== false,
            width: col.defaultWidth || DEFAULT_COLUMN_WIDTH,
          }
          changed = true
        }
      })
      return changed ? updated : prev
    })
  }, [columns])

  // Save to storage when settings change
  React.useEffect(() => {
    if (storageKey) {
      saveColumnSettings(storageKey, columnSettings)
    }
  }, [storageKey, columnSettings])

  // Handle mouse move during resize
  React.useEffect(() => {
    if (!resizing) return

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - resizing.startX
      const newWidth = Math.max(
        columns.find((c) => c.key === resizing.key)?.minWidth || MIN_COLUMN_WIDTH,
        Math.min(
          columns.find((c) => c.key === resizing.key)?.maxWidth || MAX_COLUMN_WIDTH,
          resizing.startWidth + delta
        )
      )
      setColumnSettings((prev) => ({
        ...prev,
        [resizing.key]: { ...prev[resizing.key], width: newWidth },
      }))
    }

    const handleMouseUp = () => {
      setResizing(null)
    }

    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseup", handleMouseUp)

    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    }
  }, [resizing, columns])

  const isSelectable = selectable || enableSelection
  const selectedIds = enableSelection ? internalSelectedIds : controlledSelectedIds
  const setSelectedIds = enableSelection ? setInternalSelectedIds : onSelectionChange

  const visibleColumns = React.useMemo(() => {
    return columns.filter((col) => columnSettings[col.key]?.visible !== false)
  }, [columns, columnSettings])

  // Count active column filters
  const activeFilterCount = Object.keys(columnFilters).length

  // ---- Data pipeline: global search → column filters → sort → paginate ----

  // Step 1: Global search filter
  const searchFilteredData = React.useMemo(() => {
    if (!data) return []
    if (!search) return data

    if (searchFilter) {
      return data.filter((item) => searchFilter(item, search))
    }

    if (!searchKey) return data

    const searchLower = search.toLowerCase()
    const keys = Array.isArray(searchKey) ? searchKey : [searchKey]

    return data.filter((item) => {
      return keys.some((key) => {
        const value = item[key]
        if (typeof value === "string") {
          return value.toLowerCase().includes(searchLower)
        }
        if (typeof value === "number") {
          return value.toString().includes(search)
        }
        return false
      })
    })
  }, [data, search, searchKey, searchFilter])

  // Step 2: Per-column filters
  const filteredData = React.useMemo(() => {
    if (activeFilterCount === 0) return searchFilteredData

    return searchFilteredData.filter((item) => {
      for (const [colKey, filter] of Object.entries(columnFilters)) {
        if (filter.selectedValues === null) continue
        const column = columns.find((c) => c.key === colKey)
        if (!column) continue

        const val = getColumnValue(item, column) || "(Blank)"
        if (!filter.selectedValues.has(val)) return false
      }
      return true
    })
  }, [searchFilteredData, columnFilters, activeFilterCount, columns])

  // Sort
  const handleSort = React.useCallback((key: string) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDirection("asc")
    }
    setCurrentPage(1)
  }, [sortKey])

  const sortedData = React.useMemo(() => {
    if (!sortKey) return filteredData

    const column = columns.find((c) => c.key === sortKey)
    if (!column || !column.sortable) return filteredData

    return [...filteredData].sort((a, b) => {
      let aVal: string | number | null
      let bVal: string | number | null

      if (column.sortAccessor) {
        aVal = column.sortAccessor(a)
        bVal = column.sortAccessor(b)
      } else {
        aVal = (a as Record<string, unknown>)[sortKey] as string | number | null
        bVal = (b as Record<string, unknown>)[sortKey] as string | number | null
      }

      if (aVal == null && bVal == null) return 0
      if (aVal == null) return 1
      if (bVal == null) return -1

      let cmp: number
      if (typeof aVal === "number" && typeof bVal === "number") {
        cmp = aVal - bVal
      } else {
        cmp = String(aVal).localeCompare(String(bVal), undefined, { sensitivity: "base" })
      }

      return sortDirection === "asc" ? cmp : -cmp
    })
  }, [filteredData, sortKey, sortDirection, columns])

  // Paginate
  const paginatedData = React.useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sortedData.slice(start, start + pageSize)
  }, [sortedData, currentPage, pageSize])

  const totalPages = Math.ceil(sortedData.length / pageSize)

  // Reset page when filters change
  React.useEffect(() => {
    setCurrentPage(1)
  }, [search, pageSize, columnFilters])

  // Selection helpers
  const allFilteredIds = React.useMemo(() => filteredData.map((item) => item.id), [filteredData])

  const isAllSelected =
    isSelectable && filteredData.length > 0 && allFilteredIds.every((id) => selectedIds.includes(id))
  const isSomeSelected =
    isSelectable &&
    selectedIds.length > 0 &&
    allFilteredIds.some((id) => selectedIds.includes(id)) &&
    !isAllSelected

  const toggleSelectAll = () => {
    if (!setSelectedIds) return
    if (isAllSelected) {
      setSelectedIds(selectedIds.filter((id) => !allFilteredIds.includes(id)))
    } else {
      const newSelection = [...new Set([...selectedIds, ...allFilteredIds])]
      setSelectedIds(newSelection)
    }
  }

  const toggleSelectItem = (id: string) => {
    if (!setSelectedIds) return
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((i) => i !== id))
    } else {
      setSelectedIds([...selectedIds, id])
    }
  }

  const handleBulkDelete = () => {
    if (onBulkDelete && selectedIds.length > 0) {
      onBulkDelete(selectedIds)
      setInternalSelectedIds([])
    }
  }

  const toggleColumnVisibility = (key: string) => {
    setColumnSettings((prev) => ({
      ...prev,
      [key]: { ...prev[key], visible: !prev[key]?.visible },
    }))
  }

  const resetColumnSettings = () => {
    const initial: Record<string, ColumnSettings> = {}
    columns.forEach((col) => {
      initial[col.key] = {
        visible: col.defaultVisible !== false,
        width: col.defaultWidth || DEFAULT_COLUMN_WIDTH,
      }
    })
    setColumnSettings(initial)
  }

  const startResize = (key: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setResizing({
      key,
      startX: e.clientX,
      startWidth: columnSettings[key]?.width || DEFAULT_COLUMN_WIDTH,
    })
  }

  const handleColumnFilterChange = React.useCallback((key: string, filter: ColumnFilterState | undefined) => {
    setColumnFilters((prev) => {
      const next = { ...prev }
      if (!filter) {
        delete next[key]
      } else {
        next[key] = filter
      }
      return next
    })
  }, [])

  const clearAllFilters = () => {
    setColumnFilters({})
    setSearch("")
  }

  const hiddenColumnsCount = columns.length - visibleColumns.length

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Skeleton className="h-10 w-64" />
          {enableColumnVisibility && <Skeleton className="h-10 w-10 ml-auto" />}
        </div>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                {isSelectable && (
                  <TableHead className="w-[40px]">
                    <Skeleton className="h-4 w-4" />
                  </TableHead>
                )}
                {columns.slice(0, 5).map((column) => (
                  <TableHead key={column.key}>
                    <Skeleton className="h-4 w-20" />
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...Array(5)].map((_, i) => (
                <TableRow key={i}>
                  {isSelectable && (
                    <TableCell>
                      <Skeleton className="h-4 w-4" />
                    </TableCell>
                  )}
                  {columns.slice(0, 5).map((column) => (
                    <TableCell key={column.key}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {(searchKey || searchFilter) && (
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
        )}
        {(search || activeFilterCount > 0) && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {sortedData.length} result{sortedData.length !== 1 ? "s" : ""}
            </span>
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="text-xs gap-1">
                <ListFilter className="h-3 w-3" />
                {activeFilterCount} filter{activeFilterCount !== 1 ? "s" : ""}
              </Badge>
            )}
            {(search || activeFilterCount > 0) && (
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={clearAllFilters}>
                <X className="h-3 w-3 mr-1" />
                Clear all
              </Button>
            )}
          </div>
        )}
        {enableSelection && selectedIds.length > 0 && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-sm text-muted-foreground">{selectedIds.length} selected</span>
            <Button variant="destructive" size="sm" onClick={handleBulkDelete}>
              <Trash2 className="h-4 w-4 mr-1" />
              Delete
            </Button>
          </div>
        )}
        {enableColumnVisibility && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className={enableSelection && selectedIds.length > 0 ? "" : "ml-auto"}>
                <Settings2 className="h-4 w-4 mr-2" />
                Columns
                {hiddenColumnsCount > 0 && (
                  <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-xs">
                    {hiddenColumnsCount} hidden
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[200px]">
              <DropdownMenuLabel className="flex items-center justify-between">
                Toggle Columns
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={resetColumnSettings}
                  title="Reset to defaults"
                >
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Reset
                </Button>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {columns.map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.key}
                  checked={columnSettings[column.key]?.visible !== false}
                  onCheckedChange={() => toggleColumnVisibility(column.key)}
                  onSelect={(e) => e.preventDefault()}
                >
                  {column.header || column.key}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <div className="rounded-md border overflow-auto" ref={tableRef}>
        <Table style={{ tableLayout: enableColumnResize ? "fixed" : "auto", minWidth: "100%" }}>
          <TableHeader>
            <TableRow>
              {isSelectable && (
                <TableHead className="w-[40px]" style={{ width: 40 }}>
                  <Checkbox
                    checked={isAllSelected}
                    ref={(el) => {
                      if (el) {
                        ;(el as HTMLButtonElement).dataset.state = isSomeSelected
                          ? "indeterminate"
                          : isAllSelected
                            ? "checked"
                            : "unchecked"
                      }
                    }}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all"
                  />
                </TableHead>
              )}
              {visibleColumns.map((column) => {
                const width = columnSettings[column.key]?.width || column.defaultWidth || DEFAULT_COLUMN_WIDTH
                const canResize = enableColumnResize && column.resizable !== false
                const isRightAligned = column.className?.includes("text-right")
                const isCenterAligned = column.className?.includes("text-center")
                const hasColumnFilter = !!columnFilters[column.key]
                const isSorted = sortKey === column.key

                return (
                  <TableHead
                    key={column.key}
                    className={`relative ${column.className || ""}`}
                    style={enableColumnResize ? { width, minWidth: column.minWidth || MIN_COLUMN_WIDTH } : undefined}
                  >
                    <div className={`flex items-center gap-1 ${isRightAligned ? "justify-end" : isCenterAligned ? "justify-center" : "justify-between"}`}>
                      <span
                        className={`truncate ${column.sortable ? "cursor-pointer hover:text-foreground" : ""}`}
                        onClick={column.sortable ? () => handleSort(column.key) : undefined}
                      >
                        {column.header}
                      </span>
                      <div className="flex items-center shrink-0">
                        {/* Sort indicator (shown inline when sorted but no filter menu) */}
                        {isSorted && !(column.sortable || column.filterable) && (
                          sortDirection === "asc"
                            ? <ArrowUp className="h-3.5 w-3.5" />
                            : <ArrowDown className="h-3.5 w-3.5" />
                        )}
                        {/* Column header menu */}
                        {(column.sortable || column.filterable) && (
                          <ColumnHeaderMenu
                            column={column}
                            data={data || []}
                            sortKey={sortKey}
                            sortDirection={sortDirection}
                            onSort={handleSort}
                            columnFilter={columnFilters[column.key]}
                            onFilterChange={handleColumnFilterChange}
                          />
                        )}
                      </div>
                      {canResize && (
                        <div
                          className="absolute right-0 top-0 h-full w-1 cursor-col-resize bg-transparent hover:bg-primary/50 active:bg-primary"
                          onMouseDown={(e) => startResize(column.key, e)}
                          style={{ touchAction: "none" }}
                        >
                          <div className="absolute right-0 top-1/2 -translate-y-1/2 opacity-0 hover:opacity-100">
                            <GripVertical className="h-4 w-4 text-muted-foreground" />
                          </div>
                        </div>
                      )}
                    </div>
                  </TableHead>
                )
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={visibleColumns.length + (isSelectable ? 1 : 0)} className="h-24 text-center">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              paginatedData.map((item) => (
                <TableRow
                  key={item.id}
                  onClick={() => onRowClick?.(item)}
                  className={`${onRowClick ? "cursor-pointer hover:bg-accent/50" : ""} ${isSelectable && selectedIds.includes(item.id) ? "bg-accent/30" : ""}`}
                >
                  {isSelectable && (
                    <TableCell style={{ width: 40 }}>
                      <Checkbox
                        checked={selectedIds.includes(item.id)}
                        onCheckedChange={() => toggleSelectItem(item.id)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Select row`}
                      />
                    </TableCell>
                  )}
                  {visibleColumns.map((column) => {
                    const width = columnSettings[column.key]?.width || column.defaultWidth || DEFAULT_COLUMN_WIDTH
                    return (
                      <TableCell
                        key={column.key}
                        className={column.className}
                        style={enableColumnResize ? { width, maxWidth: width } : undefined}
                      >
                        <div className={`truncate ${column.className?.includes("text-right") ? "text-right" : column.className?.includes("text-center") ? "text-center" : ""}`}>
                          {column.cell
                            ? column.cell(item)
                            : String((item as Record<string, unknown>)[column.key] ?? "")}
                        </div>
                      </TableCell>
                    )
                  })}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <p className="text-sm text-muted-foreground">
            Showing {sortedData.length === 0 ? 0 : (currentPage - 1) * pageSize + 1} to{" "}
            {Math.min(currentPage * pageSize, sortedData.length)} of {sortedData.length}
            {data && sortedData.length !== data.length && (
              <span> (filtered from {data.length})</span>
            )}
          </p>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Rows per page:</span>
            <Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value))}>
              <SelectTrigger className="h-8 w-[70px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <span className="text-sm">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Resize cursor overlay */}
      {resizing && (
        <div
          className="fixed inset-0 cursor-col-resize z-50"
          style={{ pointerEvents: "all" }}
        />
      )}
    </div>
  )
}

// Re-export Badge for internal use in filter count display
import { Badge } from "@/components/ui/badge"
