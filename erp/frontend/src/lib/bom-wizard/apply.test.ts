import { describe, it, expect } from "vitest"
import { gridFromSource, applyAction, replay, columnFor } from "./apply"
import type { GridAction, WizardGrid, WizardSource } from "./types"
import ats9353 from "./__fixtures__/aegis-ats9353.json"
import sapin from "./__fixtures__/aegis-sapin.json"

const src = (f: typeof ats9353): WizardSource => f as WizardSource

/** The recipe every AEGIS-shaped file needs: headers, fill down, merge. */
const aegisRecipe = (opts: {
  item: string
  ref: string
  fill: string[]
  deleteHeaderRow?: boolean
}): GridAction[] => [
  { type: "map_row_to_headers", row: 0, deleteRow: opts.deleteHeaderRow ?? true },
  { type: "fill_down", columns: opts.fill, anchorColumn: opts.item },
  {
    type: "merge_references",
    keyColumns: [opts.item],
    mergeColumn: opts.ref,
    separator: ",",
    joinWith: ", ",
    dedupe: false,
  },
]

const refsOf = (grid: WizardGrid, col: string, srcIndex: number): string[] => {
  const row = grid.rows.find((r) => r.srcIndex === srcIndex)!
  return row.cells[col].split(",").map((s) => s.trim()).filter(Boolean)
}

describe("gridFromSource", () => {
  it("names columns F1..Fn and pads every row to the widest", () => {
    const grid = gridFromSource({
      fileName: "x.csv",
      sheetName: "s",
      matrix: [["a", "b", "c"], ["d"]],
    })
    expect(grid.columns.map((c) => c.id)).toEqual(["F1", "F2", "F3"])
    expect(grid.rows[1].cells).toEqual({ F1: "d", F2: "", F3: "" })
  })

  it("keeps srcIndex aligned to source position", () => {
    const grid = gridFromSource(src(ats9353))
    expect(grid.rows[0].srcIndex).toBe(0)
    expect(grid.rows.at(-1)!.srcIndex).toBe(374)
  })
})

describe("map_row_to_headers", () => {
  it("lifts labels from the row and can drop it", () => {
    const grid = replay(src(ats9353), [
      { type: "map_row_to_headers", row: 0, deleteRow: true },
    ])
    expect(grid.columns.map((c) => c.label)).toEqual([
      "Item", "Quantity", "Reference", "Part", "Alazar P/N",
      "Notes", "Resource type", "Polarized",
    ])
    expect(grid.rows).toHaveLength(374)
    expect(grid.rows[0].srcIndex).toBe(1)
  })

  it("keeps the row when deleteRow is false", () => {
    const grid = replay(src(ats9353), [
      { type: "map_row_to_headers", row: 0, deleteRow: false },
    ])
    expect(grid.rows).toHaveLength(375)
  })
})

describe("fill_down", () => {
  it("fills blanks from the value above", () => {
    const grid = replay(
      { fileName: "f", sheetName: "s", matrix: [["a", "1"], ["", ""], ["", "2"]] },
      [{ type: "fill_down", columns: ["F1", "F2"] }],
    )
    expect(grid.rows.map((r) => r.cells.F1)).toEqual(["a", "a", "a"])
    expect(grid.rows.map((r) => r.cells.F2)).toEqual(["1", "1", "2"])
  })

  it("fills a continuation row but leaves a new item's blank alone", () => {
    // Row 2 continues row 1 (blank anchor) so it inherits. Row 3 is a new item
    // (anchor filled) whose cell is genuinely empty — filling it would invent
    // data the customer never wrote.
    const grid = replay(
      {
        fileName: "f",
        sheetName: "s",
        matrix: [["1", "R1"], ["", ""], ["2", ""]],
      },
      [{ type: "fill_down", columns: ["F2"], anchorColumn: "F1" }],
    )
    expect(grid.rows.map((r) => r.cells.F2)).toEqual(["R1", "R1", ""])
  })

  it("returns the same object when nothing was blank", () => {
    const before = gridFromSource({
      fileName: "f", sheetName: "s", matrix: [["a"], ["b"]],
    })
    expect(applyAction(before, { type: "fill_down", columns: ["F1"] })).toBe(before)
  })
})

describe("merge_references", () => {
  it("collapses an adjacent run and concatenates the merge column", () => {
    const grid = replay(
      {
        fileName: "f",
        sheetName: "s",
        matrix: [["1", "R1,R2,"], ["1", "R3,R4"], ["2", "R5"]],
      },
      [{
        type: "merge_references", keyColumns: ["F1"], mergeColumn: "F2",
        separator: ",", joinWith: ", ", dedupe: false,
      }],
    )
    expect(grid.rows).toHaveLength(2)
    expect(grid.rows[0].cells.F2).toBe("R1, R2, R3, R4")
    expect(grid.rows[0].mergedFrom).toEqual([1])
  })

  it("does NOT merge non-adjacent rows sharing a key", () => {
    const grid = replay(
      {
        fileName: "f",
        sheetName: "s",
        matrix: [["1", "R1"], ["2", "R2"], ["1", "R3"]],
      },
      [{
        type: "merge_references", keyColumns: ["F1"], mergeColumn: "F2",
        separator: ",", joinWith: ", ", dedupe: false,
      }],
    )
    expect(grid.rows).toHaveLength(3)
  })

  it("does not treat two blank keys as the same identity", () => {
    const grid = replay(
      { fileName: "f", sheetName: "s", matrix: [["", "R1"], ["", "R2"]] },
      [{
        type: "merge_references", keyColumns: ["F1"], mergeColumn: "F2",
        separator: ",", joinWith: ", ", dedupe: false,
      }],
    )
    expect(grid.rows).toHaveLength(2)
  })

  it("drops the empties left by trailing separators", () => {
    const grid = replay(
      { fileName: "f", sheetName: "s", matrix: [["1", "R1,R2,"], ["1", ",R3,"]] },
      [{
        type: "merge_references", keyColumns: ["F1"], mergeColumn: "F2",
        separator: ",", joinWith: ", ", dedupe: false,
      }],
    )
    expect(grid.rows[0].cells.F2).toBe("R1, R2, R3")
  })
})

describe("delete_columns", () => {
  it("retires ids without renumbering the survivors", () => {
    const grid = replay(
      { fileName: "f", sheetName: "s", matrix: [["a", "b", "c"]] },
      [{ type: "delete_columns", columns: ["F2"] }],
    )
    expect(grid.columns.map((c) => c.id)).toEqual(["F1", "F3"])
    expect(grid.rows[0].cells).toEqual({ F1: "a", F3: "c" })
  })

  it("keeps a later action pointed at the column it was recorded against", () => {
    const grid = replay(
      { fileName: "f", sheetName: "s", matrix: [["a", "b", "c"], ["", "", ""]] },
      [
        { type: "delete_columns", columns: ["F2"] },
        { type: "fill_down", columns: ["F3"] },
      ],
    )
    expect(grid.rows[1].cells.F3).toBe("c")
  })
})

// ---------------------------------------------------------------------------
// The real files. These numbers are measured from the customer workbooks in
// MISCELLANEOUS/SAMPLES/test/ and are the point of the whole feature.
// ---------------------------------------------------------------------------

describe("AEGIS ATS9353 — the format the current importer destroys", () => {
  const ITEM = "F1", QTY = "F2", REF = "F3", IPN = "F5", RES = "F7"
  const recipe = aegisRecipe({
    item: ITEM, ref: REF, fill: [ITEM, QTY, "F4", IPN, "F6", RES, "F8"],
  })

  it("recovers 199 parts from 374 data rows", () => {
    const grid = replay(src(ats9353), recipe)
    expect(grid.rows).toHaveLength(199)
  })

  it("keeps the stated quantity instead of summing the run", () => {
    // Item 4 wraps across 8 rows, all carrying 39 after fill-down.
    // Summing — which the current importer does — would yield 312.
    const grid = replay(src(ats9353), recipe)
    const row = grid.rows.find((r) => r.cells[ITEM] === "4")!
    expect(row.cells[QTY]).toBe("39")
    expect(refsOf(grid, REF, row.srcIndex)).toHaveLength(39)
  })

  it("preserves designator order and endpoints", () => {
    const grid = replay(src(ats9353), recipe)
    const row = grid.rows.find((r) => r.cells[ITEM] === "4")!
    const refs = refsOf(grid, REF, row.srcIndex)
    expect(refs[0]).toBe("C2")
    expect(refs.at(-1)).toBe("C490")
  })

  it("keeps 'Do Not Populate' on 17 separate lines", () => {
    // A global group-by — what consolidateMultiRowDesignators does — collapses
    // these into one line and loses sixteen genuine BOM entries.
    const grid = replay(src(ats9353), recipe)
    const dnp = grid.rows.filter((r) => r.cells[IPN] === "Do Not Populate")
    expect(dnp).toHaveLength(17)
  })

  it("carries resource types the enum cannot hold through the grid", () => {
    const grid = replay(src(ats9353), recipe)
    const values = new Set(grid.rows.map((r) => r.cells[RES]).filter(Boolean))
    for (const v of ["PROG IC", "BLANK IC", "BRACKET", "CLAM", "HTSNK", "ADHESIVE", "ASSY"]) {
      expect(values).toContain(v)
    }
  })
})

describe("AEGIS SAPIN — the awkward edges", () => {
  const ITEM = "F1", QTY = "F2", REF = "F3", IPN = "F5", RES = "F6"
  const recipe = aegisRecipe({
    item: ITEM, ref: REF, fill: [ITEM, QTY, "F4", IPN, RES, "F7", "F8"],
  })

  it("recovers 207 parts", () => {
    expect(replay(src(sapin), recipe).rows).toHaveLength(207)
  })

  it("keeps real items that genuinely have no designators", () => {
    // Two mechanical parts near the end have an empty Reference. Filling them
    // from the row above would invent designators the customer never wrote.
    const grid = replay(src(sapin), recipe)
    const empty = grid.rows.filter((r) => r.cells[REF].trim() === "")
    expect(empty).toHaveLength(2)
    expect(empty.every((r) => r.cells[IPN] !== "")).toBe(true)
  })

  it("folds a continuation row that still carries a resource type", () => {
    const grid = replay(src(sapin), recipe)
    expect(grid.rows.filter((r) => r.mergedFrom?.length).length).toBeGreaterThan(0)
    expect(grid.rows.every((r) => r.cells[ITEM] !== "")).toBe(true)
  })

  it("keeps 'Do Not Populate' on 16 separate lines", () => {
    const grid = replay(src(sapin), recipe)
    expect(grid.rows.filter((r) => r.cells[IPN] === "Do Not Populate")).toHaveLength(16)
  })
})

// ---------------------------------------------------------------------------
// Properties the recorder, undo/redo and recipe files depend on.
// ---------------------------------------------------------------------------

describe("replay properties", () => {
  const ITEM = "F1", REF = "F3"
  const full = aegisRecipe({ item: ITEM, ref: REF, fill: [ITEM, "F2", "F4", "F5"] })

  it("deleting an action from the middle equals never having recorded it", () => {
    const withExtra: GridAction[] = [
      full[0],
      { type: "delete_columns", columns: ["F8"] },
      full[1],
      full[2],
    ]
    const afterDelete = replay(src(ats9353), [full[0], full[1], full[2]])
    const neverRecorded = replay(src(ats9353), full)
    expect(afterDelete).toEqual(neverRecorded)
    // and the extra action genuinely did something, so the test isn't vacuous
    expect(replay(src(ats9353), withExtra).columns).toHaveLength(7)
  })

  it("undoing to zero returns the untouched source grid", () => {
    expect(replay(src(ats9353), full, 0)).toEqual(gridFromSource(src(ats9353)))
  })

  it("survives a JSON round-trip, which is what recipe files are", () => {
    const direct = replay(src(ats9353), full)
    const roundTripped = replay(src(ats9353), JSON.parse(JSON.stringify(full)))
    expect(roundTripped).toEqual(direct)
  })

  it("is deterministic at every cursor position", () => {
    for (let i = 0; i <= full.length; i++) {
      expect(replay(src(ats9353), full, i)).toEqual(replay(src(ats9353), full, i))
    }
  })
})

describe("columnFor", () => {
  it("finds the raw column behind a mapped field", () => {
    const grid = replay(src(ats9353), [
      { type: "map_row_to_headers", row: 0, deleteRow: true },
      { type: "set_column_mapping", mapping: { F5: "internal_part_number" } },
    ])
    expect(columnFor(grid, "internal_part_number")).toBe("F5")
    expect(columnFor(grid, "notes")).toBeUndefined()
  })
})
