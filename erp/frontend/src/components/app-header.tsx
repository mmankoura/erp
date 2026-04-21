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
  "consumable-orders": "Consumable Orders",
  "inventory": "Inventory",
  "mrp": "MRP / Shortages",
  "receiving": "Receiving",
  "aml": "Approved Manufacturers",
  "audit": "Audit Log",
  "production": "WIP Tracking",
  "kitting": "Kitting",
  "cycle-counts": "Return to Stock",
  "return-to-stock": "Return to Stock",
  "customer-supplied": "Customer Supplied",
  "bom": "Bill of Materials",
  "validate": "Validate",
  "users": "Users",
  "settings": "Settings",
  "new": "New",
  "edit": "Edit",
}

const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)

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
            const label = pathLabels[segment] || (isUuid(segment) ? "Details" : segment)

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
