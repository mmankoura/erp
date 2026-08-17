import { describe, it, expect } from "vitest"
import { aggregateColumn, formatAggregate } from "./aggregate"
import type { VirtualGridColumn } from "./types"

interface Row {
  qty: number | null
  label: string
}

const col = (over: Partial<VirtualGridColumn<Row>>): VirtualGridColumn<Row> => ({
  id: "qty",
  header: "Qty",
  accessorFn: (r) => r.qty,
  cell: (r) => String(r.qty),
  ...over,
})

const rows: Row[] = [
  { qty: 10, label: "a" },
  { qty: 5, label: "b" },
  { qty: 15, label: "c" },
]

describe("aggregateColumn", () => {
  it("returns null when the column opted out", () => {
    expect(aggregateColumn(rows, col({}))).toBeNull()
  })

  it("sums", () => {
    expect(aggregateColumn(rows, col({ aggregate: "sum" }))).toBe(30)
  })

  it("averages", () => {
    expect(aggregateColumn(rows, col({ aggregate: "avg" }))).toBe(10)
  })

  it("takes min and max", () => {
    expect(aggregateColumn(rows, col({ aggregate: "min" }))).toBe(5)
    expect(aggregateColumn(rows, col({ aggregate: "max" }))).toBe(15)
  })

  it("counts rows, including ones with no number in this column", () => {
    const mixed = [...rows, { qty: null, label: "d" }]
    // Count answers "how many rows am I looking at", so the blank still counts.
    expect(aggregateColumn(mixed, col({ aggregate: "count" }))).toBe(4)
  })

  it("skips blanks rather than treating them as zero", () => {
    const mixed: Row[] = [{ qty: 10, label: "a" }, { qty: null, label: "b" }, { qty: 20, label: "c" }]
    expect(aggregateColumn(mixed, col({ aggregate: "sum" }))).toBe(30)
    // Would be 10 if the blank were counted as a zero.
    expect(aggregateColumn(mixed, col({ aggregate: "avg" }))).toBe(15)
  })

  it("parses a numeric string, commas and all", () => {
    const stringy = col({
      aggregate: "sum",
      accessorFn: (r) => (r.qty === null ? "" : `${r.qty.toLocaleString()}`),
    })
    expect(aggregateColumn([{ qty: 9875, label: "a" }, { qty: 125, label: "b" }], stringy)).toBe(10000)
  })

  it("ignores values that are not numbers at all", () => {
    const text = col({ aggregate: "sum", accessorFn: (r) => r.label })
    expect(aggregateColumn(rows, text)).toBeNull()
  })

  it("returns null, not zero, when nothing numeric is under it", () => {
    // Distinguishing "nothing to total" from "totals to zero" matters on a
    // quantity column.
    expect(aggregateColumn([{ qty: null, label: "a" }], col({ aggregate: "sum" }))).toBeNull()
  })

  it("returns null on an empty grid, but counts zero rows as zero", () => {
    expect(aggregateColumn([], col({ aggregate: "sum" }))).toBeNull()
    expect(aggregateColumn([], col({ aggregate: "count" }))).toBe(0)
  })

  it("sums a genuine zero to zero", () => {
    expect(aggregateColumn([{ qty: 0, label: "a" }], col({ aggregate: "sum" }))).toBe(0)
  })

  it("handles negatives", () => {
    const withNegative: Row[] = [{ qty: -5, label: "a" }, { qty: 10, label: "b" }]
    expect(aggregateColumn(withNegative, col({ aggregate: "sum" }))).toBe(5)
    expect(aggregateColumn(withNegative, col({ aggregate: "min" }))).toBe(-5)
  })
})

describe("formatAggregate", () => {
  it("groups thousands like the cells above it", () => {
    expect(formatAggregate(9875, "sum")).toBe("9,875")
  })

  it("gives an average two decimals even over whole numbers", () => {
    expect(formatAggregate(10, "avg")).toBe("10.00")
  })

  it("keeps a count whole", () => {
    expect(formatAggregate(4, "count")).toBe("4")
  })

  it("respects the column's decimal limit on a sum", () => {
    expect(formatAggregate(1.23456, "sum", 2)).toBe("1.23")
  })
})
