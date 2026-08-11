import jsPDF from "jspdf"
import type { CustomerInventoryReport } from "./api"

/**
 * Printable inventory statement for a customer — the formal "here is what we
 * hold for you" document. Summary table first, reel detail on following pages.
 */
export function generateCustomerInventoryPdf(report: CustomerInventoryReport): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" })
  const m = 14
  const pageBottom = 250
  const generated = new Date(report.generated_at)
  let y = m

  doc.setFontSize(16)
  doc.setFont("helvetica", "bold")
  doc.text("Inventory Held at AT&A", m, y + 6)
  y += 14

  doc.setFontSize(9)
  doc.setFont("helvetica", "normal")
  doc.text(`Customer: ${report.customer.name} (${report.customer.code})`, m, y)
  y += 5
  doc.text(`Generated: ${generated.toLocaleString()}`, m, y)
  y += 5
  doc.text(
    `Distinct parts: ${report.totals.distinct_parts}    Reels: ${report.totals.reels}    Total qty: ${report.totals.total_quantity.toLocaleString()}`,
    m,
    y,
  )
  y += 9

  const newPage = () => {
    doc.addPage()
    y = m
  }

  // ---- Summary table ----
  doc.setFontSize(11)
  doc.setFont("helvetica", "bold")
  doc.text("Summary by part", m, y)
  y += 6

  const sumCols = [
    { x: m, w: 34, label: "IPN" },
    { x: m + 34, w: 28, label: "MFR" },
    { x: m + 62, w: 38, label: "MPN" },
    { x: m + 100, w: 52, label: "Description" },
    { x: m + 152, w: 20, label: "Qty" },
    { x: m + 172, w: 10, label: "Reels" },
  ]
  const drawHeader = (cols: typeof sumCols) => {
    doc.setFontSize(8)
    doc.setFont("helvetica", "bold")
    for (const c of cols) doc.text(c.label, c.x, y)
    y += 2
    doc.setLineWidth(0.2)
    doc.line(m, y, m + 182, y)
    y += 4
    doc.setFont("helvetica", "normal")
  }
  drawHeader(sumCols)

  for (const s of report.summary) {
    if (y > pageBottom) {
      newPage()
      drawHeader(sumCols)
    }
    doc.text(s.ipn ?? "—", sumCols[0].x, y, { maxWidth: sumCols[0].w })
    doc.text(s.mfr ?? "—", sumCols[1].x, y, { maxWidth: sumCols[1].w })
    doc.text(s.mpn ?? "—", sumCols[2].x, y, { maxWidth: sumCols[2].w })
    doc.text(s.description ?? "—", sumCols[3].x, y, { maxWidth: sumCols[3].w })
    doc.text(s.quantity.toLocaleString(), sumCols[4].x, y)
    doc.text(String(s.reel_count), sumCols[5].x, y)
    y += 5
  }

  // ---- Reel detail ----
  newPage()
  doc.setFontSize(11)
  doc.setFont("helvetica", "bold")
  doc.text("Reel detail", m, y)
  y += 6

  const detCols = [
    { x: m, w: 32, label: "UID" },
    { x: m + 32, w: 34, label: "IPN" },
    { x: m + 66, w: 56, label: "Description" },
    { x: m + 122, w: 22, label: "Qty" },
    { x: m + 144, w: 18, label: "BIN" },
    { x: m + 162, w: 20, label: "PO Ref" },
  ]
  drawHeader(detCols)

  for (const d of report.detail) {
    if (y > pageBottom) {
      newPage()
      drawHeader(detCols)
    }
    doc.text(d.uid, detCols[0].x, y, { maxWidth: detCols[0].w })
    doc.text(d.ipn ?? "—", detCols[1].x, y, { maxWidth: detCols[1].w })
    doc.text(d.description ?? "—", detCols[2].x, y, { maxWidth: detCols[2].w })
    doc.text(d.quantity.toLocaleString(), detCols[3].x, y)
    doc.text(d.bin ?? "—", detCols[4].x, y, { maxWidth: detCols[4].w })
    doc.text(d.po_reference ?? "—", detCols[5].x, y, { maxWidth: detCols[5].w })
    y += 5
  }

  const stamp = generated.toISOString().slice(0, 10)
  doc.save(`${report.customer.code}-inventory-${stamp}.pdf`)
}
