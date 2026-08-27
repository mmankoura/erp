import { describe, it, expect } from "vitest"
import {
  buildCreateItems,
  buildReplaceItems,
  buildMaterialDrafts,
  materialPayloads,
  partNumbersToResolve,
  materialLookup,
  planMasterData,
  materialUpdatePayloads,
  settledResourceTypes,
  fieldKey,
  type MasterDataPlan,
  type MaterialFill,
  type MasterField,
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
    // The server reports a case-only hit with the material's real spelling as
    // `suggested`, not as `internal_part_number` like a true match.
    case_mismatch: [
      { part_number: "abc", suggested: "ABC", material_id: "mat-2" } as never,
    ],
    missing: ["NOPE"],
  }

  it("keeps the suggested spelling available for the dialog to show", () => {
    expect(resolution.case_mismatch[0].suggested).toBe("ABC")
  })

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

describe("buildMaterialDrafts", () => {
  it("seeds a draft from the file's own columns", () => {
    const drafts = buildMaterialDrafts(
      [
        row(1, {
          internal_part_number: "800313",
          description: "RES 10K 1% 0402",
          manufacturer: "Yageo",
          manufacturer_pn: "RC0402FR-0710KL",
          resource_type: "SMT",
        }),
      ],
      ["800313"],
      {}
    )
    expect(drafts).toEqual([
      {
        internal_part_number: "800313",
        description: "RES 10K 1% 0402",
        manufacturer: "Yageo",
        manufacturer_pn: "RC0402FR-0710KL",
        resource_type: "SMT",
      },
    ])
  })

  it("drafts only what resolution reported missing", () => {
    const drafts = buildMaterialDrafts(
      [
        row(1, { internal_part_number: "800313" }),
        row(2, { internal_part_number: "900999" }),
      ],
      ["900999"],
      {}
    )
    expect(drafts.map((d) => d.internal_part_number)).toEqual(["900999"])
  })

  it("takes the first row carrying the part number, where a merged run keeps its values", () => {
    const drafts = buildMaterialDrafts(
      [
        row(1, { internal_part_number: "900999", description: "The lead row" }),
        row(2, { internal_part_number: "900999", description: "A continuation" }),
      ],
      ["900999"],
      {}
    )
    expect(drafts).toHaveLength(1)
    expect(drafts[0].description).toBe("The lead row")
  })

  it("maps a resource type the enum cannot hold through the same mapping the lines use", () => {
    const drafts = buildMaterialDrafts(
      [row(1, { internal_part_number: "900999", resource_type: "PROG IC" })],
      ["900999"],
      { "PROG IC": "SMT" }
    )
    expect(drafts[0].resource_type).toBe("SMT")
  })

  it("leaves the resource type blank when the file did not say", () => {
    const drafts = buildMaterialDrafts(
      [row(1, { internal_part_number: "900999" })],
      ["900999"],
      {}
    )
    expect(drafts[0].resource_type).toBe("")
  })

  it("returns them in the order resolution reported", () => {
    const drafts = buildMaterialDrafts(
      [
        row(1, { internal_part_number: "AAA" }),
        row(2, { internal_part_number: "BBB" }),
      ],
      ["BBB", "AAA"],
      {}
    )
    expect(drafts.map((d) => d.internal_part_number)).toEqual(["BBB", "AAA"])
  })

  it("skips a missing part number no row actually carries", () => {
    const drafts = buildMaterialDrafts([row(1, { internal_part_number: "AAA" })], ["ZZZ"], {})
    expect(drafts).toEqual([])
  })
})

describe("materialPayloads", () => {
  const draft = {
    internal_part_number: "900999",
    description: "",
    manufacturer: "",
    manufacturer_pn: "",
    resource_type: "" as const,
  }

  it("omits blank optional fields rather than sending empty strings", () => {
    const [payload] = materialPayloads([draft], "cust-1")
    expect(Object.keys(payload)).toEqual(["customer_id", "internal_part_number"])
  })

  it("carries the customer from the selected product onto every material", () => {
    const payloads = materialPayloads([draft, { ...draft, internal_part_number: "AAA" }], "cust-1")
    expect(payloads.every((p) => p.customer_id === "cust-1")).toBe(true)
  })

  it("sends the fields that have a value", () => {
    const [payload] = materialPayloads(
      [{ ...draft, description: "RES 10K", manufacturer: "Yageo", resource_type: "SMT" }],
      "cust-1"
    )
    expect(payload).toEqual({
      customer_id: "cust-1",
      internal_part_number: "900999",
      description: "RES 10K",
      manufacturer: "Yageo",
      resource_type: "SMT",
    })
  })

  it("trims what the reviewer typed", () => {
    const [payload] = materialPayloads(
      [{ ...draft, internal_part_number: "  900999  ", description: "  RES 10K  " }],
      "cust-1"
    )
    expect(payload.internal_part_number).toBe("900999")
    expect(payload.description).toBe("RES 10K")
  })
})

// =================== Settling the material master ===================

const matched = (
  partNumber: string,
  materialId: string,
  fields: Partial<{
    description: string | null
    manufacturer: string | null
    manufacturer_pn: string | null
    resource_type: string | null
  }> = {}
) => ({
  part_number: partNumber,
  material_id: materialId,
  internal_part_number: partNumber,
  description: null,
  manufacturer: null,
  manufacturer_pn: null,
  resource_type: null,
  customer_id: null,
  ...fields,
})

const resolved = (
  matches: ReturnType<typeof matched>[],
  caseMismatch: PartNumberResolution["case_mismatch"] = []
): PartNumberResolution => ({
  matched: matches as never,
  case_mismatch: caseMismatch,
  missing: [],
})

describe("planMasterData", () => {
  const fileRow = (values: ExtractedRow["values"]) => [row(1, values)]

  it("fills a blank material field from the file", () => {
    const plan = planMasterData(
      fileRow({ internal_part_number: "800313", resource_type: "SMT" }),
      resolved([matched("800313", "mat-1")]),
      {},
      false
    )
    expect(plan.fills).toEqual([
      {
        material_id: "mat-1",
        part_number: "800313",
        internal_part_number: "800313",
        field: "resource_type",
        value: "SMT",
      },
    ])
  })

  it("treats whitespace on the material as blank, the way the old importer left it", () => {
    const plan = planMasterData(
      fileRow({ internal_part_number: "800313", description: "RES 10K" }),
      resolved([matched("800313", "mat-1", { description: "   " })]),
      {},
      false
    )
    expect(plan.fills.map((f) => f.field)).toEqual(["description"])
  })

  it("never treats a blank file column as an instruction", () => {
    const plan = planMasterData(
      fileRow({ internal_part_number: "800313" }),
      resolved([matched("800313", "mat-1", { description: "Kept" })]),
      {},
      false
    )
    expect(plan.fills).toEqual([])
    expect(plan.conflicts).toEqual([])
  })

  it("counts agreement rather than listing it", () => {
    const plan = planMasterData(
      fileRow({ internal_part_number: "800313", resource_type: "SMT" }),
      resolved([matched("800313", "mat-1", { resource_type: "SMT" })]),
      {},
      false
    )
    expect(plan.agreed).toBe(1)
    expect(plan.fills).toEqual([])
    expect(plan.conflicts).toEqual([])
  })

  it("raises a disagreement with both sides on it", () => {
    const plan = planMasterData(
      fileRow({ internal_part_number: "800313", resource_type: "TH" }),
      resolved([matched("800313", "mat-1", { resource_type: "SMT" })]),
      {},
      false
    )
    expect(plan.conflicts).toEqual([
      {
        material_id: "mat-1",
        part_number: "800313",
        internal_part_number: "800313",
        field: "resource_type",
        material_value: "SMT",
        file_value: "TH",
      },
    ])
  })

  it("compares the resource type after mapping, not before", () => {
    const plan = planMasterData(
      fileRow({ internal_part_number: "800313", resource_type: "PROG IC" }),
      resolved([matched("800313", "mat-1", { resource_type: "SMT" })]),
      { "PROG IC": "SMT" },
      false
    )
    expect(plan.conflicts).toEqual([])
    expect(plan.agreed).toBe(1)
  })

  it("does not offer a resource type the enum cannot hold", () => {
    const plan = planMasterData(
      fileRow({ internal_part_number: "800313", resource_type: "PROG IC" }),
      resolved([matched("800313", "mat-1")]),
      {},
      false
    )
    expect(plan.fills).toEqual([])
  })

  it("asks about free text too, by default", () => {
    const plan = planMasterData(
      fileRow({ internal_part_number: "800313", description: "CAP .5UF" }),
      resolved([matched("800313", "mat-1", { description: "Capacitor 0.5uF" })]),
      {},
      false
    )
    expect(plan.conflicts.map((c) => c.field)).toEqual(["description"])
    expect(plan.kept).toEqual([])
  })

  it("keeps a difference silently when its field is not being asked about", () => {
    const plan = planMasterData(
      fileRow({ internal_part_number: "800313", description: "CAP .5UF" }),
      resolved([matched("800313", "mat-1", { description: "Capacitor 0.5uF" })]),
      {},
      false,
      ["resource_type"]
    )
    expect(plan.conflicts).toEqual([])
    expect(plan.kept.map((c) => c.field)).toEqual(["description"])
  })

  it("takes the first row carrying the part number", () => {
    const plan = planMasterData(
      [
        row(1, { internal_part_number: "800313", description: "The lead row" }),
        row(2, { internal_part_number: "800313", description: "A continuation" }),
      ],
      resolved([matched("800313", "mat-1")]),
      {},
      false
    )
    expect(plan.fills).toHaveLength(1)
    expect(plan.fills[0].value).toBe("The lead row")
  })

  it("ignores part numbers that did not resolve", () => {
    const plan = planMasterData(
      fileRow({ internal_part_number: "NOPE", resource_type: "SMT" }),
      resolved([matched("800313", "mat-1")]),
      {},
      false
    )
    expect(plan.fills).toEqual([])
  })

  it("leaves case-mismatched materials alone until they are accepted", () => {
    const caseMismatch = [
      {
        part_number: "abc",
        suggested: "ABC",
        material_id: "mat-2",
        description: null,
        manufacturer: null,
        manufacturer_pn: null,
        resource_type: null,
      },
    ]
    const rows = fileRow({ internal_part_number: "abc", resource_type: "SMT" })

    expect(planMasterData(rows, resolved([], caseMismatch), {}, false).fills).toEqual([])

    const accepted = planMasterData(rows, resolved([], caseMismatch), {}, true)
    expect(accepted.fills).toHaveLength(1)
    // Reported under the material's own spelling, not the file's.
    expect(accepted.fills[0].internal_part_number).toBe("ABC")
  })
})

describe("materialUpdatePayloads", () => {
  const plan = (over: Partial<MasterDataPlan> = {}): MasterDataPlan => ({
    fills: [],
    conflicts: [],
    kept: [],
    agreed: 0,
    ...over,
  })

  const fill = (field: MasterField, value: string): MaterialFill => ({
    material_id: "mat-1",
    part_number: "800313",
    internal_part_number: "800313",
    field,
    value,
  })

  it("collapses several fills on one material into a single patch", () => {
    const out = materialUpdatePayloads(
      plan({ fills: [fill("resource_type", "SMT"), fill("description", "RES 10K")] }),
      {}
    )
    expect(out).toEqual([{ id: "mat-1", resource_type: "SMT", description: "RES 10K" }])
  })

  it("leaves a conflict out when nothing was chosen — the material keeps its value", () => {
    const out = materialUpdatePayloads(
      plan({
        conflicts: [
          {
            material_id: "mat-1",
            part_number: "800313",
            internal_part_number: "800313",
            field: "resource_type",
            material_value: "SMT",
            file_value: "TH",
          },
        ],
      }),
      {}
    )
    expect(out).toEqual([])
  })

  it("writes the file's value when it was chosen", () => {
    const conflict = {
      material_id: "mat-1",
      part_number: "800313",
      internal_part_number: "800313",
      field: "resource_type" as MasterField,
      material_value: "SMT",
      file_value: "TH",
    }
    const out = materialUpdatePayloads(plan({ conflicts: [conflict] }), {
      [fieldKey("mat-1", "resource_type")]: "file",
    })
    expect(out).toEqual([{ id: "mat-1", resource_type: "TH" }])
  })

  it("uses the reviewed value rather than the file's", () => {
    const out = materialUpdatePayloads(plan({ fills: [fill("description", "CAP .5UF")] }), {}, {
      [fieldKey("mat-1", "description")]: "Capacitor 0.5uF 25V",
    })
    expect(out).toEqual([{ id: "mat-1", description: "Capacitor 0.5uF 25V" }])
  })

  it("drops a fill the reviewer cleared instead of sending a blank", () => {
    const out = materialUpdatePayloads(plan({ fills: [fill("description", "CAP .5UF")] }), {}, {
      [fieldKey("mat-1", "description")]: "   ",
    })
    expect(out).toEqual([])
  })

  it("says nothing when there is nothing to say", () => {
    expect(materialUpdatePayloads(plan(), {})).toEqual([])
  })
})

describe("settledResourceTypes", () => {
  const empty: MasterDataPlan = { fills: [], conflicts: [], kept: [], agreed: 0 }

  it("starts from what the material already holds", () => {
    const settled = settledResourceTypes(
      empty,
      {},
      {},
      resolved([matched("800313", "mat-1", { resource_type: "SMT" })]),
      false
    )
    expect(settled.get("mat-1")).toBe("SMT")
  })

  it("takes a fill's value when the material was blank", () => {
    const plan: MasterDataPlan = {
      ...empty,
      fills: [
        {
          material_id: "mat-1",
          part_number: "800313",
          internal_part_number: "800313",
          field: "resource_type",
          value: "TH",
        },
      ],
    }
    const settled = settledResourceTypes(plan, {}, {}, resolved([matched("800313", "mat-1")]), false)
    expect(settled.get("mat-1")).toBe("TH")
  })

  it("keeps the material's value when a disagreement was left alone", () => {
    const conflict = {
      material_id: "mat-1",
      part_number: "800313",
      internal_part_number: "800313",
      field: "resource_type" as MasterField,
      material_value: "SMT",
      file_value: "TH",
    }
    const settled = settledResourceTypes(
      { ...empty, conflicts: [conflict] },
      {},
      {},
      resolved([matched("800313", "mat-1", { resource_type: "SMT" })]),
      false
    )
    expect(settled.get("mat-1")).toBe("SMT")
  })

  it("takes the file's value when the disagreement was given to the file", () => {
    const conflict = {
      material_id: "mat-1",
      part_number: "800313",
      internal_part_number: "800313",
      field: "resource_type" as MasterField,
      material_value: "SMT",
      file_value: "TH",
    }
    const settled = settledResourceTypes(
      { ...empty, conflicts: [conflict] },
      { [fieldKey("mat-1", "resource_type")]: "file" },
      {},
      resolved([matched("800313", "mat-1", { resource_type: "SMT" })]),
      false
    )
    expect(settled.get("mat-1")).toBe("TH")
  })

  it("is absent when nothing anywhere has one, so the file stands", () => {
    const settled = settledResourceTypes(empty, {}, {}, resolved([matched("800313", "mat-1")]), false)
    expect(settled.has("mat-1")).toBe(false)
  })
})

describe("the settled type reaching the line", () => {
  const rows = [
    row(1, { internal_part_number: "800313", quantity_required: "2", resource_type: "TH" }),
  ]

  it("overrides what the file's column said", () => {
    const { items } = buildCreateItems(rows, {
      ...options(),
      settledResourceType: new Map([["mat-1", "SMT" as const]]),
    })
    expect(items[0].resource_type).toBe("SMT")
  })

  it("still records the file's own wording in the notes", () => {
    const { items } = buildCreateItems(
      [row(1, { internal_part_number: "800313", quantity_required: "2", resource_type: "PROG IC" })],
      {
        ...options([["800313", "mat-1"]], { "PROG IC": "MECH" }),
        settledResourceType: new Map([["mat-1", "SMT" as const]]),
      }
    )
    expect(items[0].resource_type).toBe("SMT")
    expect(items[0].notes).toBe("Resource type from file: PROG IC")
  })

  it("gives the line a type even when the file's column was blank", () => {
    const { items } = buildCreateItems(
      [row(1, { internal_part_number: "800313", quantity_required: "2" })],
      { ...options(), settledResourceType: new Map([["mat-1", "MECH" as const]]) }
    )
    expect(items[0].resource_type).toBe("MECH")
  })

  it("leaves the file's value standing when nothing settled it", () => {
    const { items } = buildCreateItems(rows, {
      ...options(),
      settledResourceType: new Map(),
    })
    expect(items[0].resource_type).toBe("TH")
  })

  /** The regression guard: today's callers pass no map and must be unaffected. */
  it("is byte-identical to before when the option is omitted", () => {
    expect(buildCreateItems(rows, options())).toEqual(
      buildCreateItems(rows, { ...options(), settledResourceType: undefined })
    )
  })

  it("applies to a replace exactly as to a create", () => {
    const { items } = buildReplaceItems(rows, {
      ...options(),
      settledResourceType: new Map([["mat-1", "SMT" as const]]),
    })
    expect(items[0].resource_type).toBe("SMT")
  })
})
