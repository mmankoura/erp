import * as XLSX from "xlsx"

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

type Row = Array<string | number | null>

function fmtDate(d: string | null | undefined): string {
  if (!d) return ""
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? "" : dt.toLocaleDateString()
}

function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined || v === "") return 0
  const n = typeof v === "number" ? v : parseFloat(String(v))
  return isNaN(n) ? 0 : n
}

export function exportConsumableOrderToExcel(co: ConsumableOrder): void {
  const lines = co.lines ?? []
  const total = lines.reduce(
    (s, l) => s + num(l.quantity) * num(l.unit_cost),
    0,
  )

  const rows: Row[] = []

  rows.push(["CONSUMABLE ORDER", co.order_number])
  rows.push(["Status", co.status])
  rows.push([])
  rows.push(["Supplier", co.supplier])
  rows.push([])
  rows.push(["Order Date", fmtDate(co.order_date)])
  rows.push(["Expected Date", fmtDate(co.expected_date)])
  rows.push(["Currency", co.currency ?? ""])
  rows.push(["Created By", co.created_by ?? ""])
  rows.push(["Notes", co.notes ?? ""])
  rows.push([])

  rows.push([
    "Line #",
    "AT&A IPN",
    "Description",
    "Manufacturer",
    "MPN",
    "Customer",
    "Quantity",
    "Unit Cost",
    "Ext Cost",
    "Notes",
  ])

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    const qty = num(l.quantity)
    const uc = num(l.unit_cost)
    rows.push([
      l.line_number ?? i + 1,
      l.ata_part_number ?? "",
      l.description,
      l.manufacturer ?? "",
      l.manufacturer_pn ?? "",
      l.customer ?? "",
      qty,
      uc,
      qty * uc,
      l.notes ?? "",
    ])
  }

  rows.push([])
  rows.push(["", "", "", "", "", "", "", "Total", total, ""])

  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws["!cols"] = [
    { wch: 12 },
    { wch: 18 },
    { wch: 40 },
    { wch: 20 },
    { wch: 22 },
    { wch: 18 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 30 },
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Consumable Order")

  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" })
  const blob = new Blob([out], { type: "application/octet-stream" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${co.order_number}.xlsx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
