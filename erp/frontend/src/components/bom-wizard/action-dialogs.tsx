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
import { parseRowSpec, formatRowSpec } from "@/lib/bom-wizard/row-spec"
import { SEMANTIC_FIELDS } from "@/lib/bom-wizard/fields"

/** The Select primitive cannot hold an empty value, so "unset" needs a sentinel. */
const NONE = "__none__"

interface ActionDialogProps {
  grid: WizardGrid
  open: boolean
  onOpenChange: (open: boolean) => void
  onRecord: (action: GridAction) => void
}

/**
 * Long enough to recognise a value by, short enough that three of them still
 * read as a sample rather than as the data.
 */
const SAMPLE_MAX = 40

/**
 * A merged reference cell holds every designator on the line — hundreds of
 * characters, where a sample needs a dozen. Clipped here as well as in the
 * layout: the point of the line is "which column is this", and a value long
 * enough to need scrolling has stopped answering that.
 */
const clip = (value: string) =>
  value.length > SAMPLE_MAX ? `${value.slice(0, SAMPLE_MAX)}…` : value

/** Up to three real values from a column, to show the user what they are picking. */
function samplesOf(grid: WizardGrid, columnId: ColumnId, limit = 3): string {
  const found: string[] = []
  for (const row of grid.rows) {
    const value = row.cells[columnId]
    if (value && value.trim() !== "") found.push(clip(value.trim()))
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

// =============== Delete rows ===============

/** Everything on a row, joined, so a preview line is recognisable. */
function rowSummary(grid: WizardGrid, srcIndex: number): string {
  const row = grid.rows.find((r) => r.srcIndex === srcIndex)
  if (!row) return ""
  const cells = grid.columns
    .map((c) => row.cells[c.id]?.trim())
    .filter((v): v is string => !!v)
  return cells.join(" · ") || "(empty)"
}

/** How many preview lines before it stops being a preview. */
const PREVIEW_ROWS = 8

/**
 * Remove rows from the grid.
 *
 * Real files open with a preamble — a title, who wrote the list, the date —
 * before the header row, and a BOM cannot be read until that is gone. The
 * engine has always been able to delete rows; nothing in the interface reached
 * it, so the preamble had to be cut in Excel first.
 *
 * Rows are named by the number in the gutter, because that is the number the
 * user can see. `parseRowSpec` converts to the `srcIndex` every action stores.
 */
export function DeleteRowsDialog({ grid, open, onOpenChange, onRecord }: ActionDialogProps) {
  const [spec, setSpec] = useState("")

  useEffect(() => {
    if (open) setSpec("")
  }, [open])

  const parsed = useMemo(() => parseRowSpec(spec), [spec])
  const error = "error" in parsed ? parsed.error : undefined
  const wanted = "error" in parsed ? [] : parsed.rows

  // A row already removed by an earlier step cannot be removed again.
  const present = useMemo(() => new Set(grid.rows.map((r) => r.srcIndex)), [grid])
  const targets = useMemo(() => wanted.filter((r) => present.has(r)), [wanted, present])
  const gone = wanted.length - targets.length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Delete rows</DialogTitle>
          <DialogDescription>
            Removes rows from the grid by the number shown in the gutter. Nothing is
            written to the file, and deleting the step puts them back.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="row-spec">Rows to delete</Label>
            <Input
              id="row-spec"
              value={spec}
              onChange={(e) => setSpec(e.target.value)}
              placeholder="e.g. 1-6, 12"
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              A run like <span className="font-mono">1-6</span>, single rows like{" "}
              <span className="font-mono">12</span>, or both:{" "}
              <span className="font-mono">1-6, 12</span>. Usually the preamble above the
              header row.
            </p>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          {!error && targets.length > 0 && (
            <div className="space-y-2">
              <Label>
                {targets.length} {targets.length === 1 ? "row" : "rows"} will be removed
                {gone > 0 && (
                  <span className="font-normal text-muted-foreground">
                    {" "}
                    ({gone} already gone)
                  </span>
                )}
              </Label>
              <div className="max-h-56 overflow-auto rounded-md border">
                <div className="p-2 space-y-0.5">
                  {targets.slice(0, PREVIEW_ROWS).map((srcIndex) => (
                    <p key={srcIndex} className="text-xs truncate">
                      <span className="text-muted-foreground">Row {srcIndex + 1}:</span>{" "}
                      <span className="font-mono">{rowSummary(grid, srcIndex)}</span>
                    </p>
                  ))}
                  {targets.length > PREVIEW_ROWS && (
                    <p className="text-xs text-muted-foreground">
                      … and {targets.length - PREVIEW_ROWS} more
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={targets.length === 0}
            onClick={() => {
              onRecord({ type: "delete_rows", rows: targets })
              onOpenChange(false)
            }}
          >
            Delete {formatRowSpec(targets) || ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// =============== Fill down ===============

interface FillDownDialogProps extends ActionDialogProps {
  /** What detection made of the file, so the dialog does not open blank. */
  seed?: { columns: ColumnId[]; anchorColumn?: ColumnId }
}

export function FillDownDialog({
  grid,
  open,
  onOpenChange,
  onRecord,
  seed,
}: FillDownDialogProps) {
  const [columns, setColumns] = useState<ColumnId[]>([])
  const [anchor, setAnchor] = useState<ColumnId | undefined>(undefined)

  // Seeded on the open transition only. `seed` is rebuilt whenever the grid is,
  // so following it would reset the user's choices mid-edit.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (open) {
      setColumns(seed?.columns ?? [])
      setAnchor(seed?.anchorColumn)
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

interface MergeReferencesDialogProps extends ActionDialogProps {
  /** What detection made of the file, so the dialog does not open blank. */
  seed?: { keyColumns: ColumnId[]; mergeColumn?: ColumnId }
}

export function MergeReferencesDialog({
  grid,
  open,
  onOpenChange,
  onRecord,
  seed,
}: MergeReferencesDialogProps) {
  const [keyColumns, setKeyColumns] = useState<ColumnId[]>([])
  const [mergeColumn, setMergeColumn] = useState<ColumnId | undefined>(undefined)
  const [separator, setSeparator] = useState(",")
  const [joinWith, setJoinWith] = useState(", ")
  const [dedupe, setDedupe] = useState(false)

  // Seeded on the open transition only — see FillDownDialog.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (open) {
      setKeyColumns(seed?.keyColumns ?? [])
      setMergeColumn(seed?.mergeColumn)
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

interface MappingDialogProps extends ActionDialogProps {
  /** Detection's reading of the headers, used only when nothing is mapped yet. */
  seed?: Record<ColumnId, SemanticField>
}

export function MappingDialog({
  grid,
  open,
  onOpenChange,
  onRecord,
  seed,
}: MappingDialogProps) {
  const [mapping, setMapping] = useState<Record<ColumnId, SemanticField>>({})

  // On the open transition only. `grid.mapping` is a fresh object on every
  // replay, so depending on it meant any recorded action — anywhere — threw
  // away whatever the user had picked so far without telling them.
  // A mapping that already exists always beats detection's guess.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return
    setMapping(
      Object.keys(grid.mapping).length > 0 ? { ...grid.mapping } : { ...(seed ?? {}) }
    )
  }, [open])

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
