"use client"

import { useMemo } from "react"
import { gridFromSource, applyAction } from "@/lib/bom-wizard/apply"
import { describeAction } from "@/lib/bom-wizard/describe"
import type { Detection } from "@/lib/bom-wizard/detect"
import type { ColumnId, WizardGrid, WizardSource } from "@/lib/bom-wizard/types"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Wand2 } from "lucide-react"

interface DetectionDialogProps {
  source: WizardSource
  detection: Detection
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Record the proposed steps, in order. */
  onApply: () => void
}

/** A couple of real values from a column, so a role can be recognised on sight. */
function sampleOf(grid: WizardGrid, columnId: ColumnId | undefined): string {
  if (!columnId) return ""
  const found: string[] = []
  for (const row of grid.rows) {
    const value = row.cells[columnId]
    if (value && value.trim() !== "") found.push(value.trim().slice(0, 28))
    if (found.length === 2) break
  }
  return found.join(" · ")
}

/**
 * What the wizard thinks this file is, before it does anything about it.
 *
 * Detection proposes; it never applies. The whole value of the wizard over the
 * old importer is that a bad BOM is expensive to unpick, so a guess about which
 * column is the part number gets shown to somebody who knows, and gets
 * confirmed, before a single row moves.
 *
 * The steps are described with the same `describeAction` the recorder panel
 * uses, so what is promised here and what is listed afterwards are the same
 * sentences.
 */
export function DetectionDialog({
  source,
  detection,
  open,
  onOpenChange,
  onApply,
}: DetectionDialogProps) {
  const { roles, leadRows, continuationRows, confident, actions } = detection

  /** The grid with headers in place, purely so roles can be shown by name. */
  const named = useMemo(() => {
    const bare = gridFromSource(source)
    return roles.headerRow === null
      ? bare
      : applyAction(bare, { type: "map_row_to_headers", row: roles.headerRow, deleteRow: true })
  }, [source, roles.headerRow])

  const labelOf = (id: ColumnId | undefined) =>
    id ? (named.columns.find((c) => c.id === id)?.label ?? id) : "—"

  /** Described against the grid as it stands before each step, like the recorder. */
  const described = useMemo(() => {
    const out: { title: string; detail: string }[] = []
    let grid = gridFromSource(source)
    for (const action of actions) {
      out.push(describeAction(action, grid))
      grid = applyAction(grid, action)
    }
    return out
  }, [source, actions])

  const roleRows: { label: string; column: ColumnId | undefined }[] = [
    { label: "Item / line", column: roles.key },
    { label: "Reference designators", column: roles.reference },
    { label: "Quantity", column: roles.quantity },
    { label: "Internal part number", column: roles.partNumber },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-4 w-4" />
            {confident ? "This looks like a wrapped BOM" : "This file was not recognised"}
          </DialogTitle>
          <DialogDescription>
            {confident
              ? "Check what was found before anything is applied. Nothing has changed yet."
              : "No header row or column roles could be identified. The steps will still guide you in order — each one opens blank for you to fill in."}
          </DialogDescription>
        </DialogHeader>

        {confident && (
          <div className="space-y-4">
            <div className="rounded-md border divide-y text-sm">
              <div className="flex items-center gap-3 px-3 py-2">
                <span className="w-44 shrink-0 text-muted-foreground">Header row</span>
                <span className="font-medium">
                  {roles.headerRow === null ? "none" : `Row ${roles.headerRow + 1}`}
                </span>
              </div>
              {roleRows.map((role) => (
                <div key={role.label} className="flex items-center gap-3 px-3 py-2 min-w-0">
                  <span className="w-44 shrink-0 text-muted-foreground">{role.label}</span>
                  <span className="font-medium shrink-0">{labelOf(role.column)}</span>
                  <span className="text-xs text-muted-foreground font-mono truncate">
                    {sampleOf(named, role.column)}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">
                {source.matrix.length} rows &rarr; {leadRows} lines
              </Badge>
              {continuationRows > 0 && (
                <Badge variant="outline">
                  {continuationRows} continuation {continuationRows === 1 ? "row" : "rows"}
                </Badge>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">
                {described.length} {described.length === 1 ? "step" : "steps"} will be recorded
              </p>
              <ol className="rounded-md border divide-y">
                {described.map((step, i) => (
                  <li key={i} className="flex gap-3 px-3 py-2">
                    <span className="text-xs text-muted-foreground w-4 shrink-0">{i + 1}</span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{step.title}</span>
                      <span className="block text-xs text-muted-foreground break-words">
                        {step.detail}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
              <p className="text-xs text-muted-foreground">
                Each lands in the recorder panel as its own step. Delete any one and the rest
                replay without it.
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {confident ? "I’ll do it myself" : "Continue"}
          </Button>
          {confident && <Button onClick={onApply}>Apply these steps</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
