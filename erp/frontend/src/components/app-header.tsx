"use client"

import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
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
  "orders": "Orders",
  "purchase-orders": "Purchase Orders",
  "inventory": "Inventory",
  "mrp": "MRP / Shortages",
  "receiving": "Receiving Inspection",
  "aml": "Approved Manufacturers",
  "audit": "Audit Log",
  "settings": "Settings",
  "new": "New",
  "edit": "Edit",
}

export function AppHeader() {
  const pathname = usePathname()
  const segments = pathname.split("/").filter(Boolean)

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />
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
