"use client"

import { PagePlaceholder } from "@/components/page-placeholder"

export default function InventoryPage() {
  return (
    <PagePlaceholder
      title="Inventory"
      description="View and manage inventory levels"
      features={[
        "View current stock levels by material",
        "Four-quantity model: On Hand, Allocated, Available, On Order",
        "Transaction history with audit trail",
        "Manual adjustments with reason tracking",
        "Bucket-based inventory (RAW, WIP, FG, IN_TRANSIT)",
      ]}
    />
  )
}
