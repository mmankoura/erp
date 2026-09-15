import type { LotLabelData } from "@/lib/api"

/**
 * Builds the LabelSet XML that drives a DYMO data-merge print.
 *
 * We do NOT generate the label itself. `public/dymo/material-label.dymo` is the
 * operator's own DYMO Connect template, shipped verbatim; every variable field
 * in it is a DataMappingTextSpan bound to a <ColumnName>, and the DataMatrix
 * encodes a composite of several of those columns. All this module does is
 * supply values for those columns.
 *
 * The payoff is that the label's design lives in DYMO Connect, where it can be
 * re-laid-out without touching code — only a change to the *set of columns*
 * would reach this file.
 */

/**
 * The template binds some fields under more than one name — `PO#` and `PO# `
 * (with a trailing space) both appear, as do QTY/Quantity and
 * MPN/Manufacturer Part Number. Rather than guess which one the merge engine
 * resolves, emit every alias. A column the template doesn't use is ignored.
 */
const COLUMN_ALIASES: Record<string, (d: LotLabelData) => string> = {
  UID: (d) => d.uid,
  "AT&A#": (d) => d.ipn,
  Description: (d) => d.description ?? "",
  MPN: (d) => d.manufacturer_pn ?? "",
  "Manufacturer Part Number": (d) => d.manufacturer_pn ?? "",
  MFR: (d) => d.manufacturer ?? "",
  "PO#": (d) => d.po_reference ?? "",
  "PO# ": (d) => d.po_reference ?? "",
  QTY: (d) => formatQuantity(d.quantity),
  Quantity: (d) => formatQuantity(d.quantity),
  Packaging: (d) => d.package_type,
  "Mounting Type": (d) => d.resource_type ?? "",
  Customer: (d) => d.owner_name ?? "",
  "Customer Reference": (d) => d.owner_name ?? "",
}

/**
 * XML 1.0 metacharacters. This matters more here than it looks: the column name
 * `AT&A#` contains a literal ampersand, and 38 material descriptions in the
 * catalogue carry double quotes from inch marks (`0.200"`). One unescaped
 * character and the whole print job is rejected with an error that names none
 * of them.
 */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function formatQuantity(quantity: number): string {
  // No thousands separator: this value also gets encoded into the DataMatrix,
  // and a comma there would have to be stripped by whatever scans it.
  return String(quantity)
}

/**
 * One LabelRecord per lot. A batch is a single print job with many records,
 * which is both faster and far less likely to interleave with another
 * workstation's job than N separate calls.
 */
export function buildLabelSetXml(labels: LotLabelData[]): string {
  const records = labels
    .map((label) => {
      const fields = Object.entries(COLUMN_ALIASES)
        .map(
          ([column, read]) =>
            `    <ObjectData Name="${escapeXml(column)}">${escapeXml(read(label))}</ObjectData>`,
        )
        .join("\n")
      return `  <LabelRecord>\n${fields}\n  </LabelRecord>`
    })
    .join("\n")

  return `<?xml version="1.0" encoding="utf-8"?>\n<LabelSet>\n${records}\n</LabelSet>`
}

/** Exposed for the dialog's preview, so it shows exactly what will be merged. */
export function labelFieldPreview(
  label: LotLabelData,
): Array<{ column: string; value: string }> {
  // Aliases would render as duplicate rows; show one entry per visible field.
  const visible = [
    "UID",
    "AT&A#",
    "Description",
    "MPN",
    "MFR",
    "PO#",
    "QTY",
    "Packaging",
    "Mounting Type",
    "Customer",
  ]
  return visible.map((column) => ({
    column,
    value: COLUMN_ALIASES[column](label),
  }))
}
