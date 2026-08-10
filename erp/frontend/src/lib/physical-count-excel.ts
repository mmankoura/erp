import * as XLSX from "xlsx"
import type { PhysicalCountVarianceReport } from "./api"

type Row = Array<string | number | null>

const HEADERS = [
  "Type",
  "UID",
  "IPN",
  "MFR",
  "MPN",
  "Expected Qty",
  "Scanned Qty",
  "Recounted Qty",
  "Variance",
  "Variance $",
  "Resolution",
  "Note",
  "Resolved By",
] as const

export function exportPhysicalCountToExcel(report: PhysicalCountVarianceReport): void {
  const rows: Row[] = []

  // Summary block
  rows.push(["Physical Count Variance Report"])
  rows.push(["Count #", report.count.count_number])
  rows.push(["Customer", `${report.count.customer.name} (${report.count.customer.code})`])
  rows.push(["Status", report.count.status])
  rows.push(["BIN filter", report.count.bin_filter ?? ""])
  rows.push(["Category filter", report.count.category_filter ?? ""])
  rows.push(["Counted by", report.count.counted_by ?? ""])
  rows.push(["Approved by", report.count.approved_by ?? ""])
  rows.push(["Approved at", report.count.approved_at ?? ""])
  rows.push([])
  rows.push(["Discrepancies total", report.totals.discrepancies_total])
  rows.push(["Shortage", report.totals.by_type_count.SHORTAGE])
  rows.push(["Overage", report.totals.by_type_count.OVERAGE])
  rows.push(["Not scanned", report.totals.by_type_count.NOT_SCANNED])
  rows.push(["Orphan", report.totals.by_type_count.ORPHAN])
  rows.push(["Total variance value", report.totals.variance_value_total])
  rows.push([])
  rows.push(["Resolutions"])
  rows.push(["ADJUST_TO_SCAN", report.totals.by_resolution_count.ADJUST_TO_SCAN])
  rows.push(["ACCEPT_WITH_NOTE", report.totals.by_resolution_count.ACCEPT_WITH_NOTE])
  rows.push(["RECOUNT", report.totals.by_resolution_count.RECOUNT])
  rows.push(["SCRAP_MISSING", report.totals.by_resolution_count.SCRAP_MISSING])
  rows.push([])

  // Detail rows
  rows.push(Array.from(HEADERS))
  const types = ["SHORTAGE", "OVERAGE", "NOT_SCANNED", "ORPHAN"] as const
  for (const t of types) {
    for (const r of report.by_type[t]) {
      rows.push([
        t,
        r.uid ?? "",
        r.ipn ?? "",
        r.mfr ?? "",
        r.mpn ?? "",
        r.expected_qty,
        r.scanned_qty,
        r.recount_qty,
        r.variance,
        r.variance_value,
        r.resolution_action ?? "",
        r.resolution_note ?? "",
        r.resolved_by ?? "",
      ])
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws["!cols"] = [
    { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 22 },
    { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 14 },
    { wch: 16 }, { wch: 32 }, { wch: 16 },
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Variance")

  XLSX.writeFile(wb, `${report.count.count_number}-variance.xlsx`)
}
