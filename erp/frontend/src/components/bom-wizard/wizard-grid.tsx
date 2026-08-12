"use client"

import { useMemo } from "react"
import { VirtualGrid } from "@/components/virtual-grid"
import type { VirtualGridColumn } from "@/components/grid/types"
import type { WizardGrid, WizardRow } from "@/lib/bom-wizard/types"
import { fieldMeta } from "@/lib/bom-wizard/fields"

interface WizardGridViewProps {
  grid: WizardGrid
  height?: number
  /** Fires on double-click or Enter — used to pick the header row without typing its number. */
  onRowActivate?: (row: WizardRow) => void
}

/**
 * The wizard's grid.
 *
 * Deliberately *not* built from the `grid/columns.tsx` factories: those render
 * a muted em-dash for an empty cell, which is exactly wrong here. Blank cells
 * are the subject matter — they are what Fill Down acts on — so the user has
 * to see real emptiness rather than a placeholder that looks like content.
 */
export function WizardGridView({ grid, height = 560, onRowActivate }: WizardGridViewProps) {
  const columns = useMemo<VirtualGridColumn<WizardRow>[]>(
    () =>
      grid.columns.map((col) => {
        const mapped = grid.mapping[col.id]
        const meta = mapped ? fieldMeta(mapped) : undefined
        const value = (row: WizardRow) => row.cells[col.id] ?? ""

        return {
          id: col.id,
          // The header carries the mapping so it is visible while transforming,
          // rather than only inside the dialog that set it.
          header: meta ? `${col.label}  ⇢ ${meta.short}` : col.label,
          size: 150,
          sortable: true,
          filterable: true,
          accessorFn: value,
          filterAccessor: value,
          cell: (row) => <span className="font-mono text-xs">{value(row)}</span>,
        }
      }),
    [grid.columns, grid.mapping]
  )

  return (
    <VirtualGrid
      data={grid.rows}
      columns={columns}
      bare
      spreadsheet
      height={height}
      getRowId={(row) => String(row.srcIndex)}
      onRowActivate={onRowActivate}
      emptyMessage="Every row has been deleted by the actions above."
      // No storageKey on purpose. Column ids here are positional (F1..Fn), so a
      // width or a hidden column remembered from one BOM would silently apply
      // to an unrelated column of the next file opened.
      rowStripe={(row) => {
        if (!row.mergedFrom?.length) return null
        // mergedFrom holds the rows folded *into* this one, not counting the
        // lead row itself — so the file contributed one more line than it lists.
        const sourceRows = [row.srcIndex, ...row.mergedFrom]
        const shown = sourceRows.slice(0, 8).map((i) => i + 1).join(", ")
        return {
          color: "bg-sky-500",
          label: `Built from ${sourceRows.length} rows of the file (${shown}${
            sourceRows.length > 8 ? "…" : ""
          })`,
        }
      }}
    />
  )
}
