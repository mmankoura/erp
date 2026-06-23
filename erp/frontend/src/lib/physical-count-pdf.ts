import jsPDF from "jspdf"
import type { PhysicalCountVarianceReport } from "./api"

export function generatePhysicalCountPdf(report: PhysicalCountVarianceReport): void {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "letter" })
  const pw = doc.internal.pageSize.getWidth()
  const m = 12
  let y = m

  doc.setFontSize(16)
  doc.setFont("helvetica", "bold")
  doc.text("Physical Count Variance Report", m, y + 6)
  y += 12

  doc.setFontSize(9)
  doc.setFont("helvetica", "normal")
  doc.text(`Count: ${report.count.count_number}`, m, y)
  doc.text(`Customer: ${report.count.customer.name} (${report.count.customer.code})`, m + 80, y)
  doc.text(`Status: ${report.count.status}`, m + 200, y)
  y += 5
  doc.text(`BIN filter: ${report.count.bin_filter ?? "—"}`, m, y)
  doc.text(`Category: ${report.count.category_filter ?? "—"}`, m + 80, y)
  doc.text(`Approved: ${report.count.approved_at ? new Date(report.count.approved_at).toLocaleString() : "—"}`, m + 200, y)
  y += 5
  doc.text(`Counted by: ${report.count.counted_by ?? "—"}`, m, y)
  doc.text(`Approved by: ${report.count.approved_by ?? "—"}`, m + 80, y)
  y += 8

  doc.setFontSize(10)
  doc.setFont("helvetica", "bold")
  doc.text("Totals", m, y)
  y += 5
  doc.setFontSize(8)
  doc.setFont("helvetica", "normal")
  doc.text(`Discrepancies: ${report.totals.discrepancies_total}`, m, y)
  doc.text(`Shortage: ${report.totals.by_type_count.SHORTAGE}`, m + 50, y)
  doc.text(`Overage: ${report.totals.by_type_count.OVERAGE}`, m + 90, y)
  doc.text(`Not scanned: ${report.totals.by_type_count.NOT_SCANNED}`, m + 130, y)
  doc.text(`Orphan: ${report.totals.by_type_count.ORPHAN}`, m + 180, y)
  doc.text(`Total variance value: ${report.totals.variance_value_total.toFixed(2)}`, m + 220, y)
  y += 8

  const sections = [
    { key: "SHORTAGE", label: "Shortage" },
    { key: "OVERAGE", label: "Overage" },
    { key: "NOT_SCANNED", label: "Not Scanned" },
    { key: "ORPHAN", label: "Orphan" },
  ] as const

  for (const s of sections) {
    const rows = report.by_type[s.key]
    if (y > 180) {
      doc.addPage()
      y = m
    }
    doc.setFontSize(10)
    doc.setFont("helvetica", "bold")
    doc.text(`${s.label} (${rows.length})`, m, y)
    y += 5

    if (rows.length === 0) {
      doc.setFontSize(8)
      doc.setFont("helvetica", "italic")
      doc.text("None", m, y)
      y += 6
      continue
    }

    doc.setFontSize(7)
    doc.setFont("helvetica", "bold")
    const cols = [
      { x: m, w: 30, label: "UID" },
      { x: m + 30, w: 30, label: "IPN" },
      { x: m + 60, w: 30, label: "MFR" },
      { x: m + 90, w: 30, label: "MPN" },
      { x: m + 120, w: 18, label: "Expected" },
      { x: m + 138, w: 18, label: "Scanned" },
      { x: m + 156, w: 18, label: "Variance" },
      { x: m + 174, w: 20, label: "Var $" },
      { x: m + 194, w: 30, label: "Resolution" },
      { x: m + 224, w: 50, label: "Note" },
    ]
    for (const c of cols) doc.text(c.label, c.x, y)
    y += 4
    doc.setFont("helvetica", "normal")

    for (const r of rows) {
      if (y > 195) {
        doc.addPage()
        y = m
      }
      doc.text(String(r.uid ?? ""), cols[0].x, y, { maxWidth: cols[0].w })
      doc.text(String(r.ipn ?? ""), cols[1].x, y, { maxWidth: cols[1].w })
      doc.text(String(r.mfr ?? ""), cols[2].x, y, { maxWidth: cols[2].w })
      doc.text(String(r.mpn ?? ""), cols[3].x, y, { maxWidth: cols[3].w })
      doc.text(r.expected_qty != null ? String(r.expected_qty) : "—", cols[4].x, y)
      doc.text(r.scanned_qty != null ? String(r.scanned_qty) : "—", cols[5].x, y)
      doc.text(String(r.variance), cols[6].x, y)
      doc.text(r.variance_value != null ? r.variance_value.toFixed(2) : "—", cols[7].x, y)
      doc.text(r.resolution_action ?? "—", cols[8].x, y, { maxWidth: cols[8].w })
      doc.text(r.resolution_note ?? "", cols[9].x, y, { maxWidth: cols[9].w })
      y += 4
    }
    y += 4
  }

  doc.save(`${report.count.count_number}-variance.pdf`)
}
