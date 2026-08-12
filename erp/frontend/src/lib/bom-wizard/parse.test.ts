import { describe, it, expect } from "vitest"
import * as XLSX from "xlsx"
import { trimTrailingBlankRows, matrixFromSheet, parseWorkbook } from "./parse"
import { gridFromSource } from "./apply"

const sheetOf = (rows: unknown[][]): XLSX.WorkSheet => XLSX.utils.aoa_to_sheet(rows)

const bookOf = (sheets: Record<string, unknown[][]>): ArrayBuffer => {
  const book = XLSX.utils.book_new()
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(book, sheetOf(rows), name)
  }
  const out = XLSX.write(book, { type: "array", bookType: "xlsx" })
  return out as ArrayBuffer
}

describe("trimTrailingBlankRows", () => {
  it("drops the empty rows that trail an exported sheet", () => {
    expect(trimTrailingBlankRows([["a"], [""], ["  "], [""]])).toEqual([["a"]])
  })

  it("keeps a blank row inside the data, so srcIndex stays aligned to the file", () => {
    const rows = [["a"], ["", ""], ["b"], [""]]
    expect(trimTrailingBlankRows(rows)).toEqual([["a"], ["", ""], ["b"]])
  })

  it("handles an entirely blank sheet", () => {
    expect(trimTrailingBlankRows([[""], ["", ""]])).toEqual([])
    expect(trimTrailingBlankRows([])).toEqual([])
  })
})

describe("matrixFromSheet", () => {
  it("reads cells as the text the user saw", () => {
    const matrix = matrixFromSheet(sheetOf([["Item", "Qty"], [1, 39]]))
    expect(matrix).toEqual([
      ["Item", "Qty"],
      ["1", "39"],
    ])
  })

  it("pads short rows with empty strings rather than dropping cells", () => {
    const matrix = matrixFromSheet(sheetOf([["a", "b", "c"], ["x"]]))
    expect(matrix[1]).toEqual(["x", "", ""])
  })

  it("preserves an interior blank row", () => {
    const matrix = matrixFromSheet(sheetOf([["a"], [null], ["b"]]))
    expect(matrix).toHaveLength(3)
    expect(matrix[1].every((c) => c === "")).toBe(true)
  })
})

describe("parseWorkbook", () => {
  it("returns every sheet in book order", () => {
    const parsed = parseWorkbook("bom.xlsx", bookOf({
      "First": [["a"]],
      "Second": [["b"]],
    }))

    expect(parsed.fileName).toBe("bom.xlsx")
    expect(parsed.sheets.map((s) => s.sheetName)).toEqual(["First", "Second"])
  })

  it("produces a WizardSource the engine can consume unchanged", () => {
    const parsed = parseWorkbook("bom.xlsx", bookOf({
      "BOM": [
        ["Item", "Quantity", "Reference"],
        ["1", "2", "C1,C2"],
      ],
    }))

    const grid = gridFromSource(parsed.sheets[0])
    expect(grid.columns.map((c) => c.id)).toEqual(["F1", "F2", "F3"])
    expect(grid.rows).toHaveLength(2)
    expect(grid.rows[1].cells.F3).toBe("C1,C2")
  })

  it("reads a CSV, which SheetJS sniffs from the same bytes", () => {
    const csv = "Item,Quantity\n1,39\n"
    const bytes = new TextEncoder().encode(csv)
    const parsed = parseWorkbook("bom.csv", bytes.buffer as ArrayBuffer)

    expect(parsed.sheets[0].matrix).toEqual([
      ["Item", "Quantity"],
      ["1", "39"],
    ])
  })
})
