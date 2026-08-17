"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { ColumnId, GridAction, SemanticField, WizardGrid } from "@/lib/bom-wizard/types"
import { SEMANTIC_FIELDS } from "@/lib/bom-wizard/fields"

/** The Select primitive cannot hold an empty value, so "unset" needs a sentinel. */
const NONE = "__none__"

interface ActionDialogProps {
  grid: WizardGrid
  open: boolean
  onOpenChange: (open: boolean) => void
  onRecord: (action: GridAction) => void
}

/** Up to three real values from a column, to show the user what they are picking. */
function samplesOf(grid: WizardGrid, columnId: ColumnId, limit = 3): string {
  const found: string[] = []
  for (const row of grid.rows) {
    const value = row.cells[columnId]
    if (value && value.trim() !== "") found.push(value)
    if (found.length === limit) break
  }
  return found.join(" · ")
}

/** A checkbox list of the grid's columns, each with a sample of its contents. */
function ColumnChecklist({
  grid,
  selected,
  onToggle,
  emptyHint,
}: {
  grid: WizardGrid
  selected: ColumnId[]
  onToggle: (id: ColumnId, checked: boolean) => void
  emptyHint?: string
}) {
  return (
    <div className="h-56 overflow-y-auto rounded-md border">
      <div className="p-2 space-y-1">
        {grid.columns.map((col) => {
          const samples = samplesOf(grid, col.id)
          return (
            <label
              key={col.id}
              className="flex items-start gap-2 rounded px-2 py-1.5 hover:bg-muted/50 cursor-pointer"
            >
              <Checkbox
                className="mt-0.5"
                checked={selected.includes(col.id)}
                onCheckedChange={(checked) => onToggle(col.id, checked === true)}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium truncate">{col.label}</span>
                <span className="block text-xs text-muted-foreground font-mono truncate">
                  {samples || emptyHint || "(empty)"}
                </span>
              </span>
            </label>
          )
        })}
      </div>
    </div>
  )
}

/** A column picker, for the actions that take exactly one. */
function ColumnSelect({
  grid,
  value,
  onChange,
  allowNone,
  placeholder = "Pick a column",
}: {
  grid: WizardGrid
  value: ColumnId | undefined
  onChange: (id: ColumnId | undefined) => void
  allowNone?: boolean
  placeholder?: string
}) {
  return (
    <Select
      // Without an explicit "None" item to hold it, the sentinel would be a
      // value matching no option: Radix then renders neither a selection nor
      // the placeholder, and the control reads as broken. "" is unset.
      value={value ?? (allowNone ? NONE : "")}
      onValueChange={(v) => onChange(v === NONE ? undefined : v)}
    >
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {allowNone && <SelectItem value={NONE}>— None —</SelectItem>}
        {grid.columns.map((col) => (
          <SelectItem key={col.id} value={col.id}>
            {col.label}
            <span className="ml-2 text-xs text-muted-foreground font-mono">
              {samplesOf(grid, col.id, 2)}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

// =============== Use a row as headers ===============

export function HeaderRowDialog({
  grid,
  open,
  onOpenChange,
  onRecord,
  defaultRow,
}: ActionDialogProps & { defaultRow?: number }) {
  const [rowInput, setRowInput] = useState("1")
  const [deleteRow, setDeleteRow] = useState(true)

  // Reopening with a row activated in the grid should offer that row.
  useEffect(() => {
    if (open) setRowInput(String((defaultRow ?? grid.rows[0]?.srcIndex ?? 0) + 1))
  }, [open, defaultRow, grid.rows])

  const srcIndex = Number(rowInput) - 1
  const target = grid.rows.find((r) => r.srcIndex === srcIndex)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Use a row as column headers</DialogTitle>
          <DialogDescription>
            Row numbers are positions in the original file, so they keep pointing at the
            same line no matter what the earlier actions did.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="header-row">Row number</Label>
            <Input
              id="header-row"
              type="number"
              min={1}
              value={rowInput}
              onChange={(e) => setRowInput(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label>Preview</Label>
            {target ? (
              <div className="rounded-md border bg-muted/30 p-2 text-xs font-mono space-y-0.5 max-h-32 overflow-auto">
                {grid.columns.map((col) => (
                  <div key={col.id} className="truncate">
                    <span className="text-muted-foreground">{col.label}: </span>
                    {target.cells[col.id] || <span className="text-muted-foreground">(empty)</span>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-destructive">
                Row {rowInput} is not in the grid — it may have been deleted by an earlier action.
              </p>
            )}
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={deleteRow}
              onCheckedChange={(checked) => setDeleteRow(checked === true)}
            />
            <span className="text-sm">Remove the row from the data once it is the header</span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!target}
            onClick={() => {
              onRecord({ type: "map_row_to_headers", row: srcIndex, deleteRow })
              onOpenChange(false)
            }}
          >
            Use as headers
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// =============== Fill down ===============

export function FillDownDialog({ grid, open, onOpenChange, onRecord }: ActionDialogProps) {
  const [columns, setColumns] = useState<ColumnId[]>([])
  const [anchor, setAnchor] = useState<ColumnId | undefined>(undefined)

  useEffect(() => {
    if (open) {
      setColumns([])
      setAnchor(undefined)
    }
  }, [open])

  const toggle = (id: ColumnId, checked: boolean) =>
    setColumns((prev) => (checked ? [...prev, id] : prev.filter((c) => c !== id)))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Fill down</DialogTitle>
          <DialogDescription>
            Copies each value downward into the blank cells beneath it, so the continuation
            rows of a wrapped line carry the same data as the line they belong to.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Columns to fill</Label>
            <ColumnChecklist grid={grid} selected={columns} onToggle={toggle} />
          </div>

          <div className="space-y-2">
            <Label>Anchor column (optional)</Label>
            <ColumnSelect grid={grid} value={anchor} onChange={setAnchor} allowNone />
            <p className="text-xs text-muted-foreground">
              The column that marks the start of a new item — usually the item or line
              number. With an anchor set, a blank is only filled on a continuation row; a
              genuinely empty cell on a new item is left alone.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={columns.length === 0}
            onClick={() => {
              onRecord({
                type: "fill_down",
                columns,
                ...(anchor ? { anchorColumn: anchor } : {}),
              })
              onOpenChange(false)
            }}
          >
            Fill {columns.length || ""} {columns.length === 1 ? "column" : "columns"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// =============== Merge references ===============

export function MergeReferencesDialog({ grid, open, onOpenChange, onRecord }: ActionDialogProps) {
  const [keyColumns, setKeyColumns] = useState<ColumnId[]>([])
  const [mergeColumn, setMergeColumn] = useState<ColumnId | undefined>(undefined)
  const [separator, setSeparator] = useState(",")
  const [joinWith, setJoinWith] = useState(", ")
  const [dedupe, setDedupe] = useState(false)

  useEffect(() => {
    if (open) {
      setKeyColumns([])
      setMergeColumn(undefined)
      setSeparator(",")
      setJoinWith(", ")
      setDedupe(false)
    }
  }, [open])

  const toggle = (id: ColumnId, checked: boolean) =>
    setKeyColumns((prev) => (checked ? [...prev, id] : prev.filter((c) => c !== id)))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Merge continuation rows</DialogTitle>
          <DialogDescription>
            Collapses a run of adjacent rows that share the same key into one line,
            concatenating the reference designators across them. Only adjacent rows merge,
            so two separate appearances of the same part stay two lines.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Key columns — rows merge while these stay the same</Label>
            <ColumnChecklist grid={grid} selected={keyColumns} onToggle={toggle} />
          </div>

          <div className="space-y-2">
            <Label>Column to concatenate</Label>
            <ColumnSelect
              grid={grid}
              value={mergeColumn}
              onChange={setMergeColumn}
              placeholder="Usually the reference designators"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="merge-sep">Separator within a cell</Label>
              <Input
                id="merge-sep"
                value={separator}
                onChange={(e) => setSeparator(e.target.value)}
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="merge-join">Rejoin with</Label>
              <Input
                id="merge-join"
                value={joinWith}
                onChange={(e) => setJoinWith(e.target.value)}
                className="font-mono"
              />
            </div>
          </div>

          <label className="flex items-start gap-2 cursor-pointer">
            <Checkbox
              className="mt-0.5"
              checked={dedupe}
              onCheckedChange={(checked) => setDedupe(checked === true)}
            />
            <span className="text-sm">
              Drop repeated designators
              <span className="block text-xs text-muted-foreground">
                Off by default — a designator appearing twice is usually a real error in the
                file, and worth seeing rather than silently removing.
              </span>
            </span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={keyColumns.length === 0 || !mergeColumn || separator === ""}
            onClick={() => {
              onRecord({
                type: "merge_references",
                keyColumns,
                mergeColumn: mergeColumn!,
                separator,
                joinWith,
                dedupe,
              })
              onOpenChange(false)
            }}
          >
            Merge
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// =============== Column mapping ===============

export function MappingDialog({ grid, open, onOpenChange, onRecord }: ActionDialogProps) {
  const [mapping, setMapping] = useState<Record<ColumnId, SemanticField>>({})

  useEffect(() => {
    if (open) setMapping({ ...grid.mapping })
  }, [open, grid.mapping])

  /** A field belongs to one column, so picking it elsewhere moves it. */
  const assign = (columnId: ColumnId, field: SemanticField | undefined) =>
    setMapping((prev) => {
      const next: Record<ColumnId, SemanticField> = {}
      for (const [id, value] of Object.entries(prev)) {
        if (id !== columnId && value !== field) next[id] = value
      }
      if (field) next[columnId] = field
      return next
    })

  const missing = useMemo(
    () =>
      SEMANTIC_FIELDS.filter(
        (f) => f.required && !Object.values(mapping).includes(f.value)
      ),
    [mapping]
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Map columns to BOM fields</DialogTitle>
          <DialogDescription>
            Anything left unmapped is simply not imported. Each field can only come from one
            column — choosing it again moves it.
          </DialogDescription>
        </DialogHeader>

        <div className="h-80 overflow-y-auto rounded-md border">
          <div className="p-2 space-y-1">
            {grid.columns.map((col) => (
              <div key={col.id} className="flex items-center gap-3 rounded px-2 py-1.5">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium truncate">{col.label}</span>
                  <span className="block text-xs text-muted-foreground font-mono truncate">
                    {samplesOf(grid, col.id) || "(empty)"}
                  </span>
                </span>
                <Select
                  value={mapping[col.id] ?? NONE}
                  onValueChange={(v) =>
                    assign(col.id, v === NONE ? undefined : (v as SemanticField))
                  }
                >
                  <SelectTrigger className="w-56 shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— Not imported —</SelectItem>
                    {SEMANTIC_FIELDS.map((f) => (
                      <SelectItem key={f.value} value={f.value}>
                        {f.label}
                        {f.required ? " *" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        </div>

        {missing.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Still unmapped: {missing.map((f) => f.label).join(", ")}. You can map these later
            — they are only needed to commit.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onRecord({ type: "set_column_mapping", mapping })
              onOpenChange(false)
            }}
          >
            Apply mapping
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
