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
  Search,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Settings2,
  GripVertical,
  RotateCcw,
} from "lucide-react"

export interface Column<T> {
  key: string
  header: string
  cell?: (item: T) => React.ReactNode
  sortable?: boolean
  className?: string
  // New properties for dynamic columns
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

interface DataTableProps<T> {
  data: T[] | null
  columns: Column<T>[]
  isLoading?: boolean
  searchPlaceholder?: string
  searchKey?: keyof T | (keyof T)[]  // Single key or array of keys to search
  searchFilter?: (item: T, search: string) => boolean  // Custom search filter function
  onRowClick?: (item: T) => void
  emptyMessage?: string
  pageSize?: number
  // Selection props (controlled mode)
  selectable?: boolean
  selectedIds?: string[]
  onSelectionChange?: (selectedIds: string[]) => void
  // Selection props (uncontrolled mode with bulk delete)
  enableSelection?: boolean
  onBulkDelete?: (ids: string[]) => void
  // Column customization props
  enableColumnVisibility?: boolean
  enableColumnResize?: boolean
  storageKey?: string // For persisting column settings to localStorage
}

const PAGE_SIZE_OPTIONS = [20, 50, 100]
const DEFAULT_COLUMN_WIDTH = 150
const MIN_COLUMN_WIDTH = 50
const MAX_COLUMN_WIDTH = 500

// Helper to get stored column settings
function getStoredColumnSettings(storageKey: string): Record<string, ColumnSettings> | null {
  if (typeof window === "undefined") return null
  try {
    const stored = localStorage.getItem(`datatable-columns-${storageKey}`)
    return stored ? JSON.parse(stored) : null
  } catch {
    return null
  }
}

// Helper to save column settings
function saveColumnSettings(storageKey: string, settings: Record<string, ColumnSettings>) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(`datatable-columns-${storageKey}`, JSON.stringify(settings))
  } catch {
    // Ignore storage errors
  }
}

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

  // Column settings state
  const [columnSettings, setColumnSettings] = React.useState<Record<string, ColumnSettings>>(() => {
    // Try to load from storage first
    if (storageKey) {
      const stored = getStoredColumnSettings(storageKey)
      if (stored) return stored
    }
    // Initialize from column defaults
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

  // Sync column settings when columns prop changes (add new columns)
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

  // Use internal state if enableSelection is true, otherwise use controlled state
  const isSelectable = selectable || enableSelection
  const selectedIds = enableSelection ? internalSelectedIds : controlledSelectedIds
  const setSelectedIds = enableSelection ? setInternalSelectedIds : onSelectionChange

  // Get visible columns
  const visibleColumns = React.useMemo(() => {
    return columns.filter((col) => columnSettings[col.key]?.visible !== false)
  }, [columns, columnSettings])

  // Filter data based on search
  const filteredData = React.useMemo(() => {
    if (!data) return []
    if (!search) return data

    // Use custom filter if provided
    if (searchFilter) {
      return data.filter((item) => searchFilter(item, search))
    }

    // No search key specified
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

  // Paginate data
  const paginatedData = React.useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredData.slice(start, start + pageSize)
  }, [filteredData, currentPage, pageSize])

  const totalPages = Math.ceil(filteredData.length / pageSize)

  // Reset to page 1 when search or page size changes
  React.useEffect(() => {
    setCurrentPage(1)
  }, [search, pageSize])

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
        {search && (
          <span className="text-sm text-muted-foreground">
            {filteredData.length} result{filteredData.length !== 1 ? "s" : ""}
          </span>
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
                return (
                  <TableHead
                    key={column.key}
                    className={`relative ${column.className || ""}`}
                    style={enableColumnResize ? { width, minWidth: column.minWidth || MIN_COLUMN_WIDTH } : undefined}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate">{column.header}</span>
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
                        <div className="truncate">
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
            Showing {filteredData.length === 0 ? 0 : (currentPage - 1) * pageSize + 1} to{" "}
            {Math.min(currentPage * pageSize, filteredData.length)} of {filteredData.length}
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
