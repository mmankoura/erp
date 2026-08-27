import { describe, it, expect } from "vitest"
import { detectStructure, fieldForHeader, wouldChangeAnything } from "./detect"
import { gridFromSource, replay, applyAction } from "./apply"
import type { GridAction, WizardSource } from "./types"
import { REQUIRED_FIELDS } from "./fields"
import ats9353 from "./__fixtures__/aegis-ats9353.json"
import sapin from "./__fixtures__/aegis-sapin.json"

const ats = ats9353 as WizardSource
const sap = sapin as WizardSource

describe("fieldForHeader", () => {
  it("reads AEGIS's customer-prefixed part number as the internal one", () => {
    expect(fieldForHeader("Alazar P/N")).toBe("internal_part_number")
  })

  it("leaves a bare 'Part' alone, because next to Alazar P/N it is ambiguous", () => {
    expect(fieldForHeader("Part")).toBeUndefined()
  })

  it("still reads a manufacturer's part number as the manufacturer's", () => {
    expect(fieldForHeader("MPN")).toBe("manufacturer_pn")
    expect(fieldForHeader("Mfr P/N")).toBe("manufacturer_pn")
    expect(fieldForHeader("Manufacturer Part Number")).toBe("manufacturer_pn")
  })

  it("does not mistake the item column for a field", () => {
    expect(fieldForHeader("Item")).toBeUndefined()
  })

  it("normalises punctuation and case", () => {
    expect(fieldForHeader("  QTY  ")).toBe("quantity_required")
    expect(fieldForHeader("MANUFACTURER,PART,#")).toBe("manufacturer_pn")
  })

  it("has nothing to say about a blank header", () => {
    expect(fieldForHeader("")).toBeUndefined()
    expect(fieldForHeader("   ")).toBeUndefined()
  })
})

describe("detectStructure on the AEGIS files", () => {
  it("finds the header row", () => {
    expect(detectStructure(ats).roles.headerRow).toBe(0)
    expect(detectStructure(sap).roles.headerRow).toBe(0)
  })

  /**
   * The anti-hardcoding test. Resource type is F7 in one file and F6 in the
   * other, so anything positional passes one and fails the other.
   */
  it("finds the same roles in both files despite different column positions", () => {
    const a = detectStructure(ats).roles
    expect({ key: a.key, reference: a.reference, quantity: a.quantity, ipn: a.partNumber }).toEqual(
      { key: "F1", reference: "F3", quantity: "F2", ipn: "F5" }
    )
    expect(a.mapping.F7).toBe("resource_type")

    const s = detectStructure(sap).roles
    expect({ key: s.key, reference: s.reference, quantity: s.quantity, ipn: s.partNumber }).toEqual(
      { key: "F1", reference: "F3", quantity: "F2", ipn: "F5" }
    )
    expect(s.mapping.F6).toBe("resource_type")
  })

  it("maps the internal part number to Alazar P/N and leaves Part unmapped", () => {
    const { mapping } = detectStructure(ats).roles
    expect(mapping.F5).toBe("internal_part_number")
    expect(mapping.F4).toBeUndefined()
  })

  it("maps everything the commit needs", () => {
    for (const source of [ats, sap]) {
      const mapped = Object.values(detectStructure(source).roles.mapping)
      for (const field of REQUIRED_FIELDS) expect(mapped).toContain(field)
    }
  })

  it("ignores a trailing unnamed column", () => {
    expect(detectStructure(sap).roles.mapping.F9).toBeUndefined()
  })

  it("counts the lines and the rows that belong to them", () => {
    expect(detectStructure(ats)).toMatchObject({ leadRows: 199, continuationRows: 175 })
    expect(detectStructure(sap)).toMatchObject({ leadRows: 207, continuationRows: 184 })
  })

  it("is confident about both", () => {
    expect(detectStructure(ats).confident).toBe(true)
    expect(detectStructure(sap).confident).toBe(true)
  })

  it("proposes headers, a merge and a mapping — and no fill down", () => {
    const types = detectStructure(ats).actions.map((a) => a.type)
    expect(types).toEqual(["map_row_to_headers", "merge_references", "set_column_mapping"])
  })

  it("proposes a recipe that recovers the parts", () => {
    expect(replay(ats, detectStructure(ats).actions).rows).toHaveLength(199)
    expect(replay(sap, detectStructure(sap).actions).rows).toHaveLength(207)
  })
})

describe("detectStructure when it cannot tell", () => {
  const nothing: WizardSource = {
    fileName: "f.csv",
    sheetName: "s",
    matrix: [
      ["1", "2", "3"],
      ["4", "5", "6"],
      ["7", "8", "9"],
    ],
  }

  it("says so rather than guessing", () => {
    const detection = detectStructure(nothing)
    expect(detection.roles.headerRow).toBeNull()
    expect(detection.confident).toBe(false)
    expect(detection.actions).toEqual([])
  })
})

describe("wouldChangeAnything", () => {
  const flat: WizardSource = {
    fileName: "f.csv",
    sheetName: "s",
    matrix: [
      ["Item", "Quantity", "Reference"],
      ["1", "2", "C1, C2"],
      ["2", "3", "C3, C4, C5"],
    ],
  }

  it("is false for a merge on a file with nothing to merge", () => {
    const grid = applyAction(gridFromSource(flat), {
      type: "map_row_to_headers",
      row: 0,
      deleteRow: true,
    })
    const merge: GridAction = {
      type: "merge_references",
      keyColumns: ["F1"],
      mergeColumn: "F3",
      separator: ",",
      joinWith: ", ",
      dedupe: false,
    }
    expect(wouldChangeAnything(grid, merge)).toBe(false)
  })

  it("is true for the merge on a wrapped file", () => {
    const detection = detectStructure(ats)
    const grid = applyAction(gridFromSource(ats), detection.actions[0])
    expect(wouldChangeAnything(grid, detection.actions[1])).toBe(true)
  })

  /**
   * Pins the exception, so nobody builds a "not needed" badge on it:
   * `set_column_mapping` rebuilds the grid object every time.
   */
  it("cannot report a column mapping as unchanged, because that action always allocates", () => {
    const grid = gridFromSource(flat)
    expect(wouldChangeAnything(grid, { type: "set_column_mapping", mapping: {} })).toBe(true)
  })

  /**
   * The distinction the whole fill-down decision rests on. Fill down before a
   * merge is *not* a no-op — it rewrites every continuation row. It is
   * redundant, because merge then takes every cell from the lead row and
   * discards the lot. Changed, yet pointless: which is why it is not a step.
   */
  it("reports fill down as changing rows even though merge discards the change", () => {
    const detection = detectStructure(ats)
    const named = applyAction(gridFromSource(ats), detection.actions[0])
    const fill: GridAction = {
      type: "fill_down",
      columns: ["F1", "F2", "F4", "F5", "F6", "F7", "F8"],
      anchorColumn: "F1",
    }

    expect(wouldChangeAnything(named, fill)).toBe(true)

    const withFill = replay(ats, [detection.actions[0], fill, detection.actions[1]])
    const without = replay(ats, [detection.actions[0], detection.actions[1]])
    expect(withFill.rows).toEqual(without.rows)
  })
})
