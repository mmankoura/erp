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
import { notesWithOriginal, parseQuantity, resolveResourceType } from "./extract"

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
  if (resource_type) item.resource_type = resource_type
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
