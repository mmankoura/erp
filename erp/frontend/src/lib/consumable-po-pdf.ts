import jsPDF from "jspdf"

interface ConsumableOrderLine {
  id: string
  ata_part_number: string | null
  description: string
  manufacturer: string | null
  manufacturer_pn: string | null
  quantity: number | string
  unit_cost: number | string | null
  customer: string | null
  line_number: number | null
  notes: string | null
}

interface ConsumableOrder {
  id: string
  order_number: string
  supplier: string
  status: "ORDERED" | "RECEIVED"
  order_date: string
  expected_date: string | null
  currency: string
  notes: string | null
  created_by: string | null
  lines: ConsumableOrderLine[]
}

const COMPANY = {
  address: "64 BRUNSWICK BLVD",
  city: "D.D.O. MONTREAL",
  postal: "H9B 2L3",
  tel: "TEL (514) 421-4445",
  fax: "FAX (514) 421-2355",
}

function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined || v === "") return 0
  const n = typeof v === "number" ? v : parseFloat(String(v))
  return isNaN(n) ? 0 : n
}

export async function generateConsumablePoPdf(co: ConsumableOrder): Promise<void> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" })
  const pw = doc.internal.pageSize.getWidth()
  const m = 12
  let y = m

  // ===== HEADER =====
  try {
    const logoImg = await loadImage("/Logo.png")
    doc.addImage(logoImg, "PNG", m, y, 42, 16)
  } catch {
    doc.setFontSize(16)
    doc.setFont("helvetica", "bold")
    doc.text("AT&A", m, y + 10)
  }

  const addrX = m + 46
  doc.setFontSize(7)
  doc.setFont("helvetica", "normal")
  doc.text(COMPANY.address, addrX, y + 2)
  doc.text(COMPANY.city, addrX, y + 5.5)
  doc.text(COMPANY.postal, addrX, y + 9)
  doc.text(COMPANY.tel, addrX, y + 12.5)
  doc.text(COMPANY.fax, addrX, y + 16)

  const rightBlock = pw - m - 80
  doc.setFontSize(10)
  doc.setFont("helvetica", "bold")
  doc.text("BON DE COMMANDE", rightBlock + 10, y + 3)
  doc.text("PURCHASE ORDER", rightBlock + 13, y + 7.5)

  const bx = rightBlock
  const by = y + 10
  const bw1 = 44, bw2 = 36
  doc.setLineWidth(0.3)

  doc.setFontSize(5.5)
  doc.setFont("helvetica", "bold")
  doc.rect(bx, by, bw1, 5)
  doc.text("PURCHASE", bx + 1, by + 2)
  doc.text("NUMBER", bx + 1, by + 4.5)
  doc.rect(bx + bw1, by, bw2, 5)
  doc.text("DATE:", bx + bw1 + 1, by + 2)
  doc.setFontSize(5)
  doc.text("AN/YR     MO     JR/DY", bx + bw1 + 1, by + 4.5)

  doc.rect(bx, by + 5, bw1, 7)
  doc.rect(bx + bw1, by + 5, bw2, 7)

  doc.setFontSize(10)
  doc.setFont("helvetica", "bold")
  doc.text(co.order_number, bx + 2, by + 10)

  const od = new Date(co.order_date)
  doc.setFontSize(8)
  doc.text(
    `${od.getFullYear()}     ${String(od.getMonth() + 1).padStart(2, "0")}     ${String(od.getDate()).padStart(2, "0")}`,
    bx + bw1 + 3, by + 10,
  )

  y = by + 14

  doc.setFontSize(6)
  doc.setFont("helvetica", "normal")
  doc.text("Page (1 Of 1)", pw - m - 22, y)
  y += 4

  doc.setLineWidth(0.5)
  doc.line(m, y, pw - m, y)
  y += 5

  // ===== SUPPLIER / SHIP TO / REQUESTOR =====
  const supplierStartY = y
  const midX = m + 95

  doc.setFontSize(6.5)
  doc.setFont("helvetica", "bold")
  doc.text("FOURNISSEUR/SUPPLIER", m, y)
  y += 4.5
  doc.setFontSize(9)
  doc.text(co.supplier, m, y)
  y += 4

  doc.setFontSize(6.5)
  doc.setFont("helvetica", "bold")
  doc.text("EXPEDIER A /SHIP TO", midX, supplierStartY)
  doc.setFontSize(8)
  doc.setFont("helvetica", "normal")
  doc.text("ABOVE ADDRESS", midX, supplierStartY + 4.5)

  doc.setFontSize(6.5)
  doc.setFont("helvetica", "bold")
  doc.text("DEMANDEUR /REQUESTOR:", midX, supplierStartY + 12)
  doc.setFontSize(9)
  doc.setFont("helvetica", "italic")
  doc.text(co.created_by ?? "", midX, supplierStartY + 16.5)

  y = Math.max(y, supplierStartY + 22) + 3

  // ===== TERMS ROW =====
  const tw = [38, 22, 38, 42, 28]
  const tHeaders = ["CONDITIONS\nTERMS", "FAB\nFOB", "ACHETEUR\nBUYER", "DATE DE LIVRAISON\nDELIVERY DATE", "MONNAIE\nFUNDS"]
  const ed = co.expected_date ? new Date(co.expected_date) : null
  const tValues = [
    "",
    "FOB",
    co.created_by ?? "",
    ed ? ed.toLocaleDateString() : "ASAP",
    co.currency ?? "CAD",
  ]

  let tx = m
  doc.setFontSize(5.5)
  doc.setFont("helvetica", "bold")
  for (let i = 0; i < tHeaders.length; i++) {
    doc.rect(tx, y, tw[i], 7)
    const hl = tHeaders[i].split("\n")
    doc.text(hl[0], tx + 1.5, y + 3)
    if (hl[1]) doc.text(hl[1], tx + 1.5, y + 5.5)
    tx += tw[i]
  }
  y += 7

  tx = m
  doc.setFontSize(7)
  doc.setFont("helvetica", "bold")
  for (let i = 0; i < tValues.length; i++) {
    doc.rect(tx, y, tw[i], 6)
    doc.text(tValues[i], tx + 1.5, y + 4)
    tx += tw[i]
  }
  y += 9

  // ===== LINE ITEMS =====
  const lw = [12, 28, 68, 20, 25, 25]
  const lHeaders = [
    "LIGNE\n#",
    "AT&A\nREFERENCE #",
    "DESCRIPTION DE L'ITEM\nITEM DESCRIPTION",
    "QUANTITÉ\nQUANTITY",
    "PRIX UNITAIRE\nUNIT PRICE",
    "Total Price",
  ]

  let lx = m
  doc.setFontSize(5.5)
  doc.setFont("helvetica", "bold")
  for (let i = 0; i < lHeaders.length; i++) {
    doc.rect(lx, y, lw[i], 9)
    const hl = lHeaders[i].split("\n")
    doc.text(hl[0], lx + 1.5, y + 3.5)
    if (hl[1]) doc.text(hl[1], lx + 1.5, y + 7)
    lx += lw[i]
  }
  y += 9

  const lines = co.lines ?? []
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]
    const ipn = line.ata_part_number ?? ""
    const mfg = line.manufacturer ?? ""
    const mpn = line.manufacturer_pn ?? ""
    const desc = line.description
    const cust = line.customer ?? ""
    const qty = num(line.quantity)
    const uc = num(line.unit_cost)
    const total = qty * uc

    let descText = mpn
    if (desc) descText += (descText ? "\n" : "") + desc
    if (mfg) descText += (descText ? "\n" : "") + mfg
    if (cust) descText += (descText ? "\n" : "") + `Customer: ${cust}`

    const descLines = doc.splitTextToSize(descText, lw[2] - 3)
    const rh = Math.max(10, descLines.length * 3.2 + 3)

    if (y + rh > 245) {
      doc.addPage()
      y = m
    }

    lx = m
    for (let i = 0; i < lw.length; i++) {
      doc.rect(lx, y, lw[i], rh)
      lx += lw[i]
    }

    doc.setFontSize(7)
    doc.setFont("helvetica", "normal")
    lx = m
    doc.text(String(li + 1), lx + 4, y + 5)
    lx += lw[0]
    doc.setFont("helvetica", "bold")
    doc.setFontSize(7)
    doc.text(ipn, lx + 1.5, y + 5)
    lx += lw[1]
    doc.setFont("helvetica", "normal")
    doc.setFontSize(6.5)
    doc.text(descLines, lx + 1.5, y + 4)
    lx += lw[2]
    doc.setFontSize(7)
    doc.text(String(qty), lx + 5, y + 5)
    lx += lw[3]
    doc.text(`$${uc.toFixed(2)}`, lx + 2, y + 5)
    lx += lw[4]
    doc.text(`$${total.toFixed(2)}`, lx + 2, y + 5)

    y += rh
  }

  // ===== TOTAL =====
  y += 1
  const totalAmt = lines.reduce((s, l) => s + num(l.quantity) * num(l.unit_cost), 0)
  const totalX = m + lw[0] + lw[1] + lw[2]
  doc.setFontSize(9)
  doc.setFont("helvetica", "bold")
  doc.rect(totalX, y, lw[3], 8)
  doc.text("Total", totalX + 3, y + 5.5)
  doc.rect(totalX + lw[3], y, lw[4] + lw[5], 8)
  doc.text(`$${totalAmt.toFixed(2)}`, totalX + lw[3] + 3, y + 5.5)

  // ===== SIGNATURE =====
  const sigY = doc.internal.pageSize.getHeight() - 30
  doc.setLineWidth(0.3)
  doc.line(m + 40, sigY, pw - m - 20, sigY)
  doc.setFontSize(8)
  doc.setFont("helvetica", "normal")
  doc.text("PAR/PER", m + 42, sigY + 5)
  doc.setFontSize(14)
  doc.setFont("helvetica", "bolditalic")
  doc.text(co.created_by ?? "", m + 65, sigY + 5)
  doc.setFontSize(7)
  doc.setFont("helvetica", "normal")
  doc.text("DIRECTEUR SERVICE ACHATS", pw - m - 65, sigY + 5)
  doc.text("DIRECTOR OF PURCHASES", pw - m - 65, sigY + 8.5)

  doc.setFontSize(5.5)
  doc.text("F 7.4.2-02/A", pw - m - 22, sigY + 8.5)

  doc.save(`${co.order_number}.pdf`)
}

function loadImage(src: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      const canvas = document.createElement("canvas")
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext("2d")!
      ctx.drawImage(img, 0, 0)
      resolve(canvas.toDataURL("image/png"))
    }
    img.onerror = reject
    img.src = src
  })
}
