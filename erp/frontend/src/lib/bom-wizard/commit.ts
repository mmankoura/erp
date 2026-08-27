/**
 * Extracted rows -> the two commit payloads.
 *
 * Kept pure and separate from the dialog for the usual reason: this is where a
 * quantity becomes a number and a resource type the enum cannot hold becomes
 * one it can, and both are far easier to prove correct here than through a
 * form. The dialog decides *which* payload to send and gathers the material
 * ids; it does not decide what a line looks like.
 */

import type { ExtractedRow, ResourceType } from "./extract"
import {
  notesWithOriginal,
  parseQuantity,
  resolveResourceType,
  RESOURCE_TYPES,
} from "./extract"

/** What `POST /materials/resolve-part-numbers` gives back. */
export interface ResolvedPartNumber {
  part_number: string
  material_id: string
  internal_part_number: string
  description: string | null
  manufacturer: string | null
  manufacturer_pn: string | null
  resource_type: string | null
  customer_id: string | null
}

/**
 * Found only by ignoring case. A different shape from a match on purpose: the
 * server reports the material's real spelling as `suggested`, because the
 * decision the caller has to make is precisely "did you mean this one?".
 */
export interface CaseMismatchedPartNumber {
  /** As the file spelled it. */
  part_number: string
  /** As the material spells it. */
  suggested: string
  material_id: string
  /**
   * The same master fields a match carries. Accepting the suggestion means
   * reasoning about this material exactly as for an exact hit, and without
   * these it could not be classified at all.
   */
  description: string | null
  manufacturer: string | null
  manufacturer_pn: string | null
  resource_type: string | null
}

export interface PartNumberResolution {
  matched: ResolvedPartNumber[]
  case_mismatch: CaseMismatchedPartNumber[]
  missing: string[]
}

/** One line of `POST /bom/revision/full`. */
export interface CreateBomItemPayload {
  material_id: string
  quantity_required: number
  line_number?: number
  reference_designators?: string
  alternate_ipn?: string
  resource_type?: ResourceType
  polarized?: boolean
  notes?: string
}

/** One line of `PUT /bom/revision/:id/items`. Same, plus the diff identity. */
export interface ReplaceBomItemPayload extends CreateBomItemPayload {
  bom_line_key: string
}

export interface BuildOptions {
  /** IPN (as the file wrote it) -> material id. */
  materialByPartNumber: Map<string, string>
  /** The file's own resource-type wording -> an enum value. */
  resourceMapping: Record<string, ResourceType>
  /**
   * Material id -> the resource type that material will hold once the commit
   * has run. Wins over the file, so a line and its material cannot disagree.
   *
   * Absent means nothing settled it and the file stands — which is the path
   * taken when the user cannot write materials, or declined to.
   */
  settledResourceType?: Map<string, ResourceType>
}

export interface BuildResult<T> {
  items: T[]
  /**
   * Rows that could not become a line, with the reason. Never silently
   * dropped — the dialog has to be able to say what will not be imported.
   */
  skipped: { srcIndex: number; reason: string }[]
}

const TRUTHY = new Set(["TRUE", "YES", "Y", "1"])

/** A line number the API will accept, or nothing. It is optional, so a bad one is not worth failing over. */
function parseLineNumber(raw: string | undefined): number | undefined {
  const trimmed = (raw ?? "").trim()
  if (trimmed === "") return undefined
  const value = Number(trimmed)
  return Number.isInteger(value) && value >= 0 ? value : undefined
}

/** Shared across both payload shapes; the only difference is the line key. */
function buildOne(
  row: ExtractedRow,
  options: BuildOptions
): { item: CreateBomItemPayload } | { reason: string } {
  const partNumber = row.values.internal_part_number?.trim()
  if (!partNumber) return { reason: "no internal part number" }

  const materialId = options.materialByPartNumber.get(partNumber)
  if (!materialId) return { reason: `no material matches "${partNumber}"` }

  const quantity = parseQuantity(row.values.quantity_required)
  if (quantity === null) {
    return {
      reason: row.values.quantity_required
        ? `"${row.values.quantity_required}" is not a usable quantity`
        : "no quantity",
    }
  }

  const { resource_type, original } = resolveResourceType(
    row.values.resource_type,
    options.resourceMapping
  )
  // The material is the master, so what it will hold wins over the file's
  // column. `original` is deliberately untouched: the notes go on recording
  // what the *file* said, and the case where the two differ is exactly the
  // case where that wording is worth keeping.
  const settled = options.settledResourceType?.get(materialId) ?? resource_type

  const polarized = row.values.polarized
    ? TRUTHY.has(row.values.polarized.trim().toUpperCase())
    : undefined

  const item: CreateBomItemPayload = {
    material_id: materialId,
    quantity_required: quantity,
  }

  const lineNumber = parseLineNumber(row.values.line_number)
  if (lineNumber !== undefined) item.line_number = lineNumber
  if (row.values.reference_designators) {
    item.reference_designators = row.values.reference_designators
  }
  if (row.values.alternate_ipn) item.alternate_ipn = row.values.alternate_ipn
  if (settled) item.resource_type = settled
  if (polarized !== undefined) item.polarized = polarized

  // The file's own resource-type wording rides along in notes, so mapping it
  // onto the enum never loses what the customer actually wrote.
  const notes = notesWithOriginal(row.values.notes, original)
  if (notes) item.notes = notes

  return { item }
}

export function buildCreateItems(
  rows: ExtractedRow[],
  options: BuildOptions
): BuildResult<CreateBomItemPayload> {
  const items: CreateBomItemPayload[] = []
  const skipped: BuildResult<CreateBomItemPayload>["skipped"] = []

  for (const row of rows) {
    const built = buildOne(row, options)
    if ("reason" in built) skipped.push({ srcIndex: row.srcIndex, reason: built.reason })
    else items.push(built.item)
  }

  return { items, skipped }
}

export function buildReplaceItems(
  rows: ExtractedRow[],
  options: BuildOptions
): BuildResult<ReplaceBomItemPayload> {
  const items: ReplaceBomItemPayload[] = []
  const skipped: BuildResult<ReplaceBomItemPayload>["skipped"] = []

  for (const row of rows) {
    const built = buildOne(row, options)
    if ("reason" in built) skipped.push({ srcIndex: row.srcIndex, reason: built.reason })
    else items.push({ ...built.item, bom_line_key: row.lineKey })
  }

  return { items, skipped }
}

/**
 * The part numbers to look up: distinct, in the file's own spelling.
 *
 * Case matters here — resolution reports an exact hit separately from one
 * found only by ignoring case, and collapsing them first would throw away the
 * distinction the caller is supposed to decide on.
 */
export function partNumbersToResolve(rows: ExtractedRow[]): string[] {
  const seen = new Set<string>()
  for (const row of rows) {
    const partNumber = row.values.internal_part_number?.trim()
    if (partNumber) seen.add(partNumber)
  }
  return Array.from(seen)
}

/**
 * Build the IPN -> material id lookup the payload builders need.
 *
 * Case-mismatched hits are included only when accepted, and keyed by what the
 * *file* said, so the row still finds its material without the spelling being
 * rewritten behind the user's back.
 */
export function materialLookup(
  resolution: PartNumberResolution,
  acceptCaseMismatches: boolean
): Map<string, string> {
  const lookup = new Map<string, string>()
  for (const hit of resolution.matched) lookup.set(hit.part_number, hit.material_id)
  if (acceptCaseMismatches) {
    for (const hit of resolution.case_mismatch) lookup.set(hit.part_number, hit.material_id)
  }
  return lookup
}

/**
 * A material the file implies but the system does not hold yet.
 *
 * Every field is a string, including the resource type, because this is what a
 * form edits. `""` means "the file did not say", which is different from a
 * value the reviewer cleared on purpose only in that both end up omitted.
 */
export interface MaterialDraft {
  internal_part_number: string
  description: string
  manufacturer: string
  manufacturer_pn: string
  resource_type: ResourceType | ""
}

/** One line of `POST /materials/bulk`. */
export interface CreateMaterialPayload {
  customer_id: string
  internal_part_number: string
  description?: string
  manufacturer?: string
  manufacturer_pn?: string
  resource_type?: ResourceType
}

/** The master fields a file can speak to, in the order a reviewer reads them. */
export const MASTER_FIELDS = [
  "resource_type",
  "description",
  "manufacturer",
  "manufacturer_pn",
] as const

export type MasterField = (typeof MASTER_FIELDS)[number]

/** What the file says about one part number. `""` means it did not say. */
export interface FileValues {
  resource_type: ResourceType | ""
  description: string
  manufacturer: string
  manufacturer_pn: string
}

/**
 * The file's own account of each wanted part number.
 *
 * The first row carrying a part number wins. A wrapped file repeats an IPN
 * across a merged run and it is the lead row that holds the description and
 * manufacturer, so first-wins is not arbitrary — it is where the values are.
 *
 * Shared by the drafts for materials that do not exist yet and the plan for
 * settling ones that do, so that rule is stated once and both obey it.
 */
export function fileValuesByPartNumber(
  rows: ExtractedRow[],
  wanted: Set<string>,
  resourceMapping: Record<string, ResourceType>
): Map<string, FileValues> {
  const found = new Map<string, FileValues>()

  for (const row of rows) {
    const partNumber = row.values.internal_part_number?.trim()
    if (!partNumber || !wanted.has(partNumber) || found.has(partNumber)) continue

    const { resource_type } = resolveResourceType(row.values.resource_type, resourceMapping)

    found.set(partNumber, {
      resource_type: resource_type ?? "",
      description: row.values.description?.trim() ?? "",
      manufacturer: row.values.manufacturer?.trim() ?? "",
      manufacturer_pn: row.values.manufacturer_pn?.trim() ?? "",
    })
  }

  return found
}

/**
 * Drafts for the part numbers resolution reported missing, seeded from the
 * file's own columns.
 *
 * The first row carrying a part number wins. A wrapped file repeats an IPN
 * across a merged run and it is the lead row that holds the description and
 * manufacturer, so first-wins is not arbitrary — it is where the values are.
 *
 * Only fields the file actually mapped get filled. A draft is a starting point
 * for review, never an assertion that this is what the material should be:
 * REV-012 refused to invent materials at all, and the point of reviewing these
 * is that a typo in a spreadsheet must not silently become a part number.
 *
 * Returned in the order resolution reported, so the table reads like the list
 * of missing part numbers it replaces.
 */
export function buildMaterialDrafts(
  rows: ExtractedRow[],
  missing: string[],
  resourceMapping: Record<string, ResourceType>
): MaterialDraft[] {
  const values = fileValuesByPartNumber(rows, new Set(missing), resourceMapping)

  return missing
    .map((partNumber) => {
      const found = values.get(partNumber)
      return found ? { internal_part_number: partNumber, ...found } : undefined
    })
    .filter((draft): draft is MaterialDraft => draft !== undefined)
}

/**
 * Drafts -> what `POST /materials/bulk` accepts.
 *
 * Blank optional fields are omitted rather than sent as `""`, so a material
 * the file said nothing about ends up with a null column instead of an empty
 * string that later reads as a real (and wrong) value.
 */
export function materialPayloads(
  drafts: MaterialDraft[],
  customerId: string
): CreateMaterialPayload[] {
  return drafts.map((draft) => {
    const payload: CreateMaterialPayload = {
      customer_id: customerId,
      internal_part_number: draft.internal_part_number.trim(),
    }
    const description = draft.description.trim()
    const manufacturer = draft.manufacturer.trim()
    const manufacturerPn = draft.manufacturer_pn.trim()

    if (description) payload.description = description
    if (manufacturer) payload.manufacturer = manufacturer
    if (manufacturerPn) payload.manufacturer_pn = manufacturerPn
    if (draft.resource_type) payload.resource_type = draft.resource_type

    return payload
  })
}

// =================== Settling the material master ===================

/**
 * Which disagreements are put to the user.
 *
 * All four today. Resource type is an enum, so a difference is unambiguous;
 * the free-text fields differ by wording far more often, but in practice the
 * master data is so sparse that almost every difference is a blank being
 * filled rather than a real disagreement. Kept as a constant so narrowing this
 * to `["resource_type"]` later is one line and no rework.
 */
export const CONFLICT_FIELDS: MasterField[] = [...MASTER_FIELDS]

/** A blank on the material that the file can answer. */
export interface MaterialFill {
  material_id: string
  /** As the file spelled it. */
  part_number: string
  /** As the material spells it. */
  internal_part_number: string
  field: MasterField
  value: string
}

/** The material and the file both have something to say, and they differ. */
export interface MaterialConflict {
  material_id: string
  part_number: string
  internal_part_number: string
  field: MasterField
  /** Never blank — a blank would have been a fill. */
  material_value: string
  /** Never blank — silence is not disagreement. */
  file_value: string
}

export interface MasterDataPlan {
  fills: MaterialFill[]
  conflicts: MaterialConflict[]
  /** Differences on fields not being asked about. The material's value stands. */
  kept: MaterialConflict[]
  /** Counted, not listed: the file and the material already agree. */
  agreed: number
}

export type ConflictChoice = "material" | "file"

/** Keyed by {@link fieldKey} — one material can hold several of either. */
export type ConflictChoices = Record<string, ConflictChoice>
export type FillEdits = Record<string, string>

export const fieldKey = (materialId: string, field: MasterField): string =>
  `${materialId}:${field}`

const isResourceType = (value: string): value is ResourceType =>
  (RESOURCE_TYPES as readonly string[]).includes(value)

/** The materials a commit will touch: exact hits, plus accepted near-misses. */
function settleableMaterials(
  resolution: PartNumberResolution,
  acceptCaseMismatches: boolean
): { part_number: string; material_id: string; internal_part_number: string; values: FileValues }[] {
  const out: ReturnType<typeof settleableMaterials> = []

  for (const hit of resolution.matched) {
    out.push({
      part_number: hit.part_number,
      material_id: hit.material_id,
      internal_part_number: hit.internal_part_number,
      values: {
        resource_type: (hit.resource_type ?? "") as ResourceType | "",
        description: hit.description ?? "",
        manufacturer: hit.manufacturer ?? "",
        manufacturer_pn: hit.manufacturer_pn ?? "",
      },
    })
  }

  if (acceptCaseMismatches) {
    for (const hit of resolution.case_mismatch) {
      out.push({
        part_number: hit.part_number,
        material_id: hit.material_id,
        internal_part_number: hit.suggested,
        values: {
          resource_type: (hit.resource_type ?? "") as ResourceType | "",
          description: hit.description ?? "",
          manufacturer: hit.manufacturer ?? "",
          manufacturer_pn: hit.manufacturer_pn ?? "",
        },
      })
    }
  }

  return out
}

/**
 * What this file would settle on the materials it matched.
 *
 * The material is the master. Where it is blank the file fills it; where both
 * speak and disagree the user decides. A blank *file* column never clears a
 * material — silence is not an instruction, and an import that could empty a
 * master record on the strength of a missing cell would be a worse bug than
 * the one this fixes.
 */
export function planMasterData(
  rows: ExtractedRow[],
  resolution: PartNumberResolution,
  resourceMapping: Record<string, ResourceType>,
  acceptCaseMismatches: boolean,
  conflictFields: MasterField[] = CONFLICT_FIELDS
): MasterDataPlan {
  const materials = settleableMaterials(resolution, acceptCaseMismatches)
  const fromFile = fileValuesByPartNumber(
    rows,
    new Set(materials.map((m) => m.part_number)),
    resourceMapping
  )

  const plan: MasterDataPlan = { fills: [], conflicts: [], kept: [], agreed: 0 }

  for (const material of materials) {
    const said = fromFile.get(material.part_number)
    if (!said) continue

    for (const field of MASTER_FIELDS) {
      const fileValue = said[field].trim()
      if (!fileValue) continue

      // The legacy importer wrote null, "" and "   " for the same idea.
      const materialValue = material.values[field].trim()

      const where = {
        material_id: material.material_id,
        part_number: material.part_number,
        internal_part_number: material.internal_part_number,
        field,
      }

      if (!materialValue) {
        plan.fills.push({ ...where, value: fileValue })
      } else if (materialValue === fileValue) {
        plan.agreed++
      } else {
        const conflict = { ...where, material_value: materialValue, file_value: fileValue }
        if (conflictFields.includes(field)) plan.conflicts.push(conflict)
        else plan.kept.push(conflict)
      }
    }
  }

  return plan
}

/** One line of `PATCH /materials/bulk`. */
export interface UpdateMaterialPayload {
  id: string
  description?: string
  manufacturer?: string
  manufacturer_pn?: string
  resource_type?: ResourceType
}

/**
 * The plan plus the user's decisions, as patches.
 *
 * A conflict with no recorded choice keeps the material's value, so an
 * untouched dialog writes fills only — the safe default the rule asked for.
 * A fill whose value was cleared during review is dropped rather than sent as
 * an empty string, which the endpoint would refuse anyway.
 */
export function materialUpdatePayloads(
  plan: MasterDataPlan,
  choices: ConflictChoices,
  fillEdits: FillEdits = {}
): UpdateMaterialPayload[] {
  const byMaterial = new Map<string, UpdateMaterialPayload>()

  const set = (materialId: string, field: MasterField, value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return
    if (field === "resource_type" && !isResourceType(trimmed)) return

    const payload = byMaterial.get(materialId) ?? { id: materialId }
    if (field === "resource_type") payload.resource_type = trimmed as ResourceType
    else payload[field] = trimmed
    byMaterial.set(materialId, payload)
  }

  for (const fill of plan.fills) {
    const key = fieldKey(fill.material_id, fill.field)
    set(fill.material_id, fill.field, fillEdits[key] ?? fill.value)
  }

  for (const conflict of plan.conflicts) {
    if (choices[fieldKey(conflict.material_id, conflict.field)] !== "file") continue
    set(conflict.material_id, conflict.field, conflict.file_value)
  }

  return Array.from(byMaterial.values())
}

/**
 * What each material's resource type will be once the commit has run.
 *
 * Fed to `buildCreateItems` / `buildReplaceItems` so the BOM line records the
 * settled value and line and master cannot drift apart. Materials with no
 * resource type anywhere are absent, which leaves the file's word standing.
 */
export function settledResourceTypes(
  plan: MasterDataPlan,
  choices: ConflictChoices,
  fillEdits: FillEdits,
  resolution: PartNumberResolution,
  acceptCaseMismatches: boolean
): Map<string, ResourceType> {
  const settled = new Map<string, ResourceType>()

  // Start from what each material already holds: a line whose file column is
  // blank still inherits the master's type rather than being left empty.
  for (const material of settleableMaterials(resolution, acceptCaseMismatches)) {
    const current = material.values.resource_type.trim()
    if (isResourceType(current)) settled.set(material.material_id, current)
  }

  for (const fill of plan.fills) {
    if (fill.field !== "resource_type") continue
    const value = (fillEdits[fieldKey(fill.material_id, fill.field)] ?? fill.value).trim()
    if (isResourceType(value)) settled.set(fill.material_id, value)
  }

  for (const conflict of plan.conflicts) {
    if (conflict.field !== "resource_type") continue
    if (choices[fieldKey(conflict.material_id, conflict.field)] !== "file") continue
    if (isResourceType(conflict.file_value)) settled.set(conflict.material_id, conflict.file_value)
  }

  return settled
}
