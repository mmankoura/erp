/**
 * Display metadata for the BOM fields a raw column can be mapped onto.
 *
 * `short` is what fits in a 26px sheet header beside the column's own label;
 * `label` is what the mapping dialog shows. Mirrors the option list in
 * `bom-import-wizard.tsx` minus "ignore" — an unmapped column is simply absent
 * from `WizardGrid.mapping` rather than mapped to a sentinel.
 */

import type { SemanticField } from "./types"

export interface FieldMeta {
  value: SemanticField
  label: string
  short: string
  /** The commit needs these; the mapping dialog marks them. */
  required?: boolean
}

export const SEMANTIC_FIELDS: FieldMeta[] = [
  { value: "internal_part_number", label: "Internal Part Number", short: "IPN", required: true },
  { value: "quantity_required", label: "Quantity Required", short: "Qty", required: true },
  { value: "description", label: "Description", short: "Desc" },
  { value: "alternate_ipn", label: "Alternate IPN", short: "Alt IPN" },
  { value: "manufacturer", label: "Manufacturer", short: "Mfr" },
  { value: "manufacturer_pn", label: "Manufacturer P/N", short: "Mfr P/N" },
  { value: "reference_designators", label: "Reference Designators", short: "Refs" },
  { value: "line_number", label: "Line Number", short: "Line" },
  { value: "resource_type", label: "Resource Type", short: "Type" },
  { value: "polarized", label: "Polarized", short: "Pol" },
  { value: "notes", label: "Notes", short: "Notes" },
]

const BY_VALUE = new Map(SEMANTIC_FIELDS.map((f) => [f.value, f]))

export const fieldMeta = (field: SemanticField): FieldMeta | undefined => BY_VALUE.get(field)

export const REQUIRED_FIELDS: SemanticField[] = SEMANTIC_FIELDS.filter((f) => f.required).map(
  (f) => f.value
)
