/**
 * Recipes: the saved, replayable action list.
 *
 * Two destinations, one shape. `/bom/wizard/recipes` stores the action list
 * opaquely in jsonb, and Export writes the same array to a file — which is why
 * validation lives here rather than on the server. The backend deliberately
 * does not know the action schema, so nothing between a hand-edited file and
 * `replay` will catch a malformed action unless this does.
 *
 * Pure. `parseRecipeFile` never throws; it returns the reason instead.
 */

import type { BomRecipe, GridAction, RecordedAction, SemanticField } from "./types"

export const SCHEMA_VERSION = 1

/** What `/bom/wizard/recipes` returns. `actions` is opaque until validated. */
export interface StoredRecipe {
  id: string
  name: string
  description: string | null
  schema_version: number
  actions: unknown[]
  created_by: string | null
  created_at: string
  updated_at: string
}

const SEMANTIC_FIELDS: ReadonlySet<string> = new Set<SemanticField>([
  "internal_part_number",
  "description",
  "alternate_ipn",
  "manufacturer",
  "manufacturer_pn",
  "quantity_required",
  "reference_designators",
  "line_number",
  "resource_type",
  "polarized",
  "notes",
])

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v)

const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string")

const isIntArray = (v: unknown): v is number[] =>
  Array.isArray(v) && v.every((x) => typeof x === "number" && Number.isInteger(x))

/**
 * Validate one action.
 *
 * Returns the reason it is unusable, or null when it is fine. Deliberately
 * strict about the fields `apply.ts` reads without checking — a missing
 * `separator` on a merge would otherwise split on `undefined` and quietly
 * produce a grid that looks plausible and is wrong.
 */
export function actionProblem(value: unknown): string | null {
  if (!isObject(value)) return "not an object"

  switch (value.type) {
    case "map_row_to_headers":
      if (typeof value.row !== "number" || !Number.isInteger(value.row) || value.row < 0) {
        return "map_row_to_headers needs a whole, non-negative row"
      }
      if (typeof value.deleteRow !== "boolean") return "map_row_to_headers needs deleteRow"
      return null

    case "set_column_mapping": {
      if (!isObject(value.mapping)) return "set_column_mapping needs a mapping object"
      for (const [columnId, field] of Object.entries(value.mapping)) {
        if (typeof field !== "string" || !SEMANTIC_FIELDS.has(field)) {
          return `set_column_mapping has an unknown field "${String(field)}" on ${columnId}`
        }
      }
      return null
    }

    case "fill_down":
      if (!isStringArray(value.columns)) return "fill_down needs a list of columns"
      if (value.anchorColumn !== undefined && typeof value.anchorColumn !== "string") {
        return "fill_down anchorColumn must be a column id"
      }
      return null

    case "merge_references":
      if (!isStringArray(value.keyColumns)) return "merge_references needs keyColumns"
      if (typeof value.mergeColumn !== "string") return "merge_references needs a mergeColumn"
      if (typeof value.separator !== "string" || value.separator === "") {
        return "merge_references needs a separator"
      }
      if (typeof value.joinWith !== "string") return "merge_references needs joinWith"
      if (typeof value.dedupe !== "boolean") return "merge_references needs dedupe"
      return null

    case "delete_rows":
      if (!isIntArray(value.rows)) return "delete_rows needs a list of row numbers"
      return null

    case "delete_columns":
      if (!isStringArray(value.columns)) return "delete_columns needs a list of columns"
      return null

    default:
      return `unknown action type "${String(value.type)}"`
  }
}

/**
 * Validate a stored or imported action list.
 *
 * Ids and timestamps are repaired rather than rejected: a hand-written recipe
 * that lists the actions but omits the bookkeeping is still a perfectly good
 * recipe, and the recorder only needs the id to be unique within the list.
 */
export function parseActions(
  value: unknown,
  makeId: (index: number) => string
): { actions: RecordedAction[] } | { error: string } {
  if (!Array.isArray(value)) return { error: "The recipe's actions are not a list." }

  const actions: RecordedAction[] = []

  for (const [index, entry] of value.entries()) {
    // Accept both a bare action and a recorded one wrapping it.
    const isWrapped = isObject(entry) && "action" in entry
    const raw = isWrapped ? (entry as Record<string, unknown>).action : entry

    const problem = actionProblem(raw)
    if (problem) return { error: `Step ${index + 1}: ${problem}.` }

    const wrapper = isWrapped ? (entry as Record<string, unknown>) : {}
    const comment = typeof wrapper.comment === "string" ? wrapper.comment.trim() : ""

    actions.push({
      id: typeof wrapper.id === "string" && wrapper.id ? wrapper.id : makeId(index),
      action: raw as GridAction,
      recorded_at:
        typeof wrapper.recorded_at === "string" ? wrapper.recorded_at : new Date(0).toISOString(),
      ...(comment ? { comment } : {}),
    })
  }

  // Ids only have to be unique within the list; a file with repeats would make
  // "delete this step" ambiguous, so renumber rather than refuse.
  const seen = new Set<string>()
  return {
    actions: actions.map((recorded, index) => {
      if (seen.has(recorded.id)) return { ...recorded, id: makeId(index) }
      seen.add(recorded.id)
      return recorded
    }),
  }
}

/** The Export file format. */
export function toRecipeFile(
  name: string,
  description: string | undefined,
  actions: RecordedAction[]
): BomRecipe {
  return {
    schema_version: SCHEMA_VERSION,
    name: name.trim(),
    ...(description?.trim() ? { description: description.trim() } : {}),
    actions,
  }
}

/**
 * Read an exported recipe back. Never throws — bad JSON, a future schema and a
 * malformed action all come back as a message the dialog can show.
 */
export function parseRecipeFile(
  text: string,
  makeId: (index: number) => string
): { recipe: BomRecipe } | { error: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { error: "That file is not valid JSON." }
  }

  if (!isObject(parsed)) return { error: "A recipe file must contain a single object." }

  const version = parsed.schema_version
  if (typeof version !== "number") {
    return { error: "That file has no schema_version, so it is not a recipe." }
  }
  if (version > SCHEMA_VERSION) {
    return {
      error: `That recipe was written by a newer wizard (schema ${version}); this one understands ${SCHEMA_VERSION}.`,
    }
  }

  const result = parseActions(parsed.actions, makeId)
  if ("error" in result) return result

  return {
    recipe: {
      schema_version: SCHEMA_VERSION,
      name: typeof parsed.name === "string" && parsed.name.trim() ? parsed.name.trim() : "Imported recipe",
      ...(typeof parsed.description === "string" && parsed.description.trim()
        ? { description: parsed.description.trim() }
        : {}),
      actions: result.actions,
    },
  }
}

/** A filename that survives Windows, macOS and a browser's download folder. */
export function recipeFileName(name: string): string {
  const safe = name
    .trim()
    .replace(/[^a-zA-Z0-9-_ ]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 60)
  return `${safe || "bom-recipe"}.bomrecipe.json`
}
