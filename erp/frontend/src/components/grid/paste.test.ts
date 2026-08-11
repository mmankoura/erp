import { describe, it, expect } from "vitest"
import { planPaste } from "./paste"
import type { VirtualGridColumn } from "./types"

interface Row {
  id: string
  bin: string | null
  qty: number
  status: string
}

const rows: { id: string; original: Row }[] = [
  { id: "a", original: { id: "a", bin: "A1", qty: 10, status: "ACTIVE" } },
  { id: "b", original: { id: "b", bin: "B1", qty: 20, status: "ACTIVE" } },
  { id: "c", original: { id: "c", bin: "C1", qty: 30, status: "CONSUMED" } },
]

const columns = new Map<string, VirtualGridColumn<Row>>([
  [
    "bin",
    {
      id: "bin",
      header: "BIN",
      accessorFn: (r) => r.bin ?? "",
      cell: (r) => r.bin,
      edit: {
        getValue: (r) => r.bin,
        editor: { kind: "text", maxLength: 50 },
        isEditable: (r) => (r.status === "ACTIVE" ? true : `Only ACTIVE (this is ${r.status})`),
      },
    },
  ],
  [
    "qty",
    {
      id: "qty",
      header: "Qty",
      accessorFn: (r) => r.qty,
      cell: (r) => r.qty,
      edit: {
        getValue: (r) => r.qty,
        editor: { kind: "number", min: 0 },
        isEditable: (r) => (r.status === "ACTIVE" ? true : `Only ACTIVE (this is ${r.status})`),
      },
    },
  ],
  // No edit config — read-only.
  ["status", { id: "status", header: "Status", accessorFn: (r) => r.status, cell: (r) => r.status }],
])

const colIds = ["bin", "qty", "status"]
const base = { rows, colIds, columns, isEditable: () => true }

describe("planPaste", () => {
  it("places a block at the top-left of the selection", () => {
    const plan = planPaste({
      ...base,
      matrix: [["X1", "11"], ["X2", "22"]],
      rect: { r0: 0, r1: 0, c0: 0, c1: 0 },
    })
    expect(plan.edits.map((e) => [e.rowId, e.columnId, e.value])).toEqual([
      ["a", "bin", "X1"],
      ["a", "qty", 11],
      ["b", "bin", "X2"],
      ["b", "qty", 22],
    ])
  })

  it("fills the whole selection from a single copied cell", () => {
    const plan = planPaste({
      ...base,
      matrix: [["Z9"]],
      rect: { r0: 0, r1: 1, c0: 0, c1: 0 },
    })
    expect(plan.edits.map((e) => e.rowId)).toEqual(["a", "b"])
    expect(plan.edits.every((e) => e.value === "Z9")).toBe(true)
  })

  it("clamps past the last row instead of creating rows", () => {
    const plan = planPaste({
      ...base,
      matrix: [["P"], ["Q"], ["R"], ["S"], ["T"]],
      rect: { r0: 2, r1: 2, c0: 0, c1: 0 },
    })
    // Row c is CONSUMED, so the one in-bounds cell is blocked, not written.
    expect(plan.edits).toHaveLength(0)
    expect(plan.blocked).toHaveLength(1)
    expect(plan.clipped).toBe(4)
  })

  it("skips columns that aren't editable at all", () => {
    const plan = planPaste({
      ...base,
      matrix: [["X", "1", "SOMETHING"]],
      rect: { r0: 0, r1: 0, c0: 0, c1: 0 },
    })
    expect(plan.skipped).toBe(1)
    expect(plan.edits.map((e) => e.columnId)).toEqual(["bin", "qty"])
  })

  it("reports rows the guard refuses, with the reason", () => {
    const plan = planPaste({
      ...base,
      matrix: [["X"]],
      rect: { r0: 2, r1: 2, c0: 0, c1: 0 },
    })
    expect(plan.edits).toHaveLength(0)
    expect(plan.blocked).toEqual(["Only ACTIVE (this is CONSUMED)"])
  })

  it("rejects values that don't parse", () => {
    const plan = planPaste({
      ...base,
      matrix: [["not-a-number"]],
      rect: { r0: 0, r1: 0, c0: 1, c1: 1 },
    })
    expect(plan.edits).toHaveLength(0)
    expect(plan.invalid).toHaveLength(1)
  })

  it("does not write a value the row already holds", () => {
    const plan = planPaste({
      ...base,
      matrix: [["A1"]],
      rect: { r0: 0, r1: 0, c0: 0, c1: 0 },
    })
    expect(plan.edits).toHaveLength(0)
    expect(plan.unchanged).toBe(1)
  })

  it("strips thousands separators from pasted numbers", () => {
    const plan = planPaste({
      ...base,
      matrix: [["9,875"]],
      rect: { r0: 0, r1: 0, c0: 1, c1: 1 },
    })
    expect(plan.edits[0].value).toBe(9875)
  })

  it("clearing is a paste of one empty cell over the selection", () => {
    const plan = planPaste({
      ...base,
      matrix: [[""]],
      rect: { r0: 0, r1: 1, c0: 0, c1: 1 },
    })
    // BIN clears to null; quantity can't be empty, so it is reported instead.
    expect(plan.edits.map((e) => [e.columnId, e.value])).toEqual([
      ["bin", null],
      ["bin", null],
    ])
    expect(plan.invalid).toHaveLength(2)
  })

  it("lists the columns it is about to write", () => {
    const plan = planPaste({
      ...base,
      matrix: [["X", "1"]],
      rect: { r0: 0, r1: 0, c0: 0, c1: 0 },
    })
    expect(plan.columns.sort()).toEqual(["bin", "qty"])
  })
})
