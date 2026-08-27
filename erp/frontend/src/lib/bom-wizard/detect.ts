/**
 * Recognising a BOM file's shape, so the wizard can propose a recipe instead of
 * asking the user to re-derive the same structure on every import.
 *
 * Pure and separate from the dialogs for the usual reason: "which column is the
 * item number" is a claim that can be tested against a real file, and a claim
 * worth being wrong about loudly. Nothing here applies anything — it returns a
 * proposal that the user confirms.
 *
 * Deliberately emits only the existing `GridAction` variants. A new variant
 * would need four separate edits, one of which TypeScript does not enforce, and
 * would make older builds reject every recipe written by this one.
 */

import { gridFromSource, applyAction } from "./apply"
import type {
  ColumnId,
  GridAction,
  SemanticField,
  WizardGrid,
  WizardSource,
} from "./types"

const blank = (value: string | undefined) => !value || value.trim() === ""

/** Commas and runs of whitespace become single spaces, so "MFR,PART #" matches "mfr part #". */
const normalise = (label: string) =>
  label.toLowerCase().replace(/[,;]+/g, " ").replace(/\s+/g, " ").trim()

/**
 * A header's BOM field, or nothing when the header does not clearly name one.
 *
 * Order matters and is the whole subtlety. "Alazar P/N" is AEGIS's *internal*
 * part number and must not be read as a manufacturer P/N, while "MPN" must —
 * so every manufacturer rule is tried before the bare p/n rule that catches the
 * customer-prefixed spelling.
 *
 * Ambiguous headers are left unmapped on purpose. A bare "Part" column sits
 * next to "Alazar P/N" in the AEGIS files and is sometimes one, sometimes the
 * other; guessing it would be worse than asking.
 */
export function fieldForHeader(label: string): SemanticField | undefined {
  const h = normalise(label)
  if (h === "") return undefined

  const has = (...needles: string[]) => needles.some((n) => h.includes(n))
  const madeBy = has("mfr", "mfg", "manufacturer", "vendor", "supplier")

  if (h === "mpn" || has("mpn")) return "manufacturer_pn"
  if (madeBy && has("p/n", "pn", "part")) return "manufacturer_pn"
  if (madeBy) return "manufacturer"

  if (has("alternate", "alt ipn")) return "alternate_ipn"
  if (has("ipn", "internal", "part number", "part #", "part no")) {
    return "internal_part_number"
  }
  // "Alazar P/N" — a customer-prefixed internal part number.
  if (has("p/n", "p / n")) return "internal_part_number"

  if (has("desc")) return "description"
  if (has("qty", "quantity")) return "quantity_required"
  if (has("ref", "designator")) return "reference_designators"
  if (h === "line" || has("line number", "line no")) return "line_number"
  if (has("resource", "type")) return "resource_type"
  if (has("polar")) return "polarized"
  if (has("note", "comment")) return "notes"

  return undefined
}

/** Headers that name the column marking where one line item starts. */
const KEY_WORDS = ["item", "line", "seq", "pos"]

const looksLikeKey = (label: string): boolean => {
  const h = normalise(label)
  if (h === "" ) return false
  if (h === "#" || h === "no" || h === "no.") return true
  return KEY_WORDS.some((w) => h === w || h.startsWith(`${w} `) || h.includes(w))
}

/** How many header cells of a row name something the wizard recognises. */
function headerScore(row: string[]): number {
  let score = 0
  for (const cell of row) {
    if (blank(cell)) continue
    if (fieldForHeader(cell) !== undefined || looksLikeKey(cell)) score++
  }
  return score
}

/** How far into a file a header row is worth looking for. */
const HEADER_SEARCH_DEPTH = 20

/** At least this many recognised headers before a row is believed to be one. */
const HEADER_MIN_SCORE = 2

export interface DetectedRoles {
  /** A `srcIndex`, matching what `map_row_to_headers` takes. */
  headerRow: number | null
  /** The column that marks the start of a line — the merge grouping key. */
  key?: ColumnId
  /** The column concatenated across a wrapped run. */
  reference?: ColumnId
  quantity?: ColumnId
  partNumber?: ColumnId
  mapping: Record<ColumnId, SemanticField>
}

export interface Detection {
  roles: DetectedRoles
  /** Rows that start a line — the number of BOM lines this file holds. */
  leadRows: number
  /** Rows with no key, which belong to the line above them. */
  continuationRows: number
  /** Enough was recognised to propose something. False leaves the dialogs blank. */
  confident: boolean
  /** The proposed recipe, in the order it must be applied. */
  actions: GridAction[]
}

/**
 * Whether an action would change this grid at all.
 *
 * `applyAction` returns the identical object when it changed nothing, so this
 * is an exact answer rather than a second, drifting implementation of each
 * action's rules. It is what lets the wizard say a step is "not needed for this
 * file" as a fact.
 *
 * True of five of the six action variants. `set_column_mapping` always
 * allocates (`{ ...grid, mapping }`), so this can never report it unchanged —
 * do not build a "needed?" badge on it. `merge_references`, the one step this
 * is actually asked about, returns the identical grid whenever no run
 * collapsed, which is exactly the question being asked.
 *
 * Note it answers "does this change the grid", not "does this matter".
 * `fill_down` before a merge rewrites every continuation row and then has all
 * of it discarded by the merge — changed, yet redundant. That is why fill down
 * is not a stepper step.
 */
export const wouldChangeAnything = (grid: WizardGrid, action: GridAction): boolean =>
  applyAction(grid, action) !== grid

/**
 * Count the runs a merge would collapse.
 *
 * Mirrors `mergeReferences`' own rule — a run starts at a keyed row and absorbs
 * the keyless rows beneath it — so the count the user is shown is the count
 * they will get. A keyless row before any keyed row belongs to nothing and is
 * left out of both totals, exactly as merge leaves it in place.
 */
function countRuns(grid: WizardGrid, key: ColumnId): { lead: number; continuation: number } {
  let lead = 0
  let continuation = 0
  let started = false

  for (const row of grid.rows) {
    if (!blank(row.cells[key])) {
      lead++
      started = true
    } else if (started) {
      continuation++
    }
  }

  return { lead, continuation }
}

/**
 * What this file looks like, and the recipe that would flatten it.
 *
 * Never throws and never asserts: an unrecognised file comes back with
 * `confident: false` and no actions, which the wizard shows as "you choose"
 * rather than as a failure. Detection is a head start, not a prerequisite.
 */
export function detectStructure(source: WizardSource): Detection {
  const bare = gridFromSource(source)

  // --- the header row ---
  const depth = Math.min(HEADER_SEARCH_DEPTH, source.matrix.length)
  let headerRow: number | null = null
  let best = 0
  for (let i = 0; i < depth; i++) {
    const score = headerScore(source.matrix[i])
    if (score > best) {
      best = score
      headerRow = i
    }
  }
  if (best < HEADER_MIN_SCORE) headerRow = null

  if (headerRow === null) {
    return {
      roles: { headerRow: null, mapping: {} },
      leadRows: 0,
      continuationRows: 0,
      confident: false,
      actions: [],
    }
  }

  // --- column roles, read off the header row once it is in place ---
  const headerAction: GridAction = {
    type: "map_row_to_headers",
    row: headerRow,
    deleteRow: true,
  }
  const named = applyAction(bare, headerAction)

  const mapping: Record<ColumnId, SemanticField> = {}
  let key: ColumnId | undefined
  const taken = new Set<SemanticField>()

  for (const column of named.columns) {
    if (key === undefined && looksLikeKey(column.label)) key = column.id

    const field = fieldForHeader(column.label)
    // One field, one column — the mapping dialog enforces the same rule, and
    // the first spelling of a duplicated header is the one the file leads with.
    if (field !== undefined && !taken.has(field)) {
      mapping[column.id] = field
      taken.add(field)
    }
  }

  const columnOf = (field: SemanticField): ColumnId | undefined =>
    named.columns.find((c) => mapping[c.id] === field)?.id

  const roles: DetectedRoles = {
    headerRow,
    key,
    reference: columnOf("reference_designators"),
    quantity: columnOf("quantity_required"),
    partNumber: columnOf("internal_part_number"),
    mapping,
  }

  // --- how the rows are shaped ---
  const runs = key ? countRuns(named, key) : { lead: named.rows.length, continuation: 0 }

  // --- the proposal ---
  const actions: GridAction[] = [headerAction]

  if (key && roles.reference && runs.continuation > 0) {
    const merge: GridAction = {
      type: "merge_references",
      keyColumns: [key],
      mergeColumn: roles.reference,
      separator: ",",
      joinWith: ", ",
      dedupe: false,
    }
    // Only propose it if it would actually collapse something.
    if (wouldChangeAnything(named, merge)) actions.push(merge)
  }

  if (Object.keys(mapping).length > 0) {
    actions.push({ type: "set_column_mapping", mapping })
  }

  return {
    roles,
    leadRows: runs.lead,
    continuationRows: runs.continuation,
    confident: Object.keys(mapping).length >= 2,
    actions,
  }
}
