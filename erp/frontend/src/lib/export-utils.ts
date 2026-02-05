import * as XLSX from "xlsx"
import type {
  EnhancedMaterialShortage,
  CustomerShortage,
  ResourceTypeShortage,
  OrderBuildability,
} from "./api"

// Helper to trigger download
function downloadWorkbook(wb: XLSX.WorkBook, filename: string) {
  const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" })
  const blob = new Blob([wbout], { type: "application/octet-stream" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// Export shortages by material
export function exportShortagesByMaterial(
  shortages: EnhancedMaterialShortage[],
  filename = "shortages-by-material.xlsx"
) {
  const wb = XLSX.utils.book_new()

  // Main shortages sheet
  const mainData = shortages.map((s) => ({
    IPN: s.material.internal_part_number,
    Description: s.material.description ?? "",
    "Qty On Hand": s.quantity_on_hand,
    "Qty Available": s.quantity_available,
    "Qty On Order": s.quantity_on_order,
    "Total Required": s.total_required,
    Shortage: s.shortage,
    "Affected Orders": s.orders.length,
    "Affected Products": s.affected_products.map((p) => p.product_name).join(", "),
  }))

  const mainSheet = XLSX.utils.json_to_sheet(mainData)
  XLSX.utils.book_append_sheet(wb, mainSheet, "Shortages")

  // Detailed orders sheet
  const detailData: Array<{
    IPN: string
    "Order #": string
    Customer: string
    Product: string
    "Due Date": string
    "Qty Required": number
    "Qty Allocated": number
  }> = []

  for (const shortage of shortages) {
    for (const order of shortage.orders) {
      detailData.push({
        IPN: shortage.material.internal_part_number,
        "Order #": order.order_number,
        Customer: order.customer_name,
        Product: order.product_name,
        "Due Date": new Date(order.due_date).toLocaleDateString(),
        "Qty Required": order.required_quantity,
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
  filename = "shortages-by-customer.xlsx"
) {
  const wb = XLSX.utils.book_new()

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
  const detailData: Array<{
    Customer: string
    "Customer Code": string
    "Order #": string
    Product: string
    "Due Date": string
    IPN: string
    Description: string
    Shortage: number
  }> = []

  for (const customer of customers) {
    for (const order of customer.orders) {
      for (const shortage of order.shortages) {
        detailData.push({
          Customer: customer.customer_name,
          "Customer Code": customer.customer_code,
          "Order #": order.order_number,
          Product: order.product_name,
          "Due Date": new Date(order.due_date).toLocaleDateString(),
          IPN: shortage.ipn,
          Description: shortage.description ?? "",
          Shortage: shortage.shortage,
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
  filename = "shortages-by-resource-type.xlsx"
) {
  const wb = XLSX.utils.book_new()

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
    const sheetData = rt.materials.map((m) => ({
      IPN: m.ipn,
      Description: m.description ?? "",
      Available: m.quantity_available,
      "On Order": m.quantity_on_order,
      Required: m.total_required,
      Shortage: m.shortage,
      "Orders Affected": m.affected_orders_count,
    }))

    const sheet = XLSX.utils.json_to_sheet(sheetData)
    // Sheet names have max 31 chars
    const sheetName = rt.resource_type.substring(0, 31)
    XLSX.utils.book_append_sheet(wb, sheet, sheetName)
  }

  downloadWorkbook(wb, filename)
}

// Export order buildability
export function exportOrderBuildability(
  orders: OrderBuildability[],
  filename = "order-buildability.xlsx"
) {
  const wb = XLSX.utils.book_new()

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
  const shortageData: Array<{
    "Order #": string
    Customer: string
    Product: string
    IPN: string
    Description: string
    Required: number
    Available: number
    "On Order": number
    "Order Shortage": number
    "Global Shortage": number
  }> = []

  for (const order of orders) {
    for (const shortage of order.critical_shortages) {
      shortageData.push({
        "Order #": order.order_number,
        Customer: order.customer_name,
        Product: order.product_name,
        IPN: shortage.ipn,
        Description: shortage.description ?? "",
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
  filename = "affected-assemblies.xlsx"
) {
  const wb = XLSX.utils.book_new()

  // Build product-centric data
  const productMap = new Map<
    string,
    {
      product_id: string
      product_name: string
      shortage_count: number
      total_shortage_qty: number
      shortages: Array<{ ipn: string; description: string | null; shortage: number }>
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
      existing.total_shortage_qty += shortage.shortage
      existing.shortages.push({
        ipn: shortage.material.internal_part_number,
        description: shortage.material.description,
        shortage: shortage.shortage,
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
  const detailData: Array<{
    Product: string
    IPN: string
    Description: string
    Shortage: number
  }> = []

  for (const product of products) {
    for (const shortage of product.shortages) {
      detailData.push({
        Product: product.product_name,
        IPN: shortage.ipn,
        Description: shortage.description ?? "",
        Shortage: shortage.shortage,
      })
    }
  }

  const detailSheet = XLSX.utils.json_to_sheet(detailData)
  XLSX.utils.book_append_sheet(wb, detailSheet, "Details")

  downloadWorkbook(wb, filename)
}
