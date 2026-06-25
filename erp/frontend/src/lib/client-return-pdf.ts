import jsPDF from "jspdf"

export interface ClientReturnLine {
  uid: string
  ipn: string
  description: string | null
  qty: number
}

export interface ClientReturnReportOptions {
  returnedBy?: string
  customerName?: string
}

/**
 * Generates a printable "Material Returned to Client" report — the packing
 * slip we hand the customer for the reels removed from our inventory.
 */
export function generateClientReturnPdf(
  lines: ClientReturnLine[],
  opts: ClientReturnReportOptions = {},
): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" })
  const m = 14
  let y = m

  doc.setFontSize(16)
  doc.setFont("helvetica", "bold")
  doc.text("Material Returned to Client", m, y + 6)
  y += 14

  doc.setFontSize(9)
  doc.setFont("helvetica", "normal")
  doc.text(`Date: ${new Date().toLocaleString()}`, m, y)
  doc.text(`Returned by: ${opts.returnedBy ?? "—"}`, m + 90, y)
  y += 5
  if (opts.customerName) {
    doc.text(`Customer: ${opts.customerName}`, m, y)
    y += 5
  }
  const totalQty = lines.reduce((sum, l) => sum + l.qty, 0)
  doc.text(`Reels returned: ${lines.length}`, m, y)
  doc.text(`Total qty: ${totalQty.toLocaleString()}`, m + 90, y)
  y += 9

  // Table header
  const cols = [
    { x: m, w: 10, label: "#" },
    { x: m + 10, w: 36, label: "UID" },
    { x: m + 46, w: 40, label: "IPN" },
    { x: m + 86, w: 66, label: "Description" },
    { x: m + 152, w: 30, label: "Qty Returned" },
  ]
  doc.setFontSize(8)
  doc.setFont("helvetica", "bold")
  for (const c of cols) doc.text(c.label, c.x, y)
  y += 2
  doc.setLineWidth(0.2)
  doc.line(m, y, m + 182, y)
  y += 4
  doc.setFont("helvetica", "normal")

  lines.forEach((l, idx) => {
    if (y > 250) {
      doc.addPage()
      y = m
    }
    doc.text(String(idx + 1), cols[0].x, y)
    doc.text(l.uid, cols[1].x, y, { maxWidth: cols[1].w })
    doc.text(l.ipn, cols[2].x, y, { maxWidth: cols[2].w })
    doc.text(l.description ?? "—", cols[3].x, y, { maxWidth: cols[3].w })
    doc.text(l.qty.toLocaleString(), cols[4].x, y)
    y += 5
  })

  y += 10
  doc.line(m, y, m + 80, y)
  doc.text("Received by (client signature / date)", m, y + 4)

  const stamp = new Date().toISOString().slice(0, 10)
  doc.save(`client-return-${stamp}.pdf`)
}
