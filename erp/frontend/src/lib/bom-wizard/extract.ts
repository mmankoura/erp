/**
 * Transformed grid -> BOM lines, and everything that can be checked without
 * the server.
 *
 * Pure, like the rest of the engine: the commit dialog decides *when* to run
 * this, never *how* it works. Values stay strings until the last moment, so a
 * quantity the file wrote as "1,234" is a problem this module reports rather
 * than a NaN that reaches the API.
 */

import type { GridWarning, SemanticField, WizardGrid } from "./types"
import { columnFor } from "./apply"

/** Mirrors `ResourceType` in `lib/api.ts` and the backend enum. */
export type ResourceType = "SMT" | "TH" | "MECH" | "PCB" | "DNP"

export const RESOURCE_TYPES: ResourceType[] = ["SMT", "TH", "MECH", "PCB", "DNP"]

const isResourceType = (value: string): value is ResourceType =>
  (RESOURCE_TYPES as string[]).includes(value)

export interface ExtractedRow {
  /** Position in the source file, so every warning can point back at a line. */
  srcIndex: number
  values: Partial<Record<SemanticField, string>>
  /**
   * Identity for the replace diff. A matched line keeps its `bom_item.id` and
   * therefore its alternates, so this wants to be as stable across revisions as
   * the file allows.
   */
  lineKey: string
}

/** A run like `C50-C54`, or `C50-54` where the prefix is not repeated. */
const DESIGNATOR_RANGE = /^([A-Za-z]+)(\d+)\s*-\s*([A-Za-z]*)(\d+)$/

/**
 * Beyond this a dash is far more likely to be part of a part number than a run
 * of designators, and expanding it would be both wrong and enormous.
 */
const MAX_RANGE = 1000

/**
 * `C50-C54` -> the five designators it stands for.
 *
 * Real BOMs abbreviate long runs, and counting the token instead of what it
 * means made every such line look like its quantity was wrong: one file listed
 * 21 tokens standing for 83 designators against a stated quantity of 83, and
 * the warning called it a disagreement. It also hid genuine duplicates, since
 * `C52` elsewhere never matched the `C50-C54` that already contained it.
 *
 * Anything that is not unambiguously a run is left exactly as written —
 * mismatched prefixes, backwards bounds, absurd spans.
 */
function expandDesignator(token: string): string[] {
  const match = DESIGNATOR_RANGE.exec(token)
  if (!match) return [token]

  const [, prefix, startText, endPrefix, endText] = match
  // "C50-R54" is two designators joined by a dash, not a run between them.
  if (endPrefix !== "" && endPrefix.toUpperCase() !== prefix.toUpperCase()) return [token]

  const start = Number(startText)
  const end = Number(endText)
  if (end < start || end - start + 1 > MAX_RANGE) return [token]

  // Keep zero padding, so an expanded C007 still matches a literal C007.
  const width =
    startText.length === endText.length && startText.startsWith("0") ? startText.length : 0

  const out: string[] = []
  for (let n = start; n <= end; n++) {
    out.push(`${prefix}${width ? String(n).padStart(width, "0") : n}`)
  }
  return out
}

/**
 * Split a designator cell the way the merge action joined it, expanding any
 * abbreviated runs so the count means what the BOM means.
 *
 * Only ever used to count and to find duplicates — the string stored on the
 * line stays exactly as the file wrote it, ranges and all.
 */
export function designatorsOf(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .flatMap(expandDesignator)
}

/**
 * Parse a quantity the way a spreadsheet would have shown it. Returns null
 * for anything that is not a usable number, which the caller reports rather
 * than guessing at.
 */
export function parseQuantity(raw: string | undefined): number | null {
  const trimmed = (raw ?? "").trim()
  if (trimmed === "") return null

  const cleaned = trimmed.replace(/,/g, "")
  if (!/^-?\d*\.?\d+$/.test(cleaned)) return null

  const value = Number(cleaned)
  return Number.isFinite(value) && value >= 0 ? value : null
}

/**
 * Best guess at which enum value an unrecognised resource type belongs to.
 *
 * Only ever a suggestion — the commit dialog shows it in an editable table,
 * because the vocabulary is the customer's and no rule here will survive the
 * next one. Matching is on whole tokens rather than substrings, so
 * "MECHANICAL" is not read as containing "IC".
 */
export function suggestResourceType(raw: string): ResourceType {
  const upper = raw.trim().toUpperCase()
  const tokens = upper.split(/[^A-Z0-9]+/).filter(Boolean)

  const hasToken = (...candidates: string[]) => tokens.some((t) => candidates.includes(t))

  // The file already speaks the enum.
  const exact = tokens.find((t) => isResourceType(t))
  if (exact) return exact as ResourceType

  if (/DO\s*NOT\s*POPULATE|NO\s*LOAD/.test(upper) || hasToken("DNP", "NOPOP", "NP", "NL")) {
    return "DNP"
  }
  if (hasToken("PCB", "PWB", "BOARD")) return "PCB"
  if (hasToken("IC", "SMD", "CHIP", "RES", "CAP", "DIODE", "LED", "XTAL", "BGA", "QFP")) {
    return "SMT"
  }
  if (hasToken("THRU", "THROUGH", "RADIAL", "AXIAL", "DIP")) return "TH"

  // Brackets, clamps, heatsinks, adhesives, assemblies — everything left is
  // something someone fits by hand.
  return "MECH"
}

/**
 * Derive the line identity.
 *
 * The file's own line number is preferred: it is the only value that means the
 * same thing in this revision and the next one. Without it, an IPN plus its
 * occurrence count is the best available — stable as long as the ordering of
 * repeated parts holds, which matters because a real BOM repeats "Do Not
 * Populate" dozens of times.
 */
function lineKeyFor(
  values: Partial<Record<SemanticField, string>>,
  seen: Map<string, number>
): string {
  const lineNumber = values.line_number?.trim()
  if (lineNumber) return `L:${lineNumber}`

  const ipn = values.internal_part_number?.trim() || "(blank)"
  const occurrence = (seen.get(ipn) ?? 0) + 1
  seen.set(ipn, occurrence)
  return `P:${ipn}#${occurrence}`
}

/** Pull the mapped columns out of the grid, one entry per remaining row. */
export function extractRows(grid: WizardGrid): ExtractedRow[] {
  const columns = new Map<SemanticField, string>()
  for (const field of Object.values(grid.mapping)) {
    const columnId = columnFor(grid, field)
    if (columnId) columns.set(field, columnId)
  }

  const seen = new Map<string, number>()

  return grid.rows.map((row) => {
    const values: Partial<Record<SemanticField, string>> = {}
    for (const [field, columnId] of columns) {
      const value = (row.cells[columnId] ?? "").trim()
      if (value !== "") values[field] = value
    }
    return { srcIndex: row.srcIndex, values, lineKey: lineKeyFor(values, seen) }
  })
}

/** Rows sharing a line identity, in the order they appear. One entry per line once merged. */
function groupByLineKey(rows: ExtractedRow[]): Map<string, ExtractedRow[]> {
  const groups = new Map<string, ExtractedRow[]>()
  for (const row of rows) {
    const group = groups.get(row.lineKey)
    if (group) group.push(row)
    else groups.set(row.lineKey, [row])
  }
  return groups
}

/**
 * Everything wrong with the extracted lines that can be known without asking
 * the server. Never mutates and never blocks — the commit dialog shows these
 * and lets the user decide, which is what `GridWarning` was designed for.
 */
export function findWarnings(rows: ExtractedRow[]): GridWarning[] {
  const warnings: GridWarning[] = []

  const designatorOwners = new Map<string, number[]>()
  const keyOwners = new Map<string, number[]>()

  for (const row of rows) {
    const { srcIndex, values } = row

    if (!values.internal_part_number) {
      warnings.push({
        kind: "missing_ipn",
        srcIndex,
        message: `Row ${srcIndex + 1} has no internal part number.`,
      })
    }

    const quantity = parseQuantity(values.quantity_required)
    if (quantity === null) {
      warnings.push({
        kind: "invalid_quantity",
        srcIndex,
        message: values.quantity_required
          ? `Row ${srcIndex + 1}: "${values.quantity_required}" is not a usable quantity.`
          : `Row ${srcIndex + 1} has no quantity.`,
      })
    }

    const designators = designatorsOf(values.reference_designators)

    for (const designator of designators) {
      const owners = designatorOwners.get(designator) ?? []
      owners.push(srcIndex)
      designatorOwners.set(designator, owners)
    }

    if (values.resource_type && !isResourceType(values.resource_type.toUpperCase())) {
      warnings.push({
        kind: "unmapped_resource_type",
        srcIndex,
        message: `Row ${srcIndex + 1}: "${values.resource_type}" is not one of ${RESOURCE_TYPES.join(", ")}.`,
      })
    }

    const keyed = keyOwners.get(row.lineKey) ?? []
    keyed.push(srcIndex)
    keyOwners.set(row.lineKey, keyed)
  }

  /**
   * Quantity against designator count, asked once per *line* rather than once
   * per row.
   *
   * Before Merge runs, a wrapped line is still many rows: each carries the
   * whole line's quantity (Fill Down put it there) but only its own fragment of
   * the designator list, so a per-row check fires on every continuation row and
   * buries everything else. Counting across the rows that share a line
   * identity asks the question the user actually cares about — does this part's
   * quantity match its designators — and gives the same answer before and after
   * a merge.
   */
  for (const [key, groupRows] of groupByLineKey(rows)) {
    const quantity = groupRows
      .map((r) => parseQuantity(r.values.quantity_required))
      .find((q) => q !== null)
    if (quantity === null || quantity === undefined) continue

    const designators = groupRows.flatMap((r) =>
      designatorsOf(r.values.reference_designators)
    )
    if (designators.length === 0 || designators.length === quantity) continue

    const first = groupRows[0].srcIndex
    const where =
      groupRows.length === 1
        ? `Row ${first + 1}`
        : `Line "${key}" (rows ${first + 1}–${groupRows[groupRows.length - 1].srcIndex + 1})`

    warnings.push({
      kind: "quantity_mismatch",
      srcIndex: first,
      message: `${where}: quantity is ${quantity} but ${designators.length} reference designators are listed.`,
    })
  }

  for (const [designator, owners] of designatorOwners) {
    if (owners.length > 1) {
      warnings.push({
        kind: "duplicate_designator",
        srcIndex: owners[0],
        message: `${designator} appears on ${owners.length} lines (rows ${owners
          .map((i) => i + 1)
          .join(", ")}).`,
      })
    }
  }

  for (const [key, owners] of keyOwners) {
    if (owners.length > 1) {
      warnings.push({
        kind: "duplicate_key",
        srcIndex: owners[0],
        message: `Line identity "${key}" is used by ${owners.length} rows (${owners
          .map((i) => i + 1)
          .join(", ")}). A replace would refuse this.`,
      })
    }
  }

  return warnings
}

export interface ResourceTypeGroup {
  /** The value exactly as the file wrote it. */
  raw: string
  count: number
  suggestion: ResourceType
}

/**
 * The distinct resource-type values the enum cannot hold, with a suggestion
 * each. Drives the mapping table in the commit dialog.
 */
export function unrecognisedResourceTypes(rows: ExtractedRow[]): ResourceTypeGroup[] {
  const counts = new Map<string, number>()

  for (const row of rows) {
    const raw = row.values.resource_type
    if (!raw || isResourceType(raw.toUpperCase())) continue
    counts.set(raw, (counts.get(raw) ?? 0) + 1)
  }

  return Array.from(counts, ([raw, count]) => ({
    raw,
    count,
    suggestion: suggestResourceType(raw),
  })).sort((a, b) => b.count - a.count || a.raw.localeCompare(b.raw))
}

/**
 * Resolve a row's resource type through the user's mapping table.
 *
 * A value already in the enum passes straight through; anything else takes the
 * mapping, and the original wording is handed back separately so the caller can
 * keep it in `notes` rather than losing what the file actually said.
 */
export function resolveResourceType(
  raw: string | undefined,
  mapping: Record<string, ResourceType>
): { resource_type: ResourceType | undefined; original?: string } {
  const trimmed = raw?.trim()
  if (!trimmed) return { resource_type: undefined }

  const upper = trimmed.toUpperCase()
  if (isResourceType(upper)) return { resource_type: upper }

  const mapped = mapping[trimmed]
  return mapped ? { resource_type: mapped, original: trimmed } : { resource_type: undefined, original: trimmed }
}

/** Append the file's own wording to whatever notes the row already carried. */
export function notesWithOriginal(
  notes: string | undefined,
  original: string | undefined
): string | undefined {
  if (!original) return notes || undefined
  const suffix = `Resource type from file: ${original}`
  return notes ? `${notes} — ${suffix}` : suffix
}
