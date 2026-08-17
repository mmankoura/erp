import { describe, it, expect } from "vitest"
import { buildMatrix, coerceCell, toCsv, exportFilename } from "./export"
import type { VirtualGridColumn } from "./types"

interface Lot {
  uid: string
  qty: number
  bin: string | null
}

const uid: VirtualGridColumn<Lot> = {
  id: "uid",
  header: "UID",
  accessorFn: (l) => l.uid,
  cell: (l) => l.uid,
}
const qty: VirtualGridColumn<Lot> = {
  id: "qty",
  header: "Quantity",
  accessorFn: (l) => l.qty,
  // What the user sees is grouped; what the clipboard and the export get is raw.
  cell: (l) => l.qty.toLocaleString(),
}
const bin: VirtualGridColumn<Lot> = {
  id: "bin",
  header: "BIN",
  accessorFn: (l) => l.bin,
  cell: (l) => l.bin ?? "—",
}
const actions: VirtualGridColumn<Lot> = {
  id: "actions",
  header: "",
  accessorFn: () => "",
  copyValue: () => "",
  cell: () => null,
}

const columns = new Map([uid, qty, bin, actions].map((c) => [c.id, c]))
const rows = [
  { original: { uid: "R-001", qty: 9875, bin: "A1" } },
  { original: { uid: "R-002", qty: 12, bin: null } },
]

describe("buildMatrix", () => {
  it("puts the headers first, then one row per record", () => {
    const matrix = buildMatrix({ rows, colIds: ["uid", "qty"], columns })
    expect(matrix).toEqual([
      ["UID", "Quantity"],
      ["R-001", "9875"],
      ["R-002", "12"],
    ])
  })

  it("exports the raw value, not the formatted cell", () => {
    const [, first] = buildMatrix({ rows, colIds: ["qty"], columns })
    // Not "9,875" — the spreadsheet has to receive a number.
    expect(first).toEqual(["9875"])
  })

  it("honours the column order it is given, which is the on-screen order", () => {
    const matrix = buildMatrix({ rows, colIds: ["qty", "uid"], columns })
    expect(matrix[0]).toEqual(["Quantity", "UID"])
    expect(matrix[1]).toEqual(["9875", "R-001"])
  })

  it("omits columns that aren't visible", () => {
    const matrix = buildMatrix({ rows, colIds: ["uid"], columns })
    expect(matrix[0]).toEqual(["UID"])
    expect(matrix[1]).toHaveLength(1)
  })

  it("ignores a column id with no definition rather than emitting a hole", () => {
    const matrix = buildMatrix({ rows, colIds: ["uid", "nope"], columns })
    expect(matrix[0]).toEqual(["UID"])
  })

  it("writes an empty cell for a null, not the em-dash the cell renders", () => {
    const matrix = buildMatrix({ rows, colIds: ["bin"], columns })
    expect(matrix[2]).toEqual([""])
  })

  it("respects a column's copyValue override, so actions export blank", () => {
    const matrix = buildMatrix({ rows, colIds: ["actions"], columns })
    expect(matrix[1]).toEqual([""])
  })

  it("can skip the header for callers that supply their own", () => {
    const matrix = buildMatrix({ rows, colIds: ["uid"], columns, includeHeader: false })
    expect(matrix[0]).toEqual(["R-001"])
  })

  it("returns just the header when everything is filtered out", () => {
    const matrix = buildMatrix({ rows: [], colIds: ["uid"], columns })
    expect(matrix).toEqual([["UID"]])
  })
})

describe("coerceCell", () => {
  it("turns a plain number into a number so the sheet can sum it", () => {
    expect(coerceCell("9875")).toBe(9875)
    expect(coerceCell("12.5")).toBe(12.5)
    expect(coerceCell("-3")).toBe(-3)
  })

  it("keeps a leading zero as text — 0800288 is a part number, not 800288", () => {
    expect(coerceCell("0800288")).toBe("0800288")
  })

  it("leaves anything non-numeric alone", () => {
    expect(coerceCell("C70402-0.1UF-25")).toBe("C70402-0.1UF-25")
    expect(coerceCell("1-2")).toBe("1-2")
    expect(coerceCell("R-001")).toBe("R-001")
  })

  it("passes an empty cell through as empty", () => {
    expect(coerceCell("")).toBe("")
    expect(coerceCell("   ")).toBe("")
  })
})

describe("toCsv", () => {
  it("joins with commas and CRLF", () => {
    expect(toCsv([["a", "b"], ["c", "d"]])).toBe("a,b\r\nc,d")
  })

  it("quotes only the fields that need it", () => {
    expect(toCsv([["plain", "has,comma"]])).toBe('plain,"has,comma"')
  })

  it("doubles an embedded quote", () => {
    expect(toCsv([['say "hi"']])).toBe('"say ""hi"""')
  })

  it("quotes a field containing a newline", () => {
    expect(toCsv([["two\nlines"]])).toBe('"two\nlines"')
  })
})

describe("exportFilename", () => {
  const when = new Date(2026, 7, 17)

  it("uses the grid title and a sortable date", () => {
    expect(exportFilename("Stock Levels", "xlsx", when)).toBe("Stock Levels 2026-08-17.xlsx")
  })

  it("strips characters Windows refuses in a filename", () => {
    // "Lots / Reels" is a real grid title.
    expect(exportFilename("Lots / Reels", "csv", when)).toBe("Lots - Reels 2026-08-17.csv")
  })

  it("falls back when the grid has no title", () => {
    expect(exportFilename(undefined, "xlsx", when)).toBe("export 2026-08-17.xlsx")
  })

  it("falls back when sanitising leaves nothing behind", () => {
    expect(exportFilename("///", "xlsx", when)).toBe("export 2026-08-17.xlsx")
  })
})
