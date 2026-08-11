/**
 * The BOM Wizard document model.
 *
 * A wizard session is an immutable source matrix plus an ordered list of
 * actions. The grid the user sees is always `actions.slice(0, cursor)` folded
 * over the source — never a mutated copy. That is what makes Undo, Redo,
 * "delete the third action", and "replay last month's recipe on this month's
 * file" all the same operation: change the action list, fold again.
 */

/**
 * Stable column identity, assigned "F1".."Fn" from position when the file is
 * parsed and never reused. Deleting F3 leaves F4..Fn alone, so an action
 * recorded before the delete still refers to the column it meant.
 */
export type ColumnId = string

/** The BOM fields a raw column can be mapped onto. Mirrors `BomImportField` in `lib/api.ts`, minus "ignore" — an unmapped column is simply absent from the mapping. */
export type SemanticField =
  | "internal_part_number"
  | "description"
  | "alternate_ipn"
  | "manufacturer"
  | "manufacturer_pn"
  | "quantity_required"
  | "reference_designators"
  | "line_number"
  | "resource_type"
  | "polarized"
  | "notes"

export interface WizardColumn {
  id: ColumnId
  /** Header text lifted from the file by `map_row_to_headers`; the id until then. */
  label: string
}

export interface WizardRow {
  /** Position in the source matrix. Stable across every action, so actions can address rows without caring what ran before them. */
  srcIndex: number
  cells: Record<ColumnId, string>
  /**
   * Source rows folded into this one by `merge_references`. Kept so the UI can
   * show "this line came from 8 rows of the file" and so a reviewer can trace a
   * designator list back to the cells it was built from.
   */
  mergedFrom?: number[]
}

export interface WizardGrid {
  columns: WizardColumn[]
  rows: WizardRow[]
  /** Raw column -> BOM field. Written only by `set_column_mapping`. */
  mapping: Record<ColumnId, SemanticField>
  /** Which source row supplied the column labels, for display. */
  headerRowIndex: number | null
}

/**
 * The v1 action set.
 *
 * Every action is data, not a closure, so the list serialises to JSON as-is —
 * which is the whole feature behind Save / Export / Import of recipes. Adding
 * Merge, Split, Replace, Add Text, Create IPN Column or Join File later means
 * one more variant here and one more `case` in `apply.ts`; nothing about the
 * recorder, undo/redo or persistence changes.
 */
export type GridAction =
  /** Promote a data row to be the column headers. */
  | { type: "map_row_to_headers"; row: number; deleteRow: boolean }
  /** Assign raw columns to BOM fields. Replaces the mapping wholesale. */
  | { type: "set_column_mapping"; mapping: Record<ColumnId, SemanticField> }
  /** Propagate values downward into blank cells. See `fillDown` for the anchor rule. */
  | { type: "fill_down"; columns: ColumnId[]; anchorColumn?: ColumnId }
  /** Collapse adjacent rows sharing a key, concatenating one column across them. */
  | {
      type: "merge_references"
      keyColumns: ColumnId[]
      mergeColumn: ColumnId
      /** Delimiter *within* a cell. Real files use ",". */
      separator: string
      /** Delimiter used to rejoin. Conventionally ", ". */
      joinWith: string
      /** Drop repeated designators instead of keeping them. Off by default: a repeat is a real error worth surfacing. */
      dedupe: boolean
    }
  | { type: "delete_rows"; rows: number[] }
  | { type: "delete_columns"; columns: ColumnId[] }

/** An action plus the bookkeeping the recorder panel needs. */
export interface RecordedAction {
  id: string
  action: GridAction
  /** The only user-editable field — the recorder's Comments column. */
  comment?: string
  recorded_at: string
}

/** A saved, replayable transformation sequence. This is the Import/Export file format. */
export interface BomRecipe {
  schema_version: 1
  name: string
  description?: string
  actions: RecordedAction[]
}

export interface WizardSource {
  fileName: string
  sheetName: string
  /** Rectangular: every row padded to the widest. */
  matrix: string[][]
}

export interface WizardDoc {
  source: WizardSource
  actions: RecordedAction[]
  /** How many actions are applied. Undo decrements, redo increments. */
  cursor: number
}

/** A non-blocking problem found in the grid. Warnings never mutate data and never prevent a commit. */
export interface GridWarning {
  kind:
    | "quantity_mismatch"
    | "duplicate_designator"
    | "unmapped_resource_type"
    | "missing_ipn"
    | "invalid_quantity"
    | "duplicate_key"
  /** Source row this concerns, for click-to-scroll. */
  srcIndex: number
  message: string
}
