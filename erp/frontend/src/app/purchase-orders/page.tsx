"use client"

import { PagePlaceholder } from "@/components/page-placeholder"

export default function PurchaseOrdersPage() {
  return (
    <PagePlaceholder
      title="Purchase Orders"
      description="Manage purchase orders to suppliers"
      features={[
        "Create and manage POs with line items",
        "Track PO status (Draft → Submitted → Confirmed → Received)",
        "Record receiving against PO lines",
        "View quantity on order for MRP planning",
        "Link to receiving inspection workflow",
      ]}
    />
  )
}
