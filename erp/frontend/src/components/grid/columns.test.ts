import { describe, it, expect } from "vitest"
import { textCol, monoCol, numCol, dateCol, actionsCol, partCols } from "./columns"
import { copyValueOf } from "./types"

interface Row {
  ipn: string | null
  description: string | null
  qty: number | null
  received: string | null
}

const full: Row = {
  ipn: "AT-1001",
  description: "Resistor 10k",
  qty: 9875,
  received: "2026-08-11T14:30:00.000Z",
}
const empty: Row = { ipn: null, description: null, qty: null, received: null }

describe("blank conventions", () => {
  it("filters blanks as an em dash and sorts them as empty", () => {
    const col = textCol<Row>("ipn", "IPN", (r) => r.ipn)
    expect(col.filterAccessor!(empty)).toBe("—")
    expect(col.accessorFn(empty)).toBe("")
  })

  it("applies the same convention to mono columns", () => {
    const col = monoCol<Row>("ipn", "IPN", (r) => r.ipn)
    expect(col.filterAccessor!(empty)).toBe("—")
    expect(col.filterAccessor!(full)).toBe("AT-1001")
  })
})

describe("numCol", () => {
  const col = numCol<Row>("qty", "Qty", (r) => r.qty)

  it("copies the raw number, not the formatted one", () => {
    expect(copyValueOf(col, full)).toBe("9875")
    expect(col.filterAccessor!(full)).toBe("9,875")
  })

  it("copies a blank as an empty cell", () => {
    expect(copyValueOf(col, empty)).toBe("")
  })

  it("sorts numerically, with blanks first", () => {
    expect(col.accessorFn(full)).toBe(9875)
    expect(col.accessorFn(empty)).toBe(Number.NEGATIVE_INFINITY)
  })

  it("right-aligns", () => {
    expect(col.align).toBe("right")
  })
})

describe("dateCol", () => {
  const col = dateCol<Row>("received", "Received", (r) => r.received)

  it("sorts on the timestamp", () => {
    expect(col.accessorFn(full)).toBe(new Date(full.received!).getTime())
    expect(col.accessorFn(empty)).toBe(0)
  })

  it("copies the displayed date rather than the ISO string", () => {
    const copied = copyValueOf(col, full)
    expect(copied).toBe(new Date(full.received!).toLocaleDateString())
    expect(copied).not.toContain("T")
    expect(copied).not.toContain("Z")
  })

  it("includes the time when asked", () => {
    const withTime = dateCol<Row>("received", "Received", (r) => r.received, { time: true })
    expect(copyValueOf(withTime, full)).toContain(new Date(full.received!).toLocaleDateString())
    expect(copyValueOf(withTime, full).split(" ").length).toBeGreaterThan(1)
  })

  it("copies a blank as an empty cell", () => {
    expect(copyValueOf(col, empty)).toBe("")
  })

  it("leaves an unparseable value alone rather than printing Invalid Date", () => {
    const odd = dateCol<Row>("received", "Received", () => "not a date")
    expect(copyValueOf(odd, full)).toBe("not a date")
    expect(odd.accessorFn(full)).toBe(0)
  })
})

describe("actionsCol", () => {
  const col = actionsCol<Row>(() => null)

  it("is inert: no sorting, no filtering, and copies as empty", () => {
    expect(col.sortable).toBe(false)
    expect(col.filterable).toBe(false)
    expect(copyValueOf(col, full)).toBe("")
  })
})

describe("partCols", () => {
  const [ipn, description] = partCols<Row>({
    ipn: (r) => r.ipn,
    description: (r) => r.description,
  })

  it("returns two independently sortable columns", () => {
    expect(ipn.id).toBe("ipn")
    expect(description.id).toBe("description")
    expect(ipn.accessorFn(full)).toBe("AT-1001")
    expect(description.accessorFn(full)).toBe("Resistor 10k")
  })

  it("keeps the blank convention on both", () => {
    expect(ipn.filterAccessor!(empty)).toBe("—")
    expect(description.filterAccessor!(empty)).toBe("—")
  })
})

describe("override bag", () => {
  it("lets a column start from a factory and patch one field", () => {
    const col = numCol<Row>("qty", "Qty", (r) => r.qty, { size: 200, align: "left" })
    expect(col.size).toBe(200)
    expect(col.align).toBe("left")
    expect(copyValueOf(col, full)).toBe("9875")
  })
})
