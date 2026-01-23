"use client"

import { PagePlaceholder } from "@/components/page-placeholder"

export default function AMLPage() {
  return (
    <PagePlaceholder
      title="Approved Manufacturer List"
      description="Manage approved manufacturer/MPN combinations per material"
      features={[
        "Link manufacturer part numbers to internal materials",
        "Status workflow: Pending → Approved → Suspended → Obsolete",
        "Validate received parts against AML",
        "Track approval history",
        "Bulk import/export capabilities",
      ]}
    />
  )
}
