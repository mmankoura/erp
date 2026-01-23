"use client"

import { PagePlaceholder } from "@/components/page-placeholder"

export default function MRPPage() {
  return (
    <PagePlaceholder
      title="MRP / Shortages"
      description="Material requirements planning and shortage analysis"
      features={[
        "View material requirements across all orders",
        "Identify shortages (need vs. have)",
        "Factor in quantity on order from open POs",
        "Order availability check before production",
        "Suggest purchase orders for shortages",
      ]}
    />
  )
}
