"use client"

import { useState, useCallback } from "react"
import { useApi } from "@/hooks/use-api"
import {
  type MrpShortage,
  type MrpRequirement,
  type MrpShortagesResponse,
  type MrpRequirementsResponse,
  type EnhancedShortageReport,
  type ShortagesByCustomerResponse,
  type ShortagesByResourceTypeResponse,
  type OrderBuildabilityResponse,
} from "@/lib/api"
import { DataTable, type Column } from "@/components/data-table"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  AlertTriangle,
  Package,
  TrendingDown,
  Truck,
  CheckCircle,
} from "lucide-react"
import {
  ShortageReportToolbar,
  ShortageByCustomer,
  ShortageByResourceType,
  OrderBuildability,
  AffectedAssemblies,
  type ShortageView,
} from "@/components/shortage-reports"
import {
  exportShortagesByMaterial,
  exportShortagesByCustomer,
  exportShortagesByResourceType,
  exportOrderBuildability,
  exportAffectedAssemblies,
} from "@/lib/export-utils"

// Extended type with id for table keys
type MrpShortageWithId = MrpShortage & { id: string }
type MrpRequirementWithId = MrpRequirement & { id: string }

// Helper function to compute severity
function getSeverity(shortage: number, totalRequired: number) {
  const severityPercent = (Math.abs(shortage) / totalRequired) * 100
  if (severityPercent > 50) return "critical"
  if (severityPercent > 25) return "warning"
  return "low"
}

// Column definitions for Shortages table
const shortagesColumns: Column<MrpShortageWithId>[] = [
  {
    key: "material",
    header: "Material",
    defaultWidth: 250,
    cell: (item) => (
      <div>
        <span className="font-medium">
          {item.material.internal_part_number}
        </span>
        {item.material.description && (
          <p className="text-xs text-muted-foreground truncate max-w-[200px]">
            {item.material.description}
          </p>
        )}
      </div>
    ),
  },
  {
    key: "total_required",
    header: "Required",
    defaultWidth: 100,
    className: "text-right",
    cell: (item) => (
      <span className="font-mono">{item.total_required.toLocaleString()}</span>
    ),
  },
  {
    key: "quantity_available",
    header: "Available",
    defaultWidth: 100,
    className: "text-right",
    cell: (item) => (
      <span className="font-mono">{item.quantity_available.toLocaleString()}</span>
    ),
  },
  {
    key: "quantity_on_order",
    header: "On Order",
    defaultWidth: 100,
    className: "text-right",
    cell: (item) => (
      <span className="font-mono text-blue-600">{item.quantity_on_order.toLocaleString()}</span>
    ),
  },
  {
    key: "shortage",
    header: "Shortage",
    defaultWidth: 100,
    className: "text-right",
    cell: (item) => (
      <span className="font-mono font-bold text-red-600">
        {Math.abs(item.shortage).toLocaleString()}
      </span>
    ),
  },
  {
    key: "status",
    header: "Status",
    defaultWidth: 100,
    resizable: false,
    cell: (item) => {
      const severity = getSeverity(item.shortage, item.total_required)
      return (
        <Badge
          variant={
            severity === "critical"
              ? "destructive"
              : severity === "warning"
                ? "outline"
                : "secondary"
          }
        >
          {severity === "critical"
            ? "Critical"
            : severity === "warning"
              ? "Warning"
              : "Low"}
        </Badge>
      )
    },
  },
]

// Column definitions for Requirements table
const requirementsColumns: Column<MrpRequirementWithId>[] = [
  {
    key: "material",
    header: "Material",
    defaultWidth: 250,
    cell: (item) => (
      <div>
        <span className="font-medium">
          {item.material.internal_part_number}
        </span>
        {item.material.description && (
          <p className="text-xs text-muted-foreground truncate max-w-[200px]">
            {item.material.description}
          </p>
        )}
      </div>
    ),
  },
  {
    key: "total_required",
    header: "Required",
    defaultWidth: 100,
    className: "text-right",
    cell: (item) => (
      <span className="font-mono">{item.total_required.toLocaleString()}</span>
    ),
  },
  {
    key: "quantity_on_hand",
    header: "On Hand",
    defaultWidth: 100,
    className: "text-right",
    cell: (item) => (
      <span className="font-mono">{item.quantity_on_hand.toLocaleString()}</span>
    ),
  },
  {
    key: "quantity_allocated",
    header: "Allocated",
    defaultWidth: 100,
    className: "text-right",
    cell: (item) => (
      <span className="font-mono text-yellow-600">{item.quantity_allocated.toLocaleString()}</span>
    ),
  },
  {
    key: "quantity_available",
    header: "Available",
    defaultWidth: 100,
    className: "text-right",
    cell: (item) => (
      <span className="font-mono text-green-600">{item.quantity_available.toLocaleString()}</span>
    ),
  },
  {
    key: "quantity_on_order",
    header: "On Order",
    defaultWidth: 100,
    className: "text-right",
    cell: (item) => (
      <span className="font-mono text-blue-600">{item.quantity_on_order.toLocaleString()}</span>
    ),
  },
  {
    key: "net_requirement",
    header: "Net Need",
    defaultWidth: 100,
    className: "text-right",
    cell: (item) => {
      const hasShortage = item.net_requirement > 0
      return (
        <span className={`font-mono font-medium ${hasShortage ? "text-red-600" : "text-green-600"}`}>
          {hasShortage ? item.net_requirement.toLocaleString() : "0"}
        </span>
      )
    },
  },
  {
    key: "status",
    header: "Status",
    defaultWidth: 100,
    resizable: false,
    cell: (item) => {
      const isCovered = item.quantity_available + item.quantity_on_order >= item.total_required
      return isCovered ? (
        <Badge variant="outline" className="text-green-600 border-green-600">
          <CheckCircle className="h-3 w-3 mr-1" />
          Covered
        </Badge>
      ) : (
        <Badge variant="destructive">
          <AlertTriangle className="h-3 w-3 mr-1" />
          Short
        </Badge>
      )
    },
  },
]

export default function MRPPage() {
  const [shortageView, setShortageView] = useState<ShortageView>("by-material")
  const [isExporting, setIsExporting] = useState(false)

  // Basic shortages/requirements data
  const { data: shortagesResponse, isLoading: shortagesLoading } =
    useApi<MrpShortagesResponse>("/mrp/shortages")
  const { data: requirementsResponse, isLoading: requirementsLoading } =
    useApi<MrpRequirementsResponse>("/mrp/requirements")

  // Enhanced shortage data for different views
  const { data: enhancedShortagesResponse, isLoading: enhancedLoading } =
    useApi<EnhancedShortageReport>("/mrp/shortages/enhanced")
  const { data: byCustomerResponse, isLoading: byCustomerLoading } =
    useApi<ShortagesByCustomerResponse>("/mrp/shortages/by-customer")
  const { data: byResourceTypeResponse, isLoading: byResourceTypeLoading } =
    useApi<ShortagesByResourceTypeResponse>("/mrp/shortages/by-resource-type")
  const { data: buildabilityResponse, isLoading: buildabilityLoading } =
    useApi<OrderBuildabilityResponse>("/mrp/orders/buildability")

  // Extract arrays from wrapper responses
  const shortagesRaw = shortagesResponse?.shortages || null
  const requirementsRaw = requirementsResponse?.materials || null

  // Transform to add id fields
  const shortages: MrpShortageWithId[] | null = shortagesRaw
    ? shortagesRaw.map((item) => ({ ...item, id: item.material_id }))
    : null

  const requirements: MrpRequirementWithId[] | null = requirementsRaw
    ? requirementsRaw.map((item) => ({ ...item, id: item.material_id }))
    : null

  // Calculate summary stats
  const totalShortages = shortages?.length || 0
  const totalShortageQty =
    shortages?.reduce((sum, item) => sum + Math.abs(item.shortage), 0) || 0
  const totalRequired =
    requirements?.reduce((sum, item) => sum + item.total_required, 0) || 0
  const totalOnOrder =
    requirements?.reduce((sum, item) => sum + item.quantity_on_order, 0) || 0

  const isLoading = shortagesLoading || requirementsLoading

  // Handle print
  const handlePrint = useCallback(() => {
    window.print()
  }, [])

  // Handle export based on current view
  const handleExport = useCallback(() => {
    setIsExporting(true)
    try {
      const timestamp = new Date().toISOString().split("T")[0]
      switch (shortageView) {
        case "by-material":
          if (enhancedShortagesResponse?.shortages) {
            exportShortagesByMaterial(
              enhancedShortagesResponse.shortages,
              `shortages-by-material-${timestamp}.xlsx`
            )
          }
          break
        case "by-customer":
          if (byCustomerResponse?.customers) {
            exportShortagesByCustomer(
              byCustomerResponse.customers,
              `shortages-by-customer-${timestamp}.xlsx`
            )
          }
          break
        case "by-resource-type":
          if (byResourceTypeResponse?.resource_types) {
            exportShortagesByResourceType(
              byResourceTypeResponse.resource_types,
              `shortages-by-part-type-${timestamp}.xlsx`
            )
          }
          break
        case "order-buildability":
          if (buildabilityResponse?.orders) {
            exportOrderBuildability(
              buildabilityResponse.orders,
              `order-buildability-${timestamp}.xlsx`
            )
          }
          break
        case "affected-assemblies":
          if (enhancedShortagesResponse?.shortages) {
            exportAffectedAssemblies(
              enhancedShortagesResponse.shortages,
              `affected-assemblies-${timestamp}.xlsx`
            )
          }
          break
      }
    } finally {
      setIsExporting(false)
    }
  }, [shortageView, enhancedShortagesResponse, byCustomerResponse, byResourceTypeResponse, buildabilityResponse])

  // Render the appropriate view
  const renderShortageView = () => {
    switch (shortageView) {
      case "by-material":
        return shortages && shortages.length > 0 ? (
          <DataTable
            data={shortages}
            columns={shortagesColumns}
            isLoading={shortagesLoading}
            emptyMessage="No shortages found"
            storageKey="mrp-shortages"
          />
        ) : shortagesLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <p className="text-lg font-medium text-green-600">No Shortages</p>
            <p className="text-muted-foreground">
              All material requirements can be fulfilled with current stock and open POs.
            </p>
          </div>
        )

      case "by-customer":
        return (
          <ShortageByCustomer
            customers={byCustomerResponse?.customers ?? null}
            isLoading={byCustomerLoading}
          />
        )

      case "by-resource-type":
        return (
          <ShortageByResourceType
            resourceTypes={byResourceTypeResponse?.resource_types ?? null}
            isLoading={byResourceTypeLoading}
          />
        )

      case "order-buildability":
        return (
          <OrderBuildability
            data={buildabilityResponse ?? null}
            isLoading={buildabilityLoading}
          />
        )

      case "affected-assemblies":
        return (
          <AffectedAssemblies
            shortages={enhancedShortagesResponse?.shortages ?? null}
            isLoading={enhancedLoading}
          />
        )

      default:
        return null
    }
  }

  return (
    <div className="space-y-6">
      {/* Print-only header */}
      <div className="hidden print:block print:mb-4">
        <h1 className="text-2xl font-bold">MRP Shortage Report</h1>
        <p className="text-sm text-muted-foreground">
          Generated: {new Date().toLocaleString()}
        </p>
      </div>

      <div className="print:hidden">
        <h1 className="text-3xl font-bold tracking-tight">MRP / Shortages</h1>
        <p className="text-muted-foreground">
          Material requirements planning and shortage analysis
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4 print:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Required</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-2xl font-bold">{totalRequired.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">units across all orders</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">On Order</CardTitle>
            <Truck className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-2xl font-bold text-blue-600">
                  {totalOnOrder.toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground">from open purchase orders</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Materials Short</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-2xl font-bold text-red-600">{totalShortages}</div>
                <p className="text-xs text-muted-foreground">items with shortages</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Shortage Qty</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-2xl font-bold text-red-600">
                  {totalShortageQty.toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground">total units short</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="shortages" className="space-y-4">
        <TabsList className="print:hidden">
          <TabsTrigger value="shortages" className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Shortages
            {totalShortages > 0 && (
              <Badge variant="destructive" className="ml-1">
                {totalShortages}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="requirements">All Requirements</TabsTrigger>
        </TabsList>

        <TabsContent value="shortages" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-red-500" />
                    Material Shortages
                  </CardTitle>
                  <CardDescription>
                    Materials where required quantity exceeds available + on order
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <ShortageReportToolbar
                currentView={shortageView}
                onViewChange={setShortageView}
                onPrint={handlePrint}
                onExport={handleExport}
                isExporting={isExporting}
              />
              {renderShortageView()}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="requirements" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>All Material Requirements</CardTitle>
              <CardDescription>
                Summary of requirements across all active orders (PENDING, CONFIRMED, IN_PRODUCTION)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {requirements && requirements.length > 0 ? (
                <DataTable
                  data={requirements}
                  columns={requirementsColumns}
                  isLoading={requirementsLoading}
                  emptyMessage="No material requirements found. No active orders require materials."
                  storageKey="mrp-requirements"
                />
              ) : requirementsLoading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">
                  No material requirements found. No active orders require materials.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Print Styles */}
      <style jsx global>{`
        @media print {
          /* Hide non-essential elements */
          nav, header, .print\\:hidden, button, [data-radix-collection-item] {
            display: none !important;
          }

          /* Show print-only elements */
          .print\\:block {
            display: block !important;
          }

          /* Page setup */
          @page {
            size: landscape;
            margin: 0.5in;
          }

          body {
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }

          /* Prevent breaking inside cards */
          .print\\:break-inside-avoid {
            break-inside: avoid;
          }

          /* Ensure tables print correctly */
          table {
            border-collapse: collapse;
          }

          th, td {
            border: 1px solid #ddd;
            padding: 4px 8px;
          }

          /* Adjust card styles for print */
          [class*="Card"] {
            border: 1px solid #ddd;
            box-shadow: none;
            margin-bottom: 1rem;
          }
        }
      `}</style>
    </div>
  )
}
