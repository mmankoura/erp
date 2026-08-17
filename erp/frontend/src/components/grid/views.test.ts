import { describe, it, expect } from "vitest"
import {
  parseViews,
  serializeViews,
  upsertView,
  removeView,
  findView,
  sameName,
  type GridView,
} from "./views"

const view = (name: string): GridView => ({
  name,
  filters: [{ id: "status", value: ["DRAFT"] }],
  sorting: [{ id: "po_number", desc: false }],
  visibility: { notes: false },
  sizing: { po_number: 120 },
  search: "acme",
  filterRow: true,
})

describe("sameName", () => {
  it("ignores case and surrounding space", () => {
    expect(sameName("Open POs", "open pos")).toBe(true)
    expect(sameName("  Open POs  ", "Open POs")).toBe(true)
  })

  it("still tells different names apart", () => {
    expect(sameName("Open POs", "Closed POs")).toBe(false)
  })
})

describe("parseViews / serializeViews", () => {
  it("round-trips a view with all of its state", () => {
    const views = [view("Open POs")]
    const parsed = parseViews(serializeViews(views))
    expect(parsed).toEqual(views)
  })

  it("returns nothing for an absent entry", () => {
    expect(parseViews(null)).toEqual([])
  })

  it("returns nothing rather than throwing on corrupt JSON", () => {
    expect(parseViews("{not json")).toEqual([])
  })

  it("rejects a payload from a future version", () => {
    expect(parseViews(JSON.stringify({ version: 2, views: [view("x")] }))).toEqual([])
  })

  it("rejects a payload that is the wrong shape entirely", () => {
    expect(parseViews(JSON.stringify({ version: 1, views: "nope" }))).toEqual([])
    expect(parseViews(JSON.stringify([1, 2, 3]))).toEqual([])
  })

  it("drops entries with no usable name", () => {
    const raw = JSON.stringify({ version: 1, views: [view("Good"), { name: "  " }, null] })
    expect(parseViews(raw).map((v) => v.name)).toEqual(["Good"])
  })
})

describe("upsertView", () => {
  it("appends a new view", () => {
    const views = upsertView([view("A")], view("B"))
    expect(views.map((v) => v.name)).toEqual(["A", "B"])
  })

  it("replaces in place, keeping the original position", () => {
    const updated = { ...view("B"), search: "changed" }
    const views = upsertView([view("A"), view("B"), view("C")], updated)
    expect(views.map((v) => v.name)).toEqual(["A", "B", "C"])
    expect(views[1].search).toBe("changed")
  })

  it("replaces a name that differs only by case, rather than adding a twin", () => {
    const views = upsertView([view("Open POs")], view("open pos"))
    expect(views).toHaveLength(1)
    expect(views[0].name).toBe("open pos")
  })
})

describe("removeView", () => {
  it("removes by name, case-insensitively", () => {
    expect(removeView([view("A"), view("B")], "a").map((v) => v.name)).toEqual(["B"])
  })

  it("leaves the list alone when the name isn't there", () => {
    expect(removeView([view("A")], "Z")).toHaveLength(1)
  })
})

describe("findView", () => {
  it("finds regardless of case", () => {
    expect(findView([view("Open POs")], "OPEN POS")?.name).toBe("Open POs")
  })

  it("returns undefined when missing", () => {
    expect(findView([view("A")], "B")).toBeUndefined()
  })
})
