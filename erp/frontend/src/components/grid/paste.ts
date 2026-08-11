import {
  parseCellInput,
  type CellEdit,
  type SelectionRect,
  type VirtualGridColumn,
} from "./types"

export interface PastePlan<T> {
  edits: CellEdit<T>[]
  /** Cells that fell past the last row or last column. */
  clipped: number
  /** Cells landing on a column that isn't editable at all. */
  skipped: number
  /** Cells the row refused, with the reason. */
  blocked: string[]
  /** Cells whose value didn't parse, with the reason. */
  invalid: string[]
  /** Cells that already held the pasted value. */
  unchanged: number
  /** Ids of the columns actually being written. */
  columns: string[]
}

/**
 * Map a clipboard block onto the grid, Excel's way.
 *
 * The block lands at the top-left of the selection, not at the cursor. A single
 * copied cell fills the whole selection; anything larger is placed as-is. The
 * result is clamped to the grid — a paste never creates rows, and whatever fell
 * off the end is counted so the user can be told.
 */
export function planPaste<T>({
  matrix,
  rect,
  rows,
  colIds,
  columns,
  isEditable,
}: {
  matrix: string[][]
  rect: SelectionRect
  rows: { id: string; original: T }[]
  colIds: string[]
  columns: Map<string, VirtualGridColumn<T>>
  isEditable: (row: T, colId: string) => boolean
}): PastePlan<T> {
  const plan: PastePlan<T> = {
    edits: [],
    clipped: 0,
    skipped: 0,
    blocked: [],
    invalid: [],
    unchanged: 0,
    columns: [],
  }

  const single = matrix.length === 1 && matrix[0].length === 1
  const height = single ? rect.r1 - rect.r0 + 1 : matrix.length
  const width = single ? rect.c1 - rect.c0 + 1 : Math.max(...matrix.map((r) => r.length))
  const touched = new Set<string>()

  for (let i = 0; i < height; i++) {
    const rowIdx = rect.r0 + i
    for (let j = 0; j < width; j++) {
      const colIdx = rect.c0 + j
      const raw = single ? matrix[0][0] : matrix[i]?.[j] ?? ""

      const row = rows[rowIdx]
      const colId = colIds[colIdx]
      if (!row || !colId) {
        plan.clipped++
        continue
      }

      const config = columns.get(colId)?.edit
      if (!config) {
        plan.skipped++
        continue
      }

      const verdict = config.isEditable?.(row.original) ?? true
      if (verdict !== true) {
        plan.blocked.push(verdict)
        continue
      }
      if (!isEditable(row.original, colId)) {
        plan.skipped++
        continue
      }

      const parsed = config.parse
        ? config.parse(raw, row.original)
        : parseCellInput(config.editor, raw)
      if ("error" in parsed) {
        plan.invalid.push(parsed.error)
        continue
      }

      const previous = config.getValue(row.original)
      if (String(parsed.value ?? "") === String(previous ?? "")) {
        plan.unchanged++
        continue
      }

      touched.add(colId)
      plan.edits.push({
        rowId: row.id,
        row: row.original,
        columnId: colId,
        field: config.field ?? colId,
        raw,
        value: parsed.value,
        previous,
      })
    }
  }

  plan.columns = Array.from(touched)
  return plan
}

/** One line describing what a paste is about to do, and what it won't. */
export function describePlan<T>(plan: PastePlan<T>): string {
  const rowCount = new Set(plan.edits.map((e) => e.rowId)).size
  const parts = [
    `${plan.edits.length} cell${plan.edits.length === 1 ? "" : "s"} across ${rowCount} row${rowCount === 1 ? "" : "s"}`,
  ]
  if (plan.unchanged) parts.push(`${plan.unchanged} already matching`)
  if (plan.clipped) parts.push(`${plan.clipped} outside the grid`)
  if (plan.skipped) parts.push(`${plan.skipped} in read-only columns`)
  if (plan.blocked.length) parts.push(`${plan.blocked.length} on locked rows`)
  if (plan.invalid.length) parts.push(`${plan.invalid.length} rejected`)
  return parts.join(" · ")
}
