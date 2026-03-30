"use client"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { usePathname } from "next/navigation"

const pathLabels: Record<string, string> = {
  "": "Dashboard",
  "materials": "Materials",
  "products": "Products",
  "customers": "Customers",
  "suppliers": "Suppliers",
  "orders": "Customer Orders",
  "purchase-orders": "Supplier Purchase Orders",
  "inventory": "Inventory",
  "mrp": "MRP / Shortages",
  "receiving": "Receiving",
  "aml": "Approved Manufacturers",
  "audit": "Audit Log",
  "production": "WIP Tracking",
  "kitting": "Kitting",
  "cycle-counts": "Return to Stock",
  "bom": "Bill of Materials",
  "validate": "Validate",
  "users": "Users",
  "settings": "Settings",
  "new": "New",
  "edit": "Edit",
}

export function AppHeader() {
  const pathname = usePathname()
  const segments = pathname.split("/").filter(Boolean)

  // Don't show breadcrumb on dashboard
  if (segments.length === 0) return null

  return (
    <header className="flex h-10 shrink-0 items-center border-b px-4">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Home</BreadcrumbLink>
          </BreadcrumbItem>
          {segments.map((segment, index) => {
            const path = "/" + segments.slice(0, index + 1).join("/")
            const isLast = index === segments.length - 1
            const label = pathLabels[segment] || segment

            return (
              <span key={path} className="flex items-center gap-2">
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  {isLast ? (
                    <BreadcrumbPage>{label}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink href={path}>{label}</BreadcrumbLink>
                  )}
                </BreadcrumbItem>
              </span>
            )
          })}
        </BreadcrumbList>
      </Breadcrumb>
    </header>
  )
}
