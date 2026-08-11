import * as XLSX from "xlsx"
import type { CustomerInventoryReport } from "./api"

type Row = Array<string | number | null>

const SUMMARY_HEADERS = [
  "IPN",
  "MFR",
  "MPN",
  "Description",
  "Qty On Hand",
  "Reels",
] as const

const DETAIL_HEADERS = [
  "UID",
  "IPN",
  "MFR",
  "MPN",
  "Description",
  "Qty",
  "Package",
  "BIN",
  "PO Ref",
  "Received",
] as const

/**
 * Customer-facing inventory statement: a per-part summary sheet plus the
 * reel-level detail behind it.
 */
export function exportCustomerInventoryToExcel(report: CustomerInventoryReport): void {
  const wb = XLSX.utils.book_new()
  const generated = new Date(report.generated_at)

  // --- Sheet 1: per-part summary ---
  const summaryRows: Row[] = []
  summaryRows.push(["Inventory Held at AT&A"])
  summaryRows.push(["Customer", `${report.customer.name} (${report.customer.code})`])
  summaryRows.push(["Generated", generated.toLocaleString()])
  summaryRows.push(["Distinct parts", report.totals.distinct_parts])
  summaryRows.push(["Reels", report.totals.reels])
  summaryRows.push(["Total quantity", report.totals.total_quantity])
  summaryRows.push([])
  summaryRows.push(Array.from(SUMMARY_HEADERS))
  for (const s of report.summary) {
    summaryRows.push([
      s.ipn ?? "",
      s.mfr ?? "",
      s.mpn ?? "",
      s.description ?? "",
      s.quantity,
      s.reel_count,
    ])
  }
  const ws1 = XLSX.utils.aoa_to_sheet(summaryRows)
  ws1["!cols"] = [
    { wch: 18 }, { wch: 18 }, { wch: 24 }, { wch: 40 }, { wch: 14 }, { wch: 8 },
  ]
  XLSX.utils.book_append_sheet(wb, ws1, "Summary")

  // --- Sheet 2: reel detail ---
  const detailRows: Row[] = []
  detailRows.push(Array.from(DETAIL_HEADERS))
  for (const d of report.detail) {
    detailRows.push([
      d.uid,
      d.ipn ?? "",
      d.mfr ?? "",
      d.mpn ?? "",
      d.description ?? "",
      d.quantity,
      d.package_type,
      d.bin ?? "",
      d.po_reference ?? "",
      d.received_date ? new Date(d.received_date).toLocaleDateString() : "",
    ])
  }
  const ws2 = XLSX.utils.aoa_to_sheet(detailRows)
  ws2["!cols"] = [
    { wch: 16 }, { wch: 18 }, { wch: 18 }, { wch: 24 }, { wch: 40 },
    { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 12 },
  ]
  XLSX.utils.book_append_sheet(wb, ws2, "Reel Detail")

  const stamp = generated.toISOString().slice(0, 10)
  XLSX.writeFile(wb, `${report.customer.code}-inventory-${stamp}.xlsx`)
}
