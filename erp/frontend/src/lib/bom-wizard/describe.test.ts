import { describe, it, expect } from "vitest"
import { describeAction } from "./describe"
import { gridFromSource, replay } from "./apply"
import type { GridAction, WizardSource } from "./types"

const source: WizardSource = {
  fileName: "test.xlsx",
  sheetName: "Sheet1",
  matrix: [
    ["Item", "Quantity", "Reference", "Notes"],
    ["1", "2", "C1,C2", ""],
    ["", "", "C3", ""],
  ],
}

const raw = gridFromSource(source)
const named = replay(source, [{ type: "map_row_to_headers", row: 0, deleteRow: true }])

describe("map_row_to_headers", () => {
  it("names the row 1-based and says what happened to it", () => {
    expect(describeAction({ type: "map_row_to_headers", row: 0, deleteRow: true }, raw)).toEqual({
      title: "Use row as headers",
      detail: "Row 1, removed from the data",
    })
  })

  it("distinguishes keeping the row", () => {
    const d = describeAction({ type: "map_row_to_headers", row: 4, deleteRow: false }, raw)
    expect(d.detail).toBe("Row 5, kept in the data")
  })
})

describe("column labels", () => {
  it("uses the labels the grid had when the action was recorded", () => {
    const action: GridAction = { type: "fill_down", columns: ["F1", "F2"], anchorColumn: "F1" }

    // Recorded before headers were mapped, the columns are still F1..Fn.
    expect(describeAction(action, raw).detail).toBe("F1, F2, anchored on F1")
    // Recorded after, the same ids read as the file's own words.
    expect(describeAction(action, named).detail).toBe("Item, Quantity, anchored on Item")
  })

  it("falls back to the id for a column that is not in the grid", () => {
    const action: GridAction = { type: "delete_columns", columns: ["F9"] }
    expect(describeAction(action, named).detail).toBe("F9")
  })
})

describe("fill_down", () => {
  it("spells out that no anchor means every blank is filled", () => {
    const d = describeAction({ type: "fill_down", columns: ["F2"] }, named)
    expect(d.detail).toBe("Quantity, no anchor — every blank is filled")
  })
})

describe("merge_references", () => {
  const action: GridAction = {
    type: "merge_references",
    keyColumns: ["F1"],
    mergeColumn: "F3",
    separator: ",",
    joinWith: ", ",
    dedupe: false,
  }

  it("names the key, the joined column and both delimiters", () => {
    const d = describeAction(action, named)
    expect(d.title).toBe("Merge continuation rows")
    expect(d.detail).toContain("grouped by Item")
    expect(d.detail).toContain("joining Reference")
    expect(d.detail).toContain("duplicates kept")
  })

  it("quotes the delimiters, so a space is visible rather than invisible", () => {
    expect(describeAction(action, named).detail).toContain(`rejoined with ", "`)
  })

  it("reports dedupe when it is on", () => {
    expect(describeAction({ ...action, dedupe: true }, named).detail).toContain(
      "duplicates dropped"
    )
  })
})

describe("set_column_mapping", () => {
  it("reads as column ⇢ field, in the file's own words", () => {
    const d = describeAction(
      {
        type: "set_column_mapping",
        mapping: { F1: "line_number", F2: "quantity_required" },
      },
      named
    )
    expect(d.detail).toBe("Item ⇢ Line, Quantity ⇢ Qty")
  })

  it("says so when the mapping is empty rather than rendering nothing", () => {
    expect(describeAction({ type: "set_column_mapping", mapping: {} }, named).detail).toBe(
      "Nothing mapped"
    )
  })
})

describe("deletions", () => {
  it("counts rows in the title and lists them 1-based", () => {
    const d = describeAction({ type: "delete_rows", rows: [0, 4, 9] }, named)
    expect(d.title).toBe("Delete 3 rows")
    expect(d.detail).toBe("1, 5, 10")
  })

  it("uses the singular for one", () => {
    expect(describeAction({ type: "delete_rows", rows: [2] }, named).title).toBe("Delete 1 row")
    expect(describeAction({ type: "delete_columns", columns: ["F1"] }, named).title).toBe(
      "Delete 1 column"
    )
  })

  it("truncates a long list instead of running off the panel", () => {
    const rows = Array.from({ length: 12 }, (_, i) => i)
    const d = describeAction({ type: "delete_rows", rows }, named)
    expect(d.title).toBe("Delete 12 rows")
    expect(d.detail).toBe("1, 2, 3, 4, 5, 6, 7, 8 and 4 more")
  })
})
