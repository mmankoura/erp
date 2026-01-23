"use client"

import { PagePlaceholder } from "@/components/page-placeholder"

export default function ReceivingPage() {
  return (
    <PagePlaceholder
      title="Receiving Inspection"
      description="Validate received items before moving to inventory"
      features={[
        "Inspect items received against POs",
        "Validate IPN matches material",
        "Validate MPN against Approved Manufacturer List (AML)",
        "Document quantity variances",
        "Approve, reject, or hold items",
        "Release approved items to inventory",
      ]}
    />
  )
}
