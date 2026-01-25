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
import { Search, ChevronLeft, ChevronRight, Trash2 } from "lucide-react"

export interface Column<T> {
  key: string
  header: string
  cell?: (item: T) => React.ReactNode
  sortable?: boolean
  className?: string
}

interface DataTableProps<T> {
  data: T[] | null
  columns: Column<T>[]
  isLoading?: boolean
  searchPlaceholder?: string
  searchKey?: keyof T
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
}

const PAGE_SIZE_OPTIONS = [20, 50, 100]

export function DataTable<T extends { id: string }>({
  data,
  columns,
  isLoading = false,
  searchPlaceholder = "Search...",
  searchKey,
  onRowClick,
  emptyMessage = "No data found",
  pageSize: initialPageSize = 20,
  selectable = false,
  selectedIds: controlledSelectedIds = [],
  onSelectionChange,
  enableSelection = false,
  onBulkDelete,
}: DataTableProps<T>) {
  const [search, setSearch] = React.useState("")
  const [currentPage, setCurrentPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(initialPageSize)
  const [internalSelectedIds, setInternalSelectedIds] = React.useState<string[]>([])

  // Use internal state if enableSelection is true, otherwise use controlled state
  const isSelectable = selectable || enableSelection
  const selectedIds = enableSelection ? internalSelectedIds : controlledSelectedIds
  const setSelectedIds = enableSelection ? setInternalSelectedIds : onSelectionChange

  // Filter data based on search
  const filteredData = React.useMemo(() => {
    if (!data) return []
    if (!search || !searchKey) return data

    return data.filter((item) => {
      const value = item[searchKey]
      if (typeof value === "string") {
        return value.toLowerCase().includes(search.toLowerCase())
      }
      return false
    })
  }, [data, search, searchKey])

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
  const allFilteredIds = React.useMemo(() => filteredData.map(item => item.id), [filteredData])

  const isAllSelected = isSelectable && filteredData.length > 0 &&
    allFilteredIds.every(id => selectedIds.includes(id))
  const isSomeSelected = isSelectable && selectedIds.length > 0 &&
    allFilteredIds.some(id => selectedIds.includes(id)) && !isAllSelected

  const toggleSelectAll = () => {
    if (!setSelectedIds) return
    if (isAllSelected) {
      // Deselect all filtered items
      setSelectedIds(selectedIds.filter(id => !allFilteredIds.includes(id)))
    } else {
      // Select all filtered items
      const newSelection = [...new Set([...selectedIds, ...allFilteredIds])]
      setSelectedIds(newSelection)
    }
  }

  const toggleSelectItem = (id: string) => {
    if (!setSelectedIds) return
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(i => i !== id))
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

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Skeleton className="h-10 w-64" />
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
                {columns.map((column) => (
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
                  {columns.map((column) => (
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
        {searchKey && (
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
            <span className="text-sm text-muted-foreground">
              {selectedIds.length} selected
            </span>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleBulkDelete}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Delete
            </Button>
          </div>
        )}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {isSelectable && (
                <TableHead className="w-[40px]">
                  <Checkbox
                    checked={isAllSelected}
                    ref={(el) => {
                      if (el) {
                        (el as HTMLButtonElement).dataset.state = isSomeSelected ? "indeterminate" : (isAllSelected ? "checked" : "unchecked")
                      }
                    }}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all"
                  />
                </TableHead>
              )}
              {columns.map((column) => (
                <TableHead key={column.key} className={column.className}>
                  {column.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length + (isSelectable ? 1 : 0)} className="h-24 text-center">
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
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.includes(item.id)}
                        onCheckedChange={() => toggleSelectItem(item.id)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Select row`}
                      />
                    </TableCell>
                  )}
                  {columns.map((column) => (
                    <TableCell key={column.key} className={column.className}>
                      {column.cell
                        ? column.cell(item)
                        : String((item as Record<string, unknown>)[column.key] ?? "")}
                    </TableCell>
                  ))}
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
            <Select
              value={String(pageSize)}
              onValueChange={(value) => setPageSize(Number(value))}
            >
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
    </div>
  )
}
