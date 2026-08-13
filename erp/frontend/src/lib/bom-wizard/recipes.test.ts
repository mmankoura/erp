import { describe, it, expect } from "vitest"
import {
  actionProblem,
  parseActions,
  parseRecipeFile,
  toRecipeFile,
  recipeFileName,
  SCHEMA_VERSION,
} from "./recipes"
import { replay } from "./apply"
import type { GridAction, RecordedAction, WizardSource } from "./types"

const makeId = (i: number) => `gen-${i}`

const HEADERS: GridAction = { type: "map_row_to_headers", row: 0, deleteRow: true }
const MERGE: GridAction = {
  type: "merge_references",
  keyColumns: ["F1"],
  mergeColumn: "F3",
  separator: ",",
  joinWith: ", ",
  dedupe: false,
}

const recorded = (action: GridAction, id: string): RecordedAction => ({
  id,
  action,
  recorded_at: "2026-08-12T00:00:00.000Z",
})

describe("actionProblem", () => {
  it("accepts every action the engine implements", () => {
    const all: GridAction[] = [
      HEADERS,
      { type: "set_column_mapping", mapping: { F1: "internal_part_number" } },
      { type: "fill_down", columns: ["F1"], anchorColumn: "F2" },
      { type: "fill_down", columns: ["F1"] },
      MERGE,
      { type: "delete_rows", rows: [0, 3] },
      { type: "delete_columns", columns: ["F4"] },
    ]
    for (const action of all) expect(actionProblem(action)).toBeNull()
  })

  it("rejects an unknown type", () => {
    expect(actionProblem({ type: "transmute" })).toMatch(/unknown action type/)
  })

  it("rejects a non-object", () => {
    expect(actionProblem("fill_down")).toBe("not an object")
    expect(actionProblem(null)).toBe("not an object")
  })

  it("rejects an unknown semantic field, which would map a column to nothing", () => {
    expect(actionProblem({ type: "set_column_mapping", mapping: { F1: "colour" } })).toMatch(
      /unknown field "colour"/
    )
  })

  it("rejects a merge with no separator — apply would split on undefined", () => {
    expect(actionProblem({ ...MERGE, separator: "" })).toMatch(/needs a separator/)
    const { separator, ...without } = MERGE as Record<string, unknown>
    expect(actionProblem(without)).toMatch(/needs a separator/)
  })

  it("rejects a merge missing its booleans and columns", () => {
    expect(actionProblem({ ...MERGE, dedupe: "no" })).toMatch(/needs dedupe/)
    expect(actionProblem({ ...MERGE, keyColumns: "F1" })).toMatch(/needs keyColumns/)
  })

  it("rejects a header row that is not a whole, non-negative number", () => {
    expect(actionProblem({ type: "map_row_to_headers", row: -1, deleteRow: true })).toMatch(/row/)
    expect(actionProblem({ type: "map_row_to_headers", row: 1.5, deleteRow: true })).toMatch(/row/)
    expect(actionProblem({ type: "map_row_to_headers", row: 0 })).toMatch(/deleteRow/)
  })

  it("rejects row and column lists of the wrong shape", () => {
    expect(actionProblem({ type: "delete_rows", rows: ["3"] })).toMatch(/row numbers/)
    expect(actionProblem({ type: "delete_columns", columns: [4] })).toMatch(/list of columns/)
  })
})

describe("parseActions", () => {
  it("reads a list of recorded actions unchanged", () => {
    const input = [recorded(HEADERS, "a1"), recorded(MERGE, "a2")]
    const result = parseActions(input, makeId)
    expect("actions" in result && result.actions).toEqual(input)
  })

  it("accepts bare actions and supplies the bookkeeping", () => {
    const result = parseActions([HEADERS, MERGE], makeId)
    if ("error" in result) throw new Error(result.error)

    expect(result.actions.map((a) => a.action)).toEqual([HEADERS, MERGE])
    expect(result.actions.map((a) => a.id)).toEqual(["gen-0", "gen-1"])
    expect(result.actions[0].recorded_at).toBeTypeOf("string")
  })

  it("keeps comments and drops blank ones", () => {
    const result = parseActions(
      [
        { ...recorded(HEADERS, "a1"), comment: "  headers  " },
        { ...recorded(MERGE, "a2"), comment: "   " },
      ],
      makeId
    )
    if ("error" in result) throw new Error(result.error)
    expect(result.actions[0].comment).toBe("headers")
    expect(result.actions[1]).not.toHaveProperty("comment")
  })

  it("renumbers duplicate ids rather than refusing, so deleting a step stays unambiguous", () => {
    const result = parseActions([recorded(HEADERS, "same"), recorded(MERGE, "same")], makeId)
    if ("error" in result) throw new Error(result.error)
    expect(new Set(result.actions.map((a) => a.id)).size).toBe(2)
  })

  it("names the step that is wrong", () => {
    const result = parseActions([recorded(HEADERS, "a1"), { type: "nope" }], makeId)
    expect("error" in result && result.error).toMatch(/^Step 2:/)
  })

  it("refuses something that is not a list at all", () => {
    expect("error" in parseActions({ type: "fill_down" }, makeId)).toBe(true)
  })
})

describe("toRecipeFile", () => {
  it("stamps the schema version and trims", () => {
    const file = toRecipeFile("  AEGIS  ", "  the usual  ", [recorded(HEADERS, "a1")])
    expect(file).toEqual({
      schema_version: SCHEMA_VERSION,
      name: "AEGIS",
      description: "the usual",
      actions: [recorded(HEADERS, "a1")],
    })
  })

  it("omits an empty description rather than writing an empty string", () => {
    expect(toRecipeFile("AEGIS", "   ", [])).not.toHaveProperty("description")
    expect(toRecipeFile("AEGIS", undefined, [])).not.toHaveProperty("description")
  })
})

describe("parseRecipeFile", () => {
  const file = JSON.stringify(toRecipeFile("AEGIS", "the usual", [recorded(HEADERS, "a1")]))

  it("round-trips what toRecipeFile wrote", () => {
    const result = parseRecipeFile(file, makeId)
    if ("error" in result) throw new Error(result.error)
    expect(result.recipe.name).toBe("AEGIS")
    expect(result.recipe.description).toBe("the usual")
    expect(result.recipe.actions).toEqual([recorded(HEADERS, "a1")])
  })

  it("produces actions that replay to the same grid", () => {
    const source: WizardSource = {
      fileName: "t",
      sheetName: "s",
      matrix: [["Item", "Qty"], ["1", "2"]],
    }
    const result = parseRecipeFile(file, makeId)
    if ("error" in result) throw new Error(result.error)

    expect(replay(source, result.recipe.actions.map((a) => a.action))).toEqual(
      replay(source, [HEADERS])
    )
  })

  it("explains bad JSON rather than throwing", () => {
    expect("error" in parseRecipeFile("{ not json", makeId)).toBe(true)
    expect(() => parseRecipeFile("{ not json", makeId)).not.toThrow()
  })

  it("refuses a file with no schema_version", () => {
    const result = parseRecipeFile(JSON.stringify({ name: "x", actions: [] }), makeId)
    expect("error" in result && result.error).toMatch(/no schema_version/)
  })

  it("refuses a recipe from a newer wizard, naming both versions", () => {
    const result = parseRecipeFile(
      JSON.stringify({ schema_version: 99, name: "x", actions: [] }),
      makeId
    )
    expect("error" in result && result.error).toMatch(/schema 99.*understands 1/)
  })

  it("accepts an older schema, which is what the version field is for", () => {
    const result = parseRecipeFile(
      JSON.stringify({ schema_version: 1, name: "x", actions: [HEADERS] }),
      makeId
    )
    expect("error" in result).toBe(false)
  })

  it("names an unimported file rather than leaving it untitled", () => {
    const result = parseRecipeFile(JSON.stringify({ schema_version: 1, actions: [] }), makeId)
    if ("error" in result) throw new Error(result.error)
    expect(result.recipe.name).toBe("Imported recipe")
  })

  it("passes a malformed action's reason through", () => {
    const result = parseRecipeFile(
      JSON.stringify({ schema_version: 1, name: "x", actions: [{ type: "fill_down" }] }),
      makeId
    )
    expect("error" in result && result.error).toMatch(/Step 1:.*list of columns/)
  })
})

describe("recipeFileName", () => {
  it("makes a name safe for a filesystem", () => {
    // The stripped "/" leaves a run of spaces, which collapses to one dash
    // rather than leaving a gap where the character used to be.
    expect(recipeFileName("AEGIS ATS9353 / V1.4B")).toBe("AEGIS-ATS9353-V14B.bomrecipe.json")
  })

  it("falls back when nothing usable is left", () => {
    expect(recipeFileName("///")).toBe("bom-recipe.bomrecipe.json")
    expect(recipeFileName("  ")).toBe("bom-recipe.bomrecipe.json")
  })
})
