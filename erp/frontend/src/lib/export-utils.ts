import * as XLSX from "xlsx"
import type {
  EnhancedMaterialShortage,
  CustomerShortage,
  ResourceTypeShortage,
  OrderBuildability,
  KittingStockResponse,
  KittingItemWithStock,
  ApprovedManufacturer,
} from "./api"

// Helper to trigger download. Exported because the grid's own export reuses it
// rather than growing a second copy of the same few lines.
export function downloadWorkbook(wb: XLSX.WorkBook, filename: string) {
  const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" })
  downloadBlob(new Blob([wbout], { type: "application/octet-stream" }), filename)
}

/** The download gesture on its own, so CSV doesn't have to go through a workbook. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// Build AML lookup: material_id → approved manufacturers
function buildAmlMap(amlEntries?: ApprovedManufacturer[]): Map<string, ApprovedManufacturer[]> {
  const map = new Map<string, ApprovedManufacturer[]>()
  if (!amlEntries) return map
  for (const entry of amlEntries) {
    if (entry.status !== "APPROVED") continue
    const existing = map.get(entry.material_id) ?? []
    existing.push(entry)
    map.set(entry.material_id, existing)
  }
  return map
}

// Export shortages by material
export function exportShortagesByMaterial(
  shortages: EnhancedMaterialShortage[],
  filename = "shortages-by-material.xlsx",
  amlEntries?: ApprovedManufacturer[],
) {
  const wb = XLSX.utils.book_new()
  const amlMap = buildAmlMap(amlEntries)

  // Main shortages sheet
  const mainData = shortages.map((s) => {
    const amls = amlMap.get(s.material_id) ?? []
    return {
      IPN: s.material.internal_part_number,
      Description: s.material.description ?? "",
      "Approved MFG": amls.map((a) => a.manufacturer).join(", ") || s.material.manufacturer || "",
      "Approved MPN": amls.map((a) => a.manufacturer_part_number).join(", ") || s.material.manufacturer_pn || "",
      "Qty On Hand": s.quantity_on_hand,
      "Qty Available": s.quantity_available,
      "Qty On Order": s.quantity_on_order,
      "Total Required": s.total_required,
      Shortage: s.shortage,
      Status: s.use_alternates ? "Use Alternate" : s.shortage > 0 ? "Short" : "",
      "Alternate IPN": s.alternates?.map((a) => a.ipn).join(", ") ?? "",
      "Alt On Hand": s.alternates?.map((a) => `${a.ipn}: ${a.quantity_on_hand}`).join(", ") ?? "",
      "Alt Qty to Use": s.alternates?.map((a) => `${a.ipn}: ${a.quantity_to_use}`).join(", ") ?? "",
      "Affected Orders": s.orders.length,
      "Affected Products": s.affected_products.map((p) => p.product_name).join(", "),
    }
  })

  const mainSheet = XLSX.utils.json_to_sheet(mainData)
  XLSX.utils.book_append_sheet(wb, mainSheet, "Shortages")

  // Detailed orders sheet
  const detailData: Array<Record<string, unknown>> = []

  for (const shortage of shortages) {
    const amls = amlMap.get(shortage.material_id) ?? []
    for (const order of shortage.orders) {
      detailData.push({
        IPN: shortage.material.internal_part_number,
        "Approved MFG": amls.map((a) => a.manufacturer).join(", ") || shortage.material.manufacturer || "",
        "Approved MPN": amls.map((a) => a.manufacturer_part_number).join(", ") || shortage.material.manufacturer_pn || "",
        "Order #": order.order_number,
        Customer: order.customer_name,
        Product: order.product_name,
        "Due Date": new Date(order.due_date).toLocaleDateString(),
        "Qty (Order)": order.required_quantity,
        "Qty (All Orders)": shortage.total_required,
        "Qty Allocated": order.allocated_quantity,
      })
    }
  }

  const detailSheet = XLSX.utils.json_to_sheet(detailData)
  XLSX.utils.book_append_sheet(wb, detailSheet, "Order Details")

  downloadWorkbook(wb, filename)
}

// Export shortages by customer
export function exportShortagesByCustomer(
  customers: CustomerShortage[],
  filename = "shortages-by-customer.xlsx",
  amlEntries?: ApprovedManufacturer[],
) {
  const wb = XLSX.utils.book_new()
  const amlMap = buildAmlMap(amlEntries)

  // Summary sheet
  const summaryData = customers.map((c) => ({
    Customer: c.customer_name,
    "Customer Code": c.customer_code,
    "Orders Affected": c.total_orders_affected,
    "Shortage Items": c.total_shortage_items,
  }))

  const summarySheet = XLSX.utils.json_to_sheet(summaryData)
  XLSX.utils.book_append_sheet(wb, summarySheet, "Summary")

  // Detailed sheet
  const detailData: Array<Record<string, unknown>> = []

  for (const customer of customers) {
    for (const order of customer.orders) {
      for (const shortage of order.shortages) {
        const amls = amlMap.get(shortage.material_id) ?? []
        detailData.push({
          Customer: customer.customer_name,
          "Customer Code": customer.customer_code,
          "Order #": order.order_number,
          Product: order.product_name,
          "Due Date": new Date(order.due_date).toLocaleDateString(),
          IPN: shortage.ipn,
          Description: shortage.description ?? "",
          "Approved MFG": amls.map((a) => a.manufacturer).join(", "),
          "Approved MPN": amls.map((a) => a.manufacturer_part_number).join(", "),
          "Qty (Order)": shortage.required_quantity,
          "Qty (All Orders)": shortage.total_required,
        })
      }
    }
  }

  const detailSheet = XLSX.utils.json_to_sheet(detailData)
  XLSX.utils.book_append_sheet(wb, detailSheet, "Details")

  downloadWorkbook(wb, filename)
}

// Export shortages by resource type
export function exportShortagesByResourceType(
  resourceTypes: ResourceTypeShortage[],
  filename = "shortages-by-resource-type.xlsx",
  amlEntries?: ApprovedManufacturer[],
) {
  const wb = XLSX.utils.book_new()
  const amlMap = buildAmlMap(amlEntries)

  // Summary sheet
  const summaryData = resourceTypes.map((rt) => ({
    "Resource Type": rt.resource_type,
    "Materials Short": rt.total_materials_short,
    "Total Shortage Qty": rt.total_shortage_quantity,
  }))

  const summarySheet = XLSX.utils.json_to_sheet(summaryData)
  XLSX.utils.book_append_sheet(wb, summarySheet, "Summary")

  // Create a sheet per resource type
  for (const rt of resourceTypes) {
    const sheetData = rt.materials.map((m) => {
      const amls = amlMap.get(m.material_id) ?? []
      return {
        IPN: m.ipn,
        Description: m.description ?? "",
        "Approved MFG": amls.map((a) => a.manufacturer).join(", "),
        "Approved MPN": amls.map((a) => a.manufacturer_part_number).join(", "),
        Available: m.quantity_available,
        "On Order": m.quantity_on_order,
        Required: m.total_required,
        Shortage: m.shortage,
        "Orders Affected": m.affected_orders_count,
      }
    })

    const sheet = XLSX.utils.json_to_sheet(sheetData)
    const sheetName = rt.resource_type.substring(0, 31)
    XLSX.utils.book_append_sheet(wb, sheet, sheetName)
  }

  downloadWorkbook(wb, filename)
}

// Export order buildability
export function exportOrderBuildability(
  orders: OrderBuildability[],
  filename = "order-buildability.xlsx",
  amlEntries?: ApprovedManufacturer[],
) {
  const wb = XLSX.utils.book_new()
  const amlMap = buildAmlMap(amlEntries)

  // Main orders sheet
  const mainData = orders.map((o) => ({
    "Order #": o.order_number,
    Customer: o.customer_name,
    Product: o.product_name,
    "Due Date": new Date(o.due_date).toLocaleDateString(),
    Quantity: o.quantity,
    Status: o.status,
    "Materials Ready": o.materials_ready,
    "Materials Short": o.materials_short,
    "Total Materials": o.materials_total,
    "Completion %": Math.round((o.materials_ready / o.materials_total) * 100),
  }))

  const mainSheet = XLSX.utils.json_to_sheet(mainData)
  XLSX.utils.book_append_sheet(wb, mainSheet, "Orders")

  // Critical shortages sheet
  const shortageData: Array<Record<string, unknown>> = []

  for (const order of orders) {
    for (const shortage of order.critical_shortages) {
      const amls = amlMap.get(shortage.material_id) ?? []
      shortageData.push({
        "Order #": order.order_number,
        Customer: order.customer_name,
        Product: order.product_name,
        IPN: shortage.ipn,
        Description: shortage.description ?? "",
        "Approved MFG": amls.map((a) => a.manufacturer).join(", "),
        "Approved MPN": amls.map((a) => a.manufacturer_part_number).join(", "),
        Required: shortage.required,
        Available: shortage.available,
        "On Order": shortage.on_order,
        "Order Shortage": shortage.shortage,
        "Global Shortage": shortage.global_shortage,
      })
    }
  }

  if (shortageData.length > 0) {
    const shortageSheet = XLSX.utils.json_to_sheet(shortageData)
    XLSX.utils.book_append_sheet(wb, shortageSheet, "Critical Shortages")
  }

  downloadWorkbook(wb, filename)
}

// Export affected assemblies
export function exportAffectedAssemblies(
  shortages: EnhancedMaterialShortage[],
  filename = "affected-assemblies.xlsx",
  amlEntries?: ApprovedManufacturer[],
) {
  const wb = XLSX.utils.book_new()
  const amlMap = buildAmlMap(amlEntries)

  // Build product-centric data
  const productMap = new Map<
    string,
    {
      product_id: string
      product_name: string
      shortage_count: number
      total_shortage_qty: number
      shortages: Array<{ material_id: string; ipn: string; description: string | null; quantity_required: number; total_required: number }>
    }
  >()

  for (const shortage of shortages) {
    for (const product of shortage.affected_products) {
      let existing = productMap.get(product.product_id)
      if (!existing) {
        existing = {
          product_id: product.product_id,
          product_name: product.product_name,
          shortage_count: 0,
          total_shortage_qty: 0,
          shortages: [],
        }
        productMap.set(product.product_id, existing)
      }
      existing.shortage_count++
      existing.total_shortage_qty += product.quantity_required
      existing.shortages.push({
        material_id: shortage.material_id,
        ipn: shortage.material.internal_part_number,
        description: shortage.material.description,
        quantity_required: product.quantity_required,
        total_required: shortage.total_required,
      })
    }
  }

  const products = Array.from(productMap.values())
  products.sort((a, b) => b.shortage_count - a.shortage_count)

  // Summary sheet
  const summaryData = products.map((p) => ({
    Product: p.product_name,
    "Short Items": p.shortage_count,
    "Total Shortage Qty": p.total_shortage_qty,
  }))

  const summarySheet = XLSX.utils.json_to_sheet(summaryData)
  XLSX.utils.book_append_sheet(wb, summarySheet, "Summary")

  // Detailed sheet
  const detailData: Array<Record<string, unknown>> = []

  for (const product of products) {
    for (const shortage of product.shortages) {
      const amls = amlMap.get(shortage.material_id) ?? []
      detailData.push({
        Product: product.product_name,
        IPN: shortage.ipn,
        Description: shortage.description ?? "",
        "Approved MFG": amls.map((a) => a.manufacturer).join(", "),
        "Approved MPN": amls.map((a) => a.manufacturer_part_number).join(", "),
        "Qty (Product)": shortage.quantity_required,
        "Qty (All Orders)": shortage.total_required,
      })
    }
  }

  const detailSheet = XLSX.utils.json_to_sheet(detailData)
  XLSX.utils.book_append_sheet(wb, detailSheet, "Details")

  downloadWorkbook(wb, filename)
}

// Export kitting list
export function exportKittingList(
  stockData: KittingStockResponse,
  filename?: string
) {
  const kit = stockData.kitting_list
  const allItems = [
    ...stockData.smt_items,
    ...stockData.th_items,
    ...stockData.other_items,
  ]

  const wb = XLSX.utils.book_new()
  const fname = filename ?? `kitting-${kit.list_number}.xlsx`

  // Orders sheet
  const ordersData = kit.orders.map((o) => ({
    "Order #": o.order?.order_number ?? "",
    Customer: o.order?.customer?.name ?? "",
    Product: o.order?.product?.name ?? "",
    "Order Qty": o.order_quantity,
    "Due Date": o.order?.due_date ? new Date(o.order.due_date).toLocaleDateString() : "",
    Status: o.order?.status ?? "",
  }))

  const ordersSheet = XLSX.utils.json_to_sheet(ordersData)
  XLSX.utils.book_append_sheet(wb, ordersSheet, "Orders")

  // Materials sheet (all items)
  const materialsData = allItems.map((item) => ({
    IPN: item.material?.internal_part_number ?? "",
    MPN: item.material?.manufacturer_pn ?? "",
    Description: item.material?.description ?? "",
    "Resource Type": item.resource_type ?? "",
    "Qty Required": Math.ceil(item.total_qty_required),
    "Qty On Hand": item.quantity_on_hand,
    "Pick Instruction": item.use_alternate
      ? item.alternates?.map((a) => `USE: ${a.ipn} (${a.use_quantity} pcs)`).join(", ") ?? ""
      : "",
    "Qty Verified": item.qty_verified,
    Short: item.is_short ? item.shortage_qty : 0,
    Status: item.qty_verified >= item.total_qty_required
      ? "OK"
      : item.qty_verified > 0
        ? "Partial"
        : item.is_short
          ? "Short"
          : "Pending",
    Locations: item.uid_locations?.map((l) => `${l.uid} (${l.quantity} @ ${l.location})`).join(", ") ?? "",
  }))

  const materialsSheet = XLSX.utils.json_to_sheet(materialsData)
  XLSX.utils.book_append_sheet(wb, materialsSheet, "Materials")

  // SMT sheet
  if (stockData.smt_items.length > 0) {
    const smtSheet = XLSX.utils.json_to_sheet(
      formatKittingItemsForSheet(stockData.smt_items)
    )
    XLSX.utils.book_append_sheet(wb, smtSheet, "SMT")
  }

  // TH sheet
  if (stockData.th_items.length > 0) {
    const thSheet = XLSX.utils.json_to_sheet(
      formatKittingItemsForSheet(stockData.th_items)
    )
    XLSX.utils.book_append_sheet(wb, thSheet, "TH")
  }

  // Other sheet
  if (stockData.other_items.length > 0) {
    const otherSheet = XLSX.utils.json_to_sheet(
      formatKittingItemsForSheet(stockData.other_items)
    )
    XLSX.utils.book_append_sheet(wb, otherSheet, "Other")
  }

  // Scanned UIDs sheet
  const scanData: Array<Record<string, unknown>> = []
  for (const item of allItems) {
    if (item.scans && item.scans.length > 0) {
      for (const scan of item.scans) {
        scanData.push({
          IPN: item.material?.internal_part_number ?? "",
          UID: scan.uid_code,
          Quantity: scan.quantity,
          "Scanned By": scan.scanned_by ?? "",
          "Scanned At": scan.created_at ? new Date(scan.created_at).toLocaleString() : "",
        })
      }
    }
  }
  if (scanData.length > 0) {
    const scanSheet = XLSX.utils.json_to_sheet(scanData)
    XLSX.utils.book_append_sheet(wb, scanSheet, "Scanned UIDs")
  }

  downloadWorkbook(wb, fname)
}

function formatKittingItemsForSheet(items: KittingItemWithStock[]) {
  return items.map((item) => ({
    IPN: item.material?.internal_part_number ?? "",
    MPN: item.material?.manufacturer_pn ?? "",
    Description: item.material?.description ?? "",
    "Qty Required": Math.ceil(item.total_qty_required),
    "Qty On Hand": item.quantity_on_hand,
    "Pick Instruction": item.use_alternate
      ? item.alternates?.map((a) => `USE: ${a.ipn} (${a.use_quantity} pcs)`).join(", ") ?? ""
      : "",
    "Qty Verified": item.qty_verified,
    Short: item.is_short ? item.shortage_qty : 0,
    Locations: item.uid_locations?.map((l) => `${l.uid} (${l.quantity} @ ${l.location})`).join(", ") ?? "",
  }))
}
