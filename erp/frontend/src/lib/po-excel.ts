import * as XLSX from "xlsx"
import type { PurchaseOrder } from "./api"

function fmtShortDate(d: string | null | undefined): string {
  if (!d) return ""
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return ""
  const m = dt.getMonth() + 1
  const day = dt.getDate()
  const y = String(dt.getFullYear()).slice(-2)
  return `${m}/${day}/${y}`
}

function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined || v === "") return 0
  const n = typeof v === "number" ? v : parseFloat(String(v))
  return isNaN(n) ? 0 : n
}

const HEADERS = [
  "PO#",
  "DATE\n(mm/dd/yy)",
  "SUPPLIER",
  "AT&A#",
  "MFR",
  "MPN",
  "Description",
  "QTY",
  "Mounting Type",
  "Packaging",
  "Customer",
  "Unit Price",
  "VALUE\nCDN/US",
  "COMMENTS",
] as const

type Row = Array<string | number | null>

export function exportPoToExcel(po: PurchaseOrder): void {
  const rows: Row[] = [Array.from(HEADERS)]
  const lines = po.lines ?? []

  if (lines.length === 0) {
    rows.push([
      po.po_number,
      fmtShortDate(po.order_date),
      po.supplier?.name ?? "",
      "", "", "", "", "", "", "", "", "", "", "",
    ])
  } else {
    for (const line of lines) {
      const qty = num(line.quantity_ordered)
      const uc = num(line.unit_cost)
      rows.push([
        po.po_number,
        fmtShortDate(po.order_date),
        po.supplier?.name ?? "",
        line.material?.internal_part_number ?? "",
        line.manufacturer ?? line.material?.manufacturer ?? "",
        line.manufacturer_pn ?? line.material?.manufacturer_pn ?? "",
        line.material?.description ?? "",
        qty,
        line.material?.resource_type ?? "",
        line.packaging ?? "",
        line.material?.customer?.name ?? "",
        uc,
        po.currency ?? "",
        line.notes ?? "",
      ])
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(rows)

  ws["!cols"] = [
    { wch: 10 },  // PO#
    { wch: 12 },  // DATE
    { wch: 22 },  // SUPPLIER
    { wch: 14 },  // AT&A#
    { wch: 18 },  // MFR
    { wch: 22 },  // MPN
    { wch: 38 },  // Description
    { wch: 8 },   // QTY
    { wch: 14 },  // Mounting Type
    { wch: 12 },  // Packaging
    { wch: 12 },  // Customer
    { wch: 12 },  // Unit Price
    { wch: 14 },  // VALUE
    { wch: 28 },  // COMMENTS
  ]

  // Multi-line header rows
  ws["!rows"] = [{ hpt: 28 }]
  for (let c = 0; c < HEADERS.length; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c })
    const cell = ws[addr]
    if (cell) {
      cell.s = { alignment: { wrapText: true, vertical: "center" } }
    }
  }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "PO")

  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" })
  const blob = new Blob([out], { type: "application/octet-stream" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `PO# ${po.po_number}.xlsx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
