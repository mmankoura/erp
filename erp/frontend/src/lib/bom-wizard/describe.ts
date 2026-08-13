/**
 * Recorded action -> the words the recorder panel shows.
 *
 * Every description is rendered against the grid as it stood *before* that
 * action ran, because that is the only state where its arguments still make
 * sense: an action that deletes a column names a column that no longer exists
 * afterwards, and one recorded before a header row was mapped refers to
 * columns still called F1..Fn.
 *
 * Pure, so the wording is pinned by tests rather than eyeballed in the panel.
 */

import type { GridAction, WizardGrid } from "./types"
import { fieldMeta } from "./fields"

export interface ActionDescription {
  title: string
  /** The specifics — which columns, which row, what separator. */
  detail: string
}

/** A column's label in the grid this action was recorded against, falling back to its id. */
const labelOf = (grid: WizardGrid, id: string): string =>
  grid.columns.find((c) => c.id === id)?.label || id

const labelsOf = (grid: WizardGrid, ids: string[]): string =>
  ids.map((id) => labelOf(grid, id)).join(", ")

/** Row numbers are 1-based everywhere the user can see them. */
const rowNumber = (srcIndex: number): string => String(srcIndex + 1)

/** Quote a separator so a space or an empty string is visible rather than invisible. */
const quoted = (value: string): string => `"${value}"`

const listWithOverflow = (items: string[], limit: number): string =>
  items.length <= limit
    ? items.join(", ")
    : `${items.slice(0, limit).join(", ")} and ${items.length - limit} more`

export function describeAction(action: GridAction, before: WizardGrid): ActionDescription {
  switch (action.type) {
    case "map_row_to_headers":
      return {
        title: "Use row as headers",
        detail: `Row ${rowNumber(action.row)}${
          action.deleteRow ? ", removed from the data" : ", kept in the data"
        }`,
      }

    case "set_column_mapping": {
      const pairs = Object.entries(action.mapping).map(([columnId, field]) => {
        const meta = fieldMeta(field)
        return `${labelOf(before, columnId)} ⇢ ${meta?.short ?? field}`
      })
      return {
        title: "Map columns",
        detail: pairs.length ? listWithOverflow(pairs, 4) : "Nothing mapped",
      }
    }

    case "fill_down":
      return {
        title: "Fill down",
        detail: [
          labelsOf(before, action.columns) || "no columns",
          action.anchorColumn
            ? `anchored on ${labelOf(before, action.anchorColumn)}`
            : "no anchor — every blank is filled",
        ].join(", "),
      }

    case "merge_references":
      return {
        title: "Merge continuation rows",
        detail: [
          `grouped by ${labelsOf(before, action.keyColumns) || "nothing"}`,
          `joining ${labelOf(before, action.mergeColumn)}`,
          `split on ${quoted(action.separator)}, rejoined with ${quoted(action.joinWith)}`,
          action.dedupe ? "duplicates dropped" : "duplicates kept",
        ].join(" · "),
      }

    case "delete_rows":
      return {
        title: `Delete ${action.rows.length} ${action.rows.length === 1 ? "row" : "rows"}`,
        detail: listWithOverflow(action.rows.map(rowNumber), 8),
      }

    case "delete_columns":
      return {
        title: `Delete ${action.columns.length} ${
          action.columns.length === 1 ? "column" : "columns"
        }`,
        detail: listWithOverflow(
          action.columns.map((id) => labelOf(before, id)),
          6
        ),
      }
  }
}
