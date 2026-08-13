import { describe, it, expect } from "vitest"
import {
  buildCreateItems,
  buildReplaceItems,
  partNumbersToResolve,
  materialLookup,
  type PartNumberResolution,
} from "./commit"
import type { ExtractedRow, ResourceType } from "./extract"

const row = (
  srcIndex: number,
  values: ExtractedRow["values"],
  lineKey = `L:${srcIndex}`
): ExtractedRow => ({ srcIndex, values, lineKey })

const options = (
  pairs: [string, string][] = [["800313", "mat-1"]],
  resourceMapping: Record<string, ResourceType> = {}
) => ({ materialByPartNumber: new Map(pairs), resourceMapping })

describe("buildCreateItems", () => {
  it("builds a line, turning the quantity into a number", () => {
    const { items } = buildCreateItems(
      [row(1, { internal_part_number: "800313", quantity_required: "1,234" })],
      options()
    )
    expect(items).toEqual([{ material_id: "mat-1", quantity_required: 1234 }])
  })

  it("omits optional fields rather than sending empty strings", () => {
    const { items } = buildCreateItems(
      [row(1, { internal_part_number: "800313", quantity_required: "2" })],
      options()
    )
    expect(Object.keys(items[0])).toEqual(["material_id", "quantity_required"])
  })

  it("carries the optional fields it does have", () => {
    const { items } = buildCreateItems(
      [
        row(1, {
          internal_part_number: "800313",
          quantity_required: "2",
          line_number: "7",
          reference_designators: "C1, C2",
          alternate_ipn: "ALT-1",
          notes: "Handle with care",
        }),
      ],
      options()
    )
    expect(items[0]).toMatchObject({
      line_number: 7,
      reference_designators: "C1, C2",
      alternate_ipn: "ALT-1",
      notes: "Handle with care",
    })
  })

  it("reads the ways a file writes a boolean", () => {
    const build = (polarized: string) =>
      buildCreateItems(
        [row(1, { internal_part_number: "800313", quantity_required: "1", polarized })],
        options()
      ).items[0].polarized

    expect(build("TRUE")).toBe(true)
    expect(build("Yes")).toBe(true)
    expect(build("1")).toBe(true)
    expect(build("FALSE")).toBe(false)
  })

  it("drops a line number that is not a whole number, since it is optional", () => {
    const { items } = buildCreateItems(
      [row(1, { internal_part_number: "800313", quantity_required: "1", line_number: "4a" })],
      options()
    )
    expect(items[0]).not.toHaveProperty("line_number")
  })
})

describe("resource types", () => {
  it("passes an enum value straight through and leaves notes alone", () => {
    const { items } = buildCreateItems(
      [row(1, { internal_part_number: "800313", quantity_required: "1", resource_type: "SMT" })],
      options()
    )
    expect(items[0].resource_type).toBe("SMT")
    expect(items[0]).not.toHaveProperty("notes")
  })

  it("maps an unrecognised value and keeps the file's wording in notes", () => {
    const { items } = buildCreateItems(
      [
        row(1, {
          internal_part_number: "800313",
          quantity_required: "1",
          resource_type: "HTSNK",
        }),
      ],
      options([["800313", "mat-1"]], { HTSNK: "MECH" })
    )
    expect(items[0].resource_type).toBe("MECH")
    expect(items[0].notes).toBe("Resource type from file: HTSNK")
  })

  it("appends to the row's own notes rather than replacing them", () => {
    const { items } = buildCreateItems(
      [
        row(1, {
          internal_part_number: "800313",
          quantity_required: "1",
          resource_type: "HTSNK",
          notes: "From drawing 12B",
        }),
      ],
      options([["800313", "mat-1"]], { HTSNK: "MECH" })
    )
    expect(items[0].notes).toBe("From drawing 12B — Resource type from file: HTSNK")
  })

  it("still records the wording when the value was left unmapped", () => {
    const { items } = buildCreateItems(
      [
        row(1, {
          internal_part_number: "800313",
          quantity_required: "1",
          resource_type: "WHATSIT",
        }),
      ],
      options()
    )
    expect(items[0]).not.toHaveProperty("resource_type")
    expect(items[0].notes).toBe("Resource type from file: WHATSIT")
  })
})

describe("skipping", () => {
  it("names the row and the reason instead of dropping it silently", () => {
    const { items, skipped } = buildCreateItems(
      [
        row(1, { internal_part_number: "800313", quantity_required: "1" }),
        row(2, { quantity_required: "1" }),
        row(3, { internal_part_number: "NOPE", quantity_required: "1" }),
        row(4, { internal_part_number: "800313", quantity_required: "as needed" }),
      ],
      options()
    )

    expect(items).toHaveLength(1)
    expect(skipped).toEqual([
      { srcIndex: 2, reason: "no internal part number" },
      { srcIndex: 3, reason: 'no material matches "NOPE"' },
      { srcIndex: 4, reason: '"as needed" is not a usable quantity' },
    ])
  })
})

describe("buildReplaceItems", () => {
  it("adds the line key the diff matches on", () => {
    const { items } = buildReplaceItems(
      [row(1, { internal_part_number: "800313", quantity_required: "1" }, "P:800313#1")],
      options()
    )
    expect(items[0]).toMatchObject({ material_id: "mat-1", bom_line_key: "P:800313#1" })
  })

  it("is otherwise the same line as the create payload", () => {
    const rows = [row(1, { internal_part_number: "800313", quantity_required: "1" })]
    const { bom_line_key, ...rest } = buildReplaceItems(rows, options()).items[0]
    expect(rest).toEqual(buildCreateItems(rows, options()).items[0])
    expect(bom_line_key).toBe("L:1")
  })
})

describe("partNumbersToResolve", () => {
  it("returns each distinct part number once, in the file's own spelling", () => {
    const rows = [
      row(1, { internal_part_number: "800313" }),
      row(2, { internal_part_number: "800313" }),
      row(3, { internal_part_number: "800400" }),
      row(4, {}),
    ]
    expect(partNumbersToResolve(rows)).toEqual(["800313", "800400"])
  })

  it("keeps case, since an exact hit and a case-only hit are different answers", () => {
    const rows = [row(1, { internal_part_number: "abc" }), row(2, { internal_part_number: "ABC" })]
    expect(partNumbersToResolve(rows)).toEqual(["abc", "ABC"])
  })
})

describe("materialLookup", () => {
  const resolution: PartNumberResolution = {
    matched: [{ part_number: "800313", material_id: "mat-1" } as never],
    case_mismatch: [{ part_number: "abc", material_id: "mat-2" } as never],
    missing: ["NOPE"],
  }

  it("includes exact hits always", () => {
    expect(materialLookup(resolution, false).get("800313")).toBe("mat-1")
  })

  it("includes case-mismatched hits only once accepted", () => {
    expect(materialLookup(resolution, false).has("abc")).toBe(false)
    expect(materialLookup(resolution, true).get("abc")).toBe("mat-2")
  })

  it("keys on what the file said, so the spelling is not rewritten behind the user", () => {
    const lookup = materialLookup(resolution, true)
    expect(lookup.has("abc")).toBe(true)
  })
})
