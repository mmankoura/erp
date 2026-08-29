import { describe, it, expect } from "vitest"
import {
  extractRows,
  findWarnings,
  parseQuantity,
  suggestResourceType,
  unrecognisedResourceTypes,
  resolveResourceType,
  notesWithOriginal,
  designatorsOf,
} from "./extract"
import { replay } from "./apply"
import type { GridAction, WizardGrid, WizardSource } from "./types"
import ats9353 from "./__fixtures__/aegis-ats9353.json"

const source: WizardSource = {
  fileName: "t.xlsx",
  sheetName: "S",
  matrix: [
    ["Item", "Qty", "Ref", "IPN", "Type"],
    ["1", "2", "C1,C2", "800313", "SMT"],
    ["2", "1", "R1", "800400", "BRACKET"],
  ],
}

const mapped = (extra: GridAction[] = []): WizardGrid =>
  replay(source, [
    { type: "map_row_to_headers", row: 0, deleteRow: true },
    {
      type: "set_column_mapping",
      mapping: {
        F1: "line_number",
        F2: "quantity_required",
        F3: "reference_designators",
        F4: "internal_part_number",
        F5: "resource_type",
      },
    },
    ...extra,
  ])

describe("parseQuantity", () => {
  it("reads plain and thousands-separated numbers", () => {
    expect(parseQuantity("39")).toBe(39)
    expect(parseQuantity("1,234")).toBe(1234)
    expect(parseQuantity(" 2.5 ")).toBe(2.5)
  })

  it("refuses what is not a usable quantity rather than producing NaN", () => {
    expect(parseQuantity("")).toBeNull()
    expect(parseQuantity(undefined)).toBeNull()
    expect(parseQuantity("as needed")).toBeNull()
    expect(parseQuantity("-4")).toBeNull()
    expect(parseQuantity("2 ea")).toBeNull()
  })

  it("accepts zero, which is a real BOM quantity", () => {
    expect(parseQuantity("0")).toBe(0)
  })
})

describe("designatorsOf", () => {
  it("splits and trims, dropping the empties a trailing comma leaves", () => {
    expect(designatorsOf("C1, C2 ,C3,")).toEqual(["C1", "C2", "C3"])
    expect(designatorsOf(undefined)).toEqual([])
  })
})

describe("extractRows", () => {
  it("pulls only the mapped columns, trimmed, omitting blanks", () => {
    const rows = extractRows(mapped())
    expect(rows).toHaveLength(2)
    expect(rows[0].values).toEqual({
      line_number: "1",
      quantity_required: "2",
      reference_designators: "C1,C2",
      internal_part_number: "800313",
      resource_type: "SMT",
    })
  })

  it("keeps srcIndex pointing at the file", () => {
    expect(extractRows(mapped()).map((r) => r.srcIndex)).toEqual([1, 2])
  })

  it("returns nothing mapped when the mapping is empty", () => {
    const grid = replay(source, [{ type: "map_row_to_headers", row: 0, deleteRow: true }])
    expect(extractRows(grid).every((r) => Object.keys(r.values).length === 0)).toBe(true)
  })
})

describe("lineKey", () => {
  it("prefers the file's own line number", () => {
    expect(extractRows(mapped()).map((r) => r.lineKey)).toEqual(["L:1", "L:2"])
  })

  it("falls back to IPN plus occurrence, so repeated parts stay distinct", () => {
    const repeated: WizardSource = {
      fileName: "t.xlsx",
      sheetName: "S",
      matrix: [
        ["Qty", "IPN"],
        ["1", "DNP"],
        ["1", "DNP"],
        ["1", "800400"],
      ],
    }
    const grid = replay(repeated, [
      { type: "map_row_to_headers", row: 0, deleteRow: true },
      {
        type: "set_column_mapping",
        mapping: { F1: "quantity_required", F2: "internal_part_number" },
      },
    ])
    expect(extractRows(grid).map((r) => r.lineKey)).toEqual([
      "P:DNP#1",
      "P:DNP#2",
      "P:800400#1",
    ])
  })
})

describe("suggestResourceType", () => {
  it("passes through a value the enum already holds, whatever its case", () => {
    expect(suggestResourceType("smt")).toBe("SMT")
    expect(suggestResourceType(" PCB ")).toBe("PCB")
  })

  it("reads the AEGIS vocabulary the way the commit dialog previews it", () => {
    expect(suggestResourceType("PROG IC")).toBe("SMT")
    expect(suggestResourceType("BLANK IC")).toBe("SMT")
    expect(suggestResourceType("BRACKET")).toBe("MECH")
    expect(suggestResourceType("CLAM")).toBe("MECH")
    expect(suggestResourceType("HTSNK")).toBe("MECH")
    expect(suggestResourceType("ADHESIVE")).toBe("MECH")
    expect(suggestResourceType("ASSY")).toBe("MECH")
  })

  it("matches whole tokens, so MECHANICAL is not read as containing IC", () => {
    expect(suggestResourceType("MECHANICAL")).toBe("MECH")
  })

  it("recognises the ways a file says do-not-populate", () => {
    expect(suggestResourceType("Do Not Populate")).toBe("DNP")
    expect(suggestResourceType("NO LOAD")).toBe("DNP")
  })

  it("falls back to MECH — something a person fits by hand", () => {
    expect(suggestResourceType("WHATSIT")).toBe("MECH")
  })
})

describe("unrecognisedResourceTypes", () => {
  it("groups by the file's own wording and counts, commonest first", () => {
    const rows = extractRows(mapped())
    expect(unrecognisedResourceTypes(rows)).toEqual([
      { raw: "BRACKET", count: 1, suggestion: "MECH" },
    ])
  })

  it("says nothing about values the enum already holds", () => {
    const rows = extractRows(mapped()).filter((r) => r.values.resource_type === "SMT")
    expect(unrecognisedResourceTypes(rows)).toEqual([])
  })
})

describe("resolveResourceType", () => {
  it("passes an enum value straight through with nothing to preserve", () => {
    expect(resolveResourceType("SMT", {})).toEqual({ resource_type: "SMT" })
  })

  it("applies the mapping and hands back the original wording", () => {
    expect(resolveResourceType("BRACKET", { BRACKET: "MECH" })).toEqual({
      resource_type: "MECH",
      original: "BRACKET",
    })
  })

  it("leaves the field unset but still reports the original when unmapped", () => {
    expect(resolveResourceType("WHATSIT", {})).toEqual({
      resource_type: undefined,
      original: "WHATSIT",
    })
  })

  it("treats a blank as nothing at all", () => {
    expect(resolveResourceType("  ", {})).toEqual({ resource_type: undefined })
  })
})

describe("notesWithOriginal", () => {
  it("keeps both the row's notes and the file's wording", () => {
    expect(notesWithOriginal("Handle with care", "HTSNK")).toBe(
      "Handle with care — Resource type from file: HTSNK"
    )
  })

  it("does nothing when there was nothing to preserve", () => {
    expect(notesWithOriginal("Just notes", undefined)).toBe("Just notes")
    expect(notesWithOriginal(undefined, undefined)).toBeUndefined()
  })
})

describe("findWarnings", () => {
  const warn = (matrix: string[][], mapping: Record<string, string>) => {
    const grid = replay({ fileName: "t", sheetName: "s", matrix }, [
      { type: "map_row_to_headers", row: 0, deleteRow: true },
      { type: "set_column_mapping", mapping: mapping as never },
    ])
    return findWarnings(extractRows(grid))
  }

  it("reports a missing part number", () => {
    const w = warn([["IPN", "Qty"], ["", "1"]], { F1: "internal_part_number", F2: "quantity_required" })
    expect(w.map((x) => x.kind)).toContain("missing_ipn")
  })

  it("reports a quantity it cannot use, quoting what the file said", () => {
    const w = warn([["IPN", "Qty"], ["A", "as needed"]], {
      F1: "internal_part_number",
      F2: "quantity_required",
    })
    const found = w.find((x) => x.kind === "invalid_quantity")
    expect(found?.message).toContain('"as needed"')
  })

  it("catches a quantity that disagrees with the designator count", () => {
    const w = warn([["IPN", "Qty", "Ref"], ["A", "3", "C1,C2"]], {
      F1: "internal_part_number",
      F2: "quantity_required",
      F3: "reference_designators",
    })
    const found = w.find((x) => x.kind === "quantity_mismatch")
    expect(found?.message).toContain("quantity is 3 but 2 reference designators")
  })

  it("counts designators across a wrapped line rather than per row", () => {
    // What an un-merged BOM looks like after Fill Down: every continuation row
    // carries the whole line's quantity but only its own fragment of the
    // designators. Asking per row would fire on each one.
    const w = warn(
      [
        ["Line", "IPN", "Qty", "Ref"],
        ["3", "A", "6", "C1,C2"],
        ["3", "A", "6", "C3,C4"],
        ["3", "A", "6", "C5,C6"],
      ],
      {
        F1: "line_number",
        F2: "internal_part_number",
        F3: "quantity_required",
        F4: "reference_designators",
      }
    )
    expect(w.filter((x) => x.kind === "quantity_mismatch")).toHaveLength(0)
  })

  it("still reports a wrapped line whose total genuinely disagrees", () => {
    const w = warn(
      [
        ["Line", "IPN", "Qty", "Ref"],
        ["3", "A", "9", "C1,C2"],
        ["3", "A", "9", "C3,C4"],
      ],
      {
        F1: "line_number",
        F2: "internal_part_number",
        F3: "quantity_required",
        F4: "reference_designators",
      }
    )
    const found = w.find((x) => x.kind === "quantity_mismatch")
    expect(found?.message).toContain('Line "L:3" (rows 2–3)')
    expect(found?.message).toContain("quantity is 9 but 4 reference designators")
  })

  it("stays quiet when quantity and designators agree", () => {
    const w = warn([["IPN", "Qty", "Ref"], ["A", "2", "C1,C2"]], {
      F1: "internal_part_number",
      F2: "quantity_required",
      F3: "reference_designators",
    })
    expect(w.map((x) => x.kind)).not.toContain("quantity_mismatch")
  })

  it("finds a designator used on two lines and names both rows", () => {
    const w = warn(
      [["IPN", "Qty", "Ref"], ["A", "1", "C1"], ["B", "1", "C1"]],
      { F1: "internal_part_number", F2: "quantity_required", F3: "reference_designators" }
    )
    const found = w.find((x) => x.kind === "duplicate_designator")
    expect(found?.message).toContain("C1 appears on 2 lines")
    expect(found?.message).toContain("rows 2, 3")
  })

  it("flags a duplicate line identity, which a replace would refuse", () => {
    const w = warn(
      [["Line", "IPN", "Qty"], ["7", "A", "1"], ["7", "B", "1"]],
      { F1: "line_number", F2: "internal_part_number", F3: "quantity_required" }
    )
    const found = w.find((x) => x.kind === "duplicate_key")
    expect(found?.message).toContain('"L:7"')
  })

  it("flags a resource type the enum cannot hold", () => {
    const w = warn([["IPN", "Qty", "Type"], ["A", "1", "HTSNK"]], {
      F1: "internal_part_number",
      F2: "quantity_required",
      F3: "resource_type",
    })
    const found = w.find((x) => x.kind === "unmapped_resource_type")
    expect(found?.message).toContain("HTSNK")
  })
})

describe("the real AEGIS file", () => {
  const grid = replay(ats9353 as WizardSource, [
    { type: "map_row_to_headers", row: 0, deleteRow: true },
    {
      type: "merge_references",
      keyColumns: ["F1"],
      mergeColumn: "F3",
      separator: ",",
      joinWith: ", ",
      dedupe: false,
    },
    {
      type: "set_column_mapping",
      mapping: {
        F1: "line_number",
        F2: "quantity_required",
        F3: "reference_designators",
        F5: "internal_part_number",
        F7: "resource_type",
      },
    },
  ])

  it("extracts one line per recovered part, each with its own identity", () => {
    const rows = extractRows(grid)
    expect(rows).toHaveLength(199)
    expect(new Set(rows.map((r) => r.lineKey)).size).toBe(199)
  })

  it("surfaces exactly the resource types the enum cannot hold", () => {
    const groups = unrecognisedResourceTypes(extractRows(grid))
    const raws = groups.map((g) => g.raw)
    for (const value of ["PROG IC", "BLANK IC", "BRACKET", "CLAM", "HTSNK", "ADHESIVE", "ASSY"]) {
      expect(raws).toContain(value)
    }
    expect(raws).not.toContain("PCB")
  })

  it("keeps the stated quantity rather than the designator count where they differ", () => {
    const rows = extractRows(grid)
    const item4 = rows.find((r) => r.values.line_number === "4")!
    expect(item4.values.quantity_required).toBe("39")
  })
})

/**
 * Real BOMs abbreviate long runs. Counting the token instead of what it stands
 * for made every such line read as a quantity disagreement — one file listed 21
 * tokens standing for 83 designators against a stated quantity of 83.
 */
describe("designatorsOf on abbreviated runs", () => {
  it("expands a run into the designators it stands for", () => {
    expect(designatorsOf("C50-C54")).toEqual(["C50", "C51", "C52", "C53", "C54"])
  })

  it("expands a run whose end does not repeat the prefix", () => {
    expect(designatorsOf("C50-54")).toEqual(["C50", "C51", "C52", "C53", "C54"])
  })

  it("counts a real cell the way the BOM means it", () => {
    const cell =
      "C7,C13,C14,C26,C32,  C34,C35,C36,C38,C39,C41,  C42,C46,C50-C54,C56-C60,  " +
      "C62-C84,C88-C95,   C97-C100,C102-C108,   C110-C123,C125-C128"
    expect(designatorsOf(cell)).toHaveLength(83)
  })

  it("mixes singles and runs in order", () => {
    expect(designatorsOf("R1, C3-C5, R9")).toEqual(["R1", "C3", "C4", "C5", "R9"])
  })

  it("leaves two different designators joined by a dash alone", () => {
    expect(designatorsOf("C50-R54")).toEqual(["C50-R54"])
  })

  it("leaves a backwards run alone rather than guessing", () => {
    expect(designatorsOf("C54-C50")).toEqual(["C54-C50"])
  })

  it("leaves an absurd span alone — that dash is part of a part number", () => {
    expect(designatorsOf("C1-C99999")).toEqual(["C1-C99999"])
  })

  it("keeps zero padding so an expanded designator still matches a literal one", () => {
    expect(designatorsOf("C007-C010")).toEqual(["C007", "C008", "C009", "C010"])
  })

  it("is unchanged for a cell with no runs in it", () => {
    expect(designatorsOf("C1, C2, C3")).toEqual(["C1", "C2", "C3"])
  })
})
