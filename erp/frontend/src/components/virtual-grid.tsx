"use client"

import { useState, useRef, useMemo, useEffect, useCallback, type ReactNode } from "react"
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
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ArrowUp, ArrowDown, Search, Columns, X, ListFilter, RotateCcw } from "lucide-react"
import { cn } from "@/lib/utils"
import { ColumnFilterPopover } from "@/components/grid/column-filter-popover"
import { FilterRowCell } from "@/components/grid/filter-row"
import { useCellSelection } from "@/components/grid/use-cell-selection"
import { serializeTsv, toHtmlTable, parseTsv } from "@/components/grid/tsv"
import { planPaste, describePlan, type PastePlan } from "@/components/grid/paste"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { toast } from "sonner"
import {
  SHEET_ROW_HEIGHT,
  SHEET_HEADER_HEIGHT,
  SHEET_FILTER_HEIGHT,
  STRIPE_RAIL_WIDTH,
  gutterWidthFor,
  copyValueOf,
  cellKey,
  parseCellKey,
  parseCellInput,
  type VirtualGridColumn,
  type SpreadsheetOptions,
  type GridFilterValue,
  type CellEdit,
  type CellCommitResult,
  type RowStripe,
} from "@/components/grid/types"
import { CellEditor, type EditorExit } from "@/components/grid/cell-editor"

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
   * A status stripe down the left edge of the gutter. Prefer this to tinting
   * the whole row: in a sheet the cell background belongs to the selection, and
   * a border on the row hides behind the sticky gutter once you scroll
   * sideways. Works in classic mode too, as a bare 4px rail.
   */
  rowStripe?: (row: T) => RowStripe
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
  /** Shown in place of the default "No data found". */
  emptyMessage?: ReactNode
  /**
   * Namespace for this grid's remembered state — column widths, hidden columns
   * and the filter-row toggle — under `vgrid:<key>:*` in localStorage. Omit and
   * the grid remembers nothing.
   */
  storageKey?: string
  /**
   * "Open this record": fires on double-click of a cell with no editor, and on
   * Enter when nothing is being edited.
   *
   * Deliberately not a single-click handler — in spreadsheet mode a click puts
   * the cell cursor somewhere, and navigating on click would leave no way to
   * select a cell at all.
   */
  onRowActivate?: (row: T) => void
  /**
   * Excel-like presentation: fixed 26px rows, gridlines on every cell and a
   * row-number gutter. Cells clip instead of wrapping, so don't turn this on
   * for a grid whose cells rely on multi-line content.
   */
  spreadsheet?: boolean
  spreadsheetOptions?: SpreadsheetOptions<T>
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
  rowStripe,
  getRowId,
  className,
  emptyMessage = "No data found",
  storageKey,
  onRowActivate,
  spreadsheet = false,
  spreadsheetOptions,
}: VirtualGridProps<T>) {
  const rowHeight = rowHeightProp ?? (spreadsheet ? SHEET_ROW_HEIGHT : 44)
  const showRowNumbers = spreadsheet && (spreadsheetOptions?.rowNumbers ?? true)
  const [filterRowOpen, setFilterRowOpen] = useState(spreadsheetOptions?.filterRow ?? true)
  const [search, setSearch] = useState("")
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({})
  const [restored, setRestored] = useState(false)

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
          enableResizing: col.resizable ?? true,
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

  // ---- Remembered state --------------------------------------------------
  //
  // All read after mount, never in a useState initializer — localStorage isn't
  // there during SSR and reading it inline mismatches the hydrated markup.

  const stored = (suffix: string) => `vgrid:${storageKey}:${suffix}`
  const write = (suffix: string, value: string) => {
    if (storageKey) window.localStorage.setItem(stored(suffix), value)
  }

  useEffect(() => {
    if (!storageKey) return
    const savedFilterRow = window.localStorage.getItem(`vgrid:${storageKey}:filterRow`)
    if (savedFilterRow !== null) setFilterRowOpen(savedFilterRow === "1")

    try {
      const savedSizing = window.localStorage.getItem(`vgrid:${storageKey}:sizing`)
      if (savedSizing) setColumnSizing(JSON.parse(savedSizing))
      const savedHidden = window.localStorage.getItem(`vgrid:${storageKey}:hidden`)
      if (savedHidden) setColumnVisibility(JSON.parse(savedHidden))
    } catch {
      // Corrupt or hand-edited entry — fall back to defaults rather than
      // leaving the grid unrenderable.
      window.localStorage.removeItem(`vgrid:${storageKey}:sizing`)
      window.localStorage.removeItem(`vgrid:${storageKey}:hidden`)
    }
    setRestored(true)
  }, [storageKey])

  // Only persist once the saved values are in, or the first render's empty
  // defaults would overwrite them.
  useEffect(() => {
    if (!storageKey || !restored) return
    write("sizing", JSON.stringify(columnSizing))
  }, [columnSizing, storageKey, restored])

  useEffect(() => {
    if (!storageKey || !restored) return
    write("hidden", JSON.stringify(columnVisibility))
  }, [columnVisibility, storageKey, restored])

  const toggleFilterRow = () => {
    setFilterRowOpen((open) => {
      const next = !open
      write("filterRow", next ? "1" : "0")
      return next
    })
  }

  const resetColumns = () => {
    setColumnSizing({})
    setColumnVisibility({})
  }

  const activeFilterCount = columnFilters.length
  // A grid with stripes but no row numbers still needs somewhere to put them,
  // so it gets a bare rail. That's also what lets a classic grid carry stripes
  // before it converts to a sheet.
  const showStripeRail = !!rowStripe && !showRowNumbers
  const showGutter = showRowNumbers || showStripeRail
  const gutterWidth = showRowNumbers
    ? gutterWidthFor(rows.length)
    : showStripeRail
      ? STRIPE_RAIL_WIDTH
      : 0
  const showFilterRow = spreadsheet && filterRowOpen

  // ---- Cell cursor -------------------------------------------------------

  // Refs so the scroll helper below can stay referentially stable.
  const virtualizerRef = useRef(virtualizer)
  virtualizerRef.current = virtualizer
  const gutterWidthRef = useRef(gutterWidth)
  gutterWidthRef.current = gutterWidth

  const visibleLeafColumns = table.getVisibleLeafColumns()
  const colSignature = visibleLeafColumns.map((c) => c.id).join("|")
  const rowIds = useMemo(
    () => rows.map((r) => r.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orderSignature]
  )
  const colIds = useMemo(
    () => (colSignature ? colSignature.split("|") : []),
    [colSignature]
  )
  const { activePos, rect, selectCell, selectRow, selectAll, clear, isInRect } =
    useCellSelection(rowIds, colIds)

  const columnSizes = visibleLeafColumns.map((c) => c.getSize())
  const columnSizesRef = useRef(columnSizes)
  columnSizesRef.current = columnSizes

  /**
   * Bring a cell into view. Vertically this goes through the virtualizer
   * rather than the DOM, because the target row usually isn't mounted.
   * Horizontally the sticky gutter covers the left edge of the scrollport, so
   * a cell is only really visible once it clears the gutter.
   */
  const scrollCellIntoView = useCallback(
    (rowIdx: number, colIdx: number) => {
      virtualizerRef.current?.scrollToIndex(rowIdx, { align: "auto" })
      const el = parentRef.current
      if (!el) return
      const sizes = columnSizesRef.current
      let start = gutterWidthRef.current
      for (let i = 0; i < colIdx; i++) start += sizes[i] ?? 0
      const end = start + (sizes[colIdx] ?? 0)
      if (start < el.scrollLeft + gutterWidthRef.current) {
        el.scrollLeft = start - gutterWidthRef.current
      } else if (end > el.scrollLeft + el.clientWidth) {
        el.scrollLeft = end - el.clientWidth
      }
    },
    []
  )

  const move = useCallback(
    (rowIdx: number, colIdx: number, extend: boolean) => {
      const r = Math.max(0, Math.min(rowIdx, rowIds.length - 1))
      const c = Math.max(0, Math.min(colIdx, colIds.length - 1))
      selectCell(r, c, extend)
      scrollCellIntoView(r, c)
    },
    [rowIds.length, colIds.length, selectCell, scrollCellIntoView]
  )

  const handleGridKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!spreadsheet) return
    // Never steal keystrokes from the filter row, or from anything else that
    // takes typed input.
    const target = e.target as HTMLElement
    if (
      target !== e.currentTarget &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable ||
        target.getAttribute("role") === "combobox")
    ) {
      return
    }

    const rowCount = rowIds.length
    const colCount = colIds.length
    if (!rowCount || !colCount) return

    if (e.key === "a" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      selectAll()
      return
    }
    if (e.key === "Escape") {
      clear()
      return
    }

    // The first keypress with no cursor starts at the top-left.
    if (!activePos) {
      if (["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End", "Tab"].includes(e.key)) {
        e.preventDefault()
        move(0, 0, false)
      }
      return
    }

    const { r, c } = activePos
    const page = Math.max(1, Math.floor(height / rowHeight) - 1)
    const jump = e.ctrlKey || e.metaKey

    // Typing over a cell starts an edit seeded with that character, the way a
    // spreadsheet does. F2 opens with the existing value instead.
    if (editable && !editing) {
      const row = rows[r]
      const config = columnsById.get(colIds[c])?.edit
      if (row && config && canEditCell(row.original, colIds[c])) {
        if (e.key === "F2") {
          e.preventDefault()
          openEditor(r, c, String(config.getValue(row.original) ?? ""))
          return
        }
        if (e.key === "Delete" || e.key === "Backspace") {
          // Clearing is a paste of one empty cell over the selection. Columns
          // that can't hold an empty value simply reject it and are reported.
          e.preventDefault()
          const plan = buildPlan([[""]])
          if (plan) applyPlan(plan)
          return
        }
        if (e.key.length === 1 && !jump && !e.altKey) {
          e.preventDefault()
          openEditor(r, c, e.key)
          return
        }
      }
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault()
        move(jump ? rowCount - 1 : r + 1, c, e.shiftKey)
        break
      case "ArrowUp":
        e.preventDefault()
        move(jump ? 0 : r - 1, c, e.shiftKey)
        break
      case "ArrowRight":
        e.preventDefault()
        move(r, jump ? colCount - 1 : c + 1, e.shiftKey)
        break
      case "ArrowLeft":
        e.preventDefault()
        move(r, jump ? 0 : c - 1, e.shiftKey)
        break
      case "PageDown":
        e.preventDefault()
        move(r + page, c, e.shiftKey)
        break
      case "PageUp":
        e.preventDefault()
        move(r - page, c, e.shiftKey)
        break
      case "Home":
        e.preventDefault()
        move(jump ? 0 : r, 0, e.shiftKey)
        break
      case "End":
        e.preventDefault()
        move(jump ? rowCount - 1 : r, colCount - 1, e.shiftKey)
        break
      case "Tab": {
        e.preventDefault()
        // Tab walks the row and wraps, like a spreadsheet.
        const forward = !e.shiftKey
        let nc = c + (forward ? 1 : -1)
        let nr = r
        if (nc >= colCount) {
          nc = 0
          nr = Math.min(r + 1, rowCount - 1)
        } else if (nc < 0) {
          nc = colCount - 1
          nr = Math.max(r - 1, 0)
        }
        move(nr, nc, false)
        break
      }
      case "Enter":
        e.preventDefault()
        // On a grid that can be typed into, Enter belongs to the cursor —
        // that's the spreadsheet convention, and F2/double-click still open an
        // editor. Only a read-only grid gives Enter to "open this record".
        if (onRowActivate && !editable) {
          const row = rows[r]
          if (row) onRowActivate(row.original)
        } else {
          move(e.shiftKey ? r - 1 : r + 1, c, false)
        }
        break
    }
  }

  // Drag to extend the selection.
  const draggingRef = useRef(false)
  useEffect(() => {
    if (!spreadsheet) return
    const stop = () => {
      draggingRef.current = false
    }
    window.addEventListener("mouseup", stop)
    return () => window.removeEventListener("mouseup", stop)
  }, [spreadsheet])

  const handleCellMouseDown = (
    e: React.MouseEvent<HTMLDivElement>,
    rowIdx: number,
    colIdx: number
  ) => {
    if (!spreadsheet) return
    const target = e.target as HTMLElement
    const interactive = target.closest("a,button,input,select,textarea,[role=button]")
    // Suppressing the default stops the browser drawing its own text selection
    // over the top of ours — but not on a control, which needs its focus.
    if (!interactive) e.preventDefault()
    draggingRef.current = !interactive
    selectCell(rowIdx, colIdx, e.shiftKey)
    parentRef.current?.focus({ preventScroll: true })
  }

  const handleCellMouseEnter = (rowIdx: number, colIdx: number) => {
    if (draggingRef.current) selectCell(rowIdx, colIdx, true)
  }

  // ---- Editing -----------------------------------------------------------

  const columnsById = useMemo(
    () => new Map(gridColumns.map((c) => [c.id, c])),
    [gridColumns]
  )
  const editable = spreadsheet && !!spreadsheetOptions?.editable
  const onCommitRef = useRef(spreadsheetOptions?.onCommit)
  onCommitRef.current = spreadsheetOptions?.onCommit
  const onAfterCommitRef = useRef(spreadsheetOptions?.onAfterCommit)
  onAfterCommitRef.current = spreadsheetOptions?.onAfterCommit

  const [editing, setEditing] = useState<{ rowId: string; colId: string; initial: string } | null>(null)
  // Optimistic overlay: what a cell shows between a successful commit and the
  // refetch that makes it true. Entries are pruned once the server agrees.
  const [pendingValues, setPendingValues] = useState<Map<string, unknown>>(new Map())
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set())
  const [cellErrors, setCellErrors] = useState<Map<string, string>>(new Map())

  const canEditCell = useCallback(
    (row: T, colId: string) => {
      if (!editable) return false
      const config = columnsById.get(colId)?.edit
      if (!config) return false
      return (config.isEditable?.(row) ?? true) === true
    },
    [editable, columnsById]
  )

  useEffect(() => {
    if (!pendingValues.size) return
    const byId = new Map(rows.map((r) => [r.id, r.original]))
    const next = new Map(pendingValues)
    let changed = false
    for (const [key, value] of pendingValues) {
      const { rowId, colId } = parseCellKey(key)
      const row = byId.get(rowId)
      const config = columnsById.get(colId)?.edit
      if (!row || !config) {
        next.delete(key)
        changed = true
        continue
      }
      if (String(config.getValue(row) ?? "") === String(value ?? "")) {
        next.delete(key)
        changed = true
      }
    }
    if (changed) setPendingValues(next)
  }, [rows, pendingValues, columnsById])

  // One refetch after a burst of edits, not one per cell. The optimistic
  // overlay is what makes the delay invisible.
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (refetchTimer.current) clearTimeout(refetchTimer.current)
  }, [])
  const scheduleAfterCommit = useCallback(() => {
    if (refetchTimer.current) clearTimeout(refetchTimer.current)
    refetchTimer.current = setTimeout(() => onAfterCommitRef.current?.(), 300)
  }, [])

  const commitEdits = useCallback(
    async (edits: CellEdit<T>[]) => {
      const commit = onCommitRef.current
      if (!commit || !edits.length) return [] as CellCommitResult[]
      const keys = edits.map((e) => cellKey(e.rowId, e.columnId))

      setPendingValues((prev) => {
        const next = new Map(prev)
        edits.forEach((e, i) => next.set(keys[i], e.value))
        return next
      })
      setSavingKeys((prev) => {
        const next = new Set(prev)
        keys.forEach((k) => next.add(k))
        return next
      })
      setCellErrors((prev) => {
        const next = new Map(prev)
        keys.forEach((k) => next.delete(k))
        return next
      })

      let results: CellCommitResult[]
      try {
        results = await commit(edits)
      } catch (err) {
        const message = err instanceof Error ? err.message : "Save failed"
        results = edits.map((e) => ({
          rowId: e.rowId,
          columnId: e.columnId,
          ok: false as const,
          error: message,
        }))
      }

      setSavingKeys((prev) => {
        const next = new Set(prev)
        keys.forEach((k) => next.delete(k))
        return next
      })

      const failed = results.filter((r) => !r.ok) as Extract<CellCommitResult, { ok: false }>[]
      if (failed.length) {
        setCellErrors((prev) => {
          const next = new Map(prev)
          failed.forEach((f) => next.set(cellKey(f.rowId, f.columnId), f.error))
          return next
        })
        // Drop the optimistic value so the cell snaps back to server truth.
        setPendingValues((prev) => {
          const next = new Map(prev)
          failed.forEach((f) => next.delete(cellKey(f.rowId, f.columnId)))
          return next
        })
      }
      if (failed.length < results.length) scheduleAfterCommit()
      return results
    },
    [scheduleAfterCommit]
  )

  const openEditor = useCallback(
    (rowIdx: number, colIdx: number, initial: string) => {
      const row = rows[rowIdx]
      const colId = colIds[colIdx]
      if (!row || !colId || !canEditCell(row.original, colId)) return
      setEditing({ rowId: row.id, colId, initial })
    },
    [rows, colIds, canEditCell]
  )

  const closeEditor = useCallback(() => {
    setEditing(null)
    parentRef.current?.focus({ preventScroll: true })
  }, [])

  /** Apply one typed value to one cell. Shared by the editor and by Delete. */
  const applyCellInput = useCallback(
    (rowId: string, colId: string, raw: string) => {
      const row = rows.find((r) => r.id === rowId)
      const config = columnsById.get(colId)?.edit
      if (!row || !config) return
      const key = cellKey(rowId, colId)
      const previous = config.getValue(row.original)
      const parsed = config.parse ? config.parse(raw, row.original) : parseCellInput(config.editor, raw)

      if ("error" in parsed) {
        setCellErrors((prev) => new Map(prev).set(key, parsed.error))
        return
      }
      setCellErrors((prev) => {
        const next = new Map(prev)
        next.delete(key)
        return next
      })
      // The server treats an unchanged value as a no-op; no reason to ask it.
      if (String(parsed.value ?? "") === String(previous ?? "")) return

      void commitEdits([
        {
          rowId,
          row: row.original,
          columnId: colId,
          field: config.field ?? colId,
          raw,
          value: parsed.value,
          previous,
        },
      ])
    },
    [rows, columnsById, commitEdits]
  )

  const handleEditorCommit = (raw: string, exit: EditorExit) => {
    if (!editing) return
    const { rowId, colId } = editing
    closeEditor()
    applyCellInput(rowId, colId, raw)

    const r = rowIds.indexOf(rowId)
    const c = colIds.indexOf(colId)
    if (r < 0 || c < 0) return
    if (exit === "down") move(r + 1, c, false)
    else if (exit === "up") move(r - 1, c, false)
    else if (exit === "right") move(r, c + 1, false)
    else if (exit === "left") move(r, c - 1, false)
  }

  /**
   * Ctrl+C. This hooks the DOM copy event rather than calling
   * navigator.clipboard, which does not exist on an insecure origin — and
   * production is served over http, so a writeText implementation would pass
   * every test on localhost and silently do nothing for users.
   */
  const handleCopy = (e: React.ClipboardEvent<HTMLDivElement>) => {
    if (!spreadsheet || !rect) return
    const target = e.target as HTMLElement
    if (
      target !== e.currentTarget &&
      (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
    ) {
      return
    }

    const matrix: string[][] = []
    for (let r = rect.r0; r <= rect.r1; r++) {
      const row = rows[r]
      if (!row) continue
      const line: string[] = []
      for (let c = rect.c0; c <= rect.c1; c++) {
        const col = gridColumns.find((g) => g.id === colIds[c])
        line.push(col ? copyValueOf(col, row.original) : "")
      }
      matrix.push(line)
    }
    if (!matrix.length) return

    e.clipboardData.setData("text/plain", serializeTsv(matrix))
    e.clipboardData.setData("text/html", toHtmlTable(matrix))
    e.preventDefault()
  }

  // ---- Paste -------------------------------------------------------------

  const [pasteConfirm, setPasteConfirm] = useState<PastePlan<T> | null>(null)

  const runPlan = useCallback(
    async (plan: PastePlan<T>) => {
      const results = await commitEdits(plan.edits)
      const failed = results.filter((r) => !r.ok).length
      const savedRows = new Set(results.filter((r) => r.ok).map((r) => r.rowId)).size

      if (failed) {
        // Successes are not rolled back: there is no transactional bulk
        // endpoint, and undoing a quantity would write further adjustments.
        toast.error(`${savedRows} row${savedRows === 1 ? "" : "s"} updated · ${failed} cell${failed === 1 ? "" : "s"} failed`)
      } else {
        toast.success(`${plan.edits.length} cell${plan.edits.length === 1 ? "" : "s"} updated`)
      }

      const notes: string[] = []
      if (plan.clipped) notes.push(`${plan.clipped} fell outside the grid`)
      if (plan.skipped) notes.push(`${plan.skipped} in read-only columns`)
      if (plan.blocked.length) notes.push(`${plan.blocked.length} on locked rows — ${plan.blocked[0]}`)
      if (plan.invalid.length) notes.push(`${plan.invalid.length} rejected — ${plan.invalid[0]}`)
      if (notes.length) toast.warning(`Ignored: ${notes.join("; ")}`)
    },
    [commitEdits]
  )

  const applyPlan = useCallback(
    (plan: PastePlan<T>) => {
      if (!plan.edits.length) {
        toast.error(`Nothing to write — ${describePlan(plan)}`)
        return
      }
      const threshold = spreadsheetOptions?.pasteConfirmThreshold ?? 50
      const needsConfirm =
        plan.edits.length > threshold ||
        plan.columns.some((id) => columnsById.get(id)?.edit?.confirmOnPaste)
      if (needsConfirm) setPasteConfirm(plan)
      else void runPlan(plan)
    },
    [spreadsheetOptions?.pasteConfirmThreshold, columnsById, runPlan]
  )

  const buildPlan = useCallback(
    (matrix: string[][]) => {
      if (!rect) return null
      return planPaste<T>({
        matrix,
        rect,
        rows: rows.map((r) => ({ id: r.id, original: r.original })),
        colIds,
        columns: columnsById,
        isEditable: canEditCell,
      })
    },
    [rect, rows, colIds, columnsById, canEditCell]
  )

  /** Ctrl+V. Same reasoning as copy: the DOM event, not navigator.clipboard. */
  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    if (!spreadsheet || !editable || !rect) return
    const target = e.target as HTMLElement
    if (
      target !== e.currentTarget &&
      (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
    ) {
      return
    }
    const text = e.clipboardData.getData("text/plain")
    if (!text) return
    e.preventDefault()
    const plan = buildPlan(parseTsv(text))
    if (plan) applyPlan(plan)
  }

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
                {/* Without this, dragging a column down to its 60px minimum
                    leaves no way back. */}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={resetColumns}>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Reset columns
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {headerActions}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {/* The scroll container is also the keyboard host: focus stays here and
            never moves to a cell, so the virtualizer unmounting the active row
            can't strand it. */}
        <div
          ref={parentRef}
          className={cn("overflow-auto", spreadsheet && "outline-none")}
          style={{ height }}
          tabIndex={spreadsheet ? 0 : undefined}
          onKeyDown={spreadsheet ? handleGridKeyDown : undefined}
          onCopy={spreadsheet ? handleCopy : undefined}
          onPaste={spreadsheet ? handlePaste : undefined}
        >
          {/* The shim gives header and rows one shared width so they scroll
              together. The gutter is not a TanStack column, so its width has to
              be added here or the last column clips at the right edge. */}
          <div style={{ minWidth: `${table.getTotalSize() + gutterWidth}px` }}>
        {/* Header */}
        <div
          className="border-t border-b bg-muted flex sticky top-0 z-10"
          style={spreadsheet ? { height: SHEET_HEADER_HEIGHT } : undefined}
        >
          {showGutter && (
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
                {/* A right-aligned header reverses the order so the label
                    still sits against the right edge. Both orders carry the
                    same three pieces — keeping them in one expression is what
                    stops the filter going missing from one of them. */}
                {(() => {
                  const label = flexRender(header.column.columnDef.header, header.getContext())
                  const sorted = header.column.getIsSorted()
                  const sortIcon = !canSort ? null : sorted === "asc" ? (
                    <ArrowUp className="h-3 w-3" />
                  ) : sorted === "desc" ? (
                    <ArrowDown className="h-3 w-3" />
                  ) : null
                  const filterButton = canFilter ? (
                    <span onClick={(e) => e.stopPropagation()}>
                      <ColumnFilterPopover
                        column={header.column}
                        data={filteredData}
                        accessor={filterAccessor}
                      />
                    </span>
                  ) : null
                  return align === "right" ? (
                    <>
                      {filterButton}
                      {sortIcon}
                      {label}
                    </>
                  ) : (
                    <>
                      {label}
                      {sortIcon}
                      {filterButton}
                    </>
                  )
                })()}
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
            {showGutter && (
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
                    spreadsheet ? "border-border items-center select-none" : "items-stretch",
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
                  {showGutter && (() => {
                    const stripe = rowStripe?.(row.original)
                    return (
                      <div
                        className={cn(
                          "relative sticky left-0 z-[1] shrink-0 border-r border-border h-full flex items-center justify-end select-none",
                          showRowNumbers &&
                            "px-1.5 text-[11px] text-muted-foreground tabular-nums cursor-pointer",
                          rect && virtualRow.index >= rect.r0 && virtualRow.index <= rect.r1
                            ? "bg-accent text-accent-foreground"
                            : "bg-muted"
                        )}
                        style={{ width: gutterWidth, minWidth: gutterWidth }}
                        title={stripe?.label}
                        onMouseDown={
                          showRowNumbers
                            ? (e) => {
                                e.preventDefault()
                                selectRow(virtualRow.index, e.shiftKey)
                                parentRef.current?.focus({ preventScroll: true })
                              }
                            : undefined
                        }
                      >
                        {/* Absolute so it paints over the selection tint rather
                            than being replaced by it. */}
                        {stripe && (
                          <span
                            className={cn("absolute inset-y-0 left-0", stripe.color)}
                            style={{ width: showRowNumbers ? 3 : STRIPE_RAIL_WIDTH }}
                          />
                        )}
                        {showRowNumbers && virtualRow.index + 1}
                      </div>
                    )
                  })()}
                  {row.getVisibleCells().map((cell, colIdx) => {
                    const colId = cell.column.id
                    const colDef = columnsById.get(colId)
                    const rendered = flexRender(cell.column.columnDef.cell, cell.getContext())
                    const selected = spreadsheet && isInRect(virtualRow.index, colIdx)
                    const isActive =
                      spreadsheet && activePos?.r === virtualRow.index && activePos?.c === colIdx
                    const key = cellKey(row.id, colId)
                    const isEditingCell = editing?.rowId === row.id && editing?.colId === colId
                    const pendingValue = pendingValues.get(key)
                    const error = cellErrors.get(key)
                    const cellEditable = spreadsheet && canEditCell(row.original, colId)
                    return (
                      <div
                        key={cell.id}
                        title={error}
                        className={cn(
                          "shrink-0 overflow-hidden",
                          spreadsheet
                            ? "px-2 h-full flex items-center border-r border-border text-xs"
                            : "px-3 py-2 self-center",
                          colDef?.align === "right" && (spreadsheet ? "justify-end text-right" : "text-right"),
                          selected && "bg-accent",
                          isActive && "relative z-[2] ring-2 ring-inset ring-primary",
                          cellEditable && !isEditingCell && "cursor-cell",
                          savingKeys.has(key) && "opacity-60",
                          error && "relative bg-destructive/10 ring-1 ring-inset ring-destructive",
                          isEditingCell && "px-0"
                        )}
                        style={{ width: cell.column.getSize(), minWidth: cell.column.getSize() }}
                        onMouseDown={spreadsheet ? (e) => handleCellMouseDown(e, virtualRow.index, colIdx) : undefined}
                        onMouseEnter={spreadsheet ? () => handleCellMouseEnter(virtualRow.index, colIdx) : undefined}
                        onDoubleClick={
                          cellEditable
                            ? () =>
                                openEditor(
                                  virtualRow.index,
                                  colIdx,
                                  String(colDef?.edit?.getValue(row.original) ?? "")
                                )
                            : onRowActivate
                              ? () => onRowActivate(row.original)
                              : undefined
                        }
                      >
                        {isEditingCell && colDef?.edit ? (
                          <CellEditor
                            spec={colDef.edit.editor}
                            initial={editing.initial}
                            align={colDef.align}
                            onCommit={handleEditorCommit}
                            onCancel={closeEditor}
                          />
                        ) : spreadsheet ? (
                          /* truncate has to sit on a block child — on the flex
                             container itself it does nothing. */
                          <div className="truncate w-full">
                            {pendingValue !== undefined ? String(pendingValue ?? "") : rendered}
                          </div>
                        ) : (
                          rendered
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>

          {/* A shaped skeleton rather than the word "Loading" — it holds the
              column widths, so the grid doesn't jump when the data lands. */}
          {isLoading && rows.length === 0 &&
            Array.from({ length: 8 }, (_, i) => (
              <div
                key={i}
                className={cn("flex border-b", spreadsheet && "border-border")}
                style={{ height: rowHeight }}
              >
                {gutterWidth > 0 && (
                  <div
                    className="sticky left-0 shrink-0 bg-muted border-r border-border"
                    style={{ width: gutterWidth, minWidth: gutterWidth }}
                  />
                )}
                {visibleLeafColumns.map((column) => (
                  <div
                    key={column.id}
                    className={cn("shrink-0 flex items-center", spreadsheet ? "px-2" : "px-3")}
                    style={{ width: column.getSize(), minWidth: column.getSize() }}
                  >
                    <div className="h-2 w-full max-w-[70%] rounded bg-muted animate-pulse" />
                  </div>
                ))}
              </div>
            ))}
          {!isLoading && rows.length === 0 && (
            <div className="flex items-center justify-center h-40 text-muted-foreground">{emptyMessage}</div>
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

      <AlertDialog open={!!pasteConfirm} onOpenChange={(open) => !open && setPasteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply this paste?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>{pasteConfirm ? describePlan(pasteConfirm) : null}</p>
                {pasteConfirm && pasteConfirm.columns.length > 0 && (
                  <p>
                    Columns:{" "}
                    {pasteConfirm.columns
                      .map((id) => columnsById.get(id)?.header || id)
                      .join(", ")}
                  </p>
                )}
                <p>This is saved immediately and cannot be undone.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const plan = pasteConfirm
                setPasteConfirm(null)
                if (plan) void runPlan(plan)
              }}
            >
              Apply
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
