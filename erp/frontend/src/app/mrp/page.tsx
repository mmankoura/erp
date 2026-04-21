"use client"

import { useState, useCallback, useMemo } from "react"
import { useApi } from "@/hooks/use-api"
import {
  type MrpShortage,
  type MrpRequirement,
  type MrpShortagesResponse,
  type MrpRequirementsResponse,
  type EnhancedShortageReport,
  type EnhancedMaterialShortage,
  type ShortagesByCustomerResponse,
  type ShortagesByResourceTypeResponse,
  type OrderBuildabilityResponse,
  type ApprovedManufacturer,
} from "@/lib/api"
import { DataTable, type Column } from "@/components/data-table"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
type EnhancedShortageWithId = EnhancedMaterialShortage & { id: string }
type MrpRequirementWithId = MrpRequirement & { id: string }

// Helper function to compute severity
function getSeverity(shortage: number, totalRequired: number) {
  const severityPercent = (Math.abs(shortage) / totalRequired) * 100
  if (severityPercent > 50) return "critical"
  if (severityPercent > 25) return "warning"
  return "low"
}

// Search filter for shortages table
function shortagesSearchFilter(item: EnhancedShortageWithId, search: string): boolean {
  const q = search.toLowerCase()
  return (
    item.material.internal_part_number.toLowerCase().includes(q) ||
    (item.material.description || "").toLowerCase().includes(q) ||
    item.total_required.toString().includes(q) ||
    item.quantity_on_hand.toString().includes(q) ||
    item.quantity_available.toString().includes(q) ||
    item.quantity_on_order.toString().includes(q) ||
    Math.abs(item.shortage).toString().includes(q) ||
    (item.alternates ?? []).some((a) => a.ipn.toLowerCase().includes(q))
  )
}

// Search filter for requirements table
function requirementsSearchFilter(item: MrpRequirementWithId, search: string): boolean {
  const q = search.toLowerCase()
  return (
    item.material.internal_part_number.toLowerCase().includes(q) ||
    (item.material.description || "").toLowerCase().includes(q) ||
    item.total_required.toString().includes(q) ||
    item.quantity_on_hand.toString().includes(q) ||
    item.quantity_allocated.toString().includes(q) ||
    item.quantity_available.toString().includes(q) ||
    item.quantity_on_order.toString().includes(q) ||
    item.net_requirement.toString().includes(q)
  )
}

// Column definitions for Shortages table
const shortagesColumns: Column<EnhancedShortageWithId>[] = [
  {
    key: "material",
    header: "Material",
    defaultWidth: 250,
    sortable: true,
    filterable: true,
    sortAccessor: (item) => item.material.internal_part_number,
    filterAccessor: (item) => item.material.internal_part_number,
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
    sortable: true,
    filterable: true,
    sortAccessor: (item) => item.total_required,
    filterAccessor: (item) => item.total_required.toLocaleString(),
    cell: (item) => (
      <span className="font-mono">{item.total_required.toLocaleString()}</span>
    ),
  },
  {
    key: "quantity_on_hand",
    header: "On Hand",
    defaultWidth: 100,
    className: "text-right",
    sortable: true,
    filterable: true,
    sortAccessor: (item) => item.quantity_on_hand,
    filterAccessor: (item) => item.quantity_on_hand.toLocaleString(),
    cell: (item) => (
      <span className="font-mono">{item.quantity_on_hand.toLocaleString()}</span>
    ),
  },
  {
    key: "quantity_available",
    header: "Available",
    defaultWidth: 100,
    className: "text-right",
    sortable: true,
    filterable: true,
    sortAccessor: (item) => item.quantity_available,
    filterAccessor: (item) => item.quantity_available.toLocaleString(),
    cell: (item) => (
      <span className="font-mono">{item.quantity_available.toLocaleString()}</span>
    ),
  },
  {
    key: "quantity_on_order",
    header: "On Order",
    defaultWidth: 100,
    className: "text-right",
    sortable: true,
    filterable: true,
    sortAccessor: (item) => item.quantity_on_order,
    filterAccessor: (item) => item.quantity_on_order.toLocaleString(),
    cell: (item) => (
      <span className="font-mono text-blue-600">{item.quantity_on_order.toLocaleString()}</span>
    ),
  },
  {
    key: "shortage",
    header: "Shortage",
    defaultWidth: 100,
    className: "text-right",
    sortable: true,
    filterable: true,
    sortAccessor: (item) => Math.abs(item.shortage),
    filterAccessor: (item) => Math.abs(item.shortage).toLocaleString(),
    cell: (item) => (
      <span className="font-mono font-bold text-red-600">
        {Math.abs(item.shortage).toLocaleString()}
      </span>
    ),
  },
  {
    key: "status",
    header: "Status",
    defaultWidth: 120,
    resizable: false,
    sortable: true,
    filterable: true,
    sortAccessor: (item) => {
      if (item.use_alternates && item.shortage === 0) return 3
      const severity = getSeverity(item.shortage, item.total_required)
      return severity === "critical" ? 0 : severity === "warning" ? 1 : 2
    },
    filterAccessor: (item) => {
      if (item.use_alternates && item.shortage === 0) return "Use Alternate"
      const severity = getSeverity(item.shortage, item.total_required)
      return severity === "critical" ? "Critical" : severity === "warning" ? "Warning" : "Low"
    },
    cell: (item) => {
      if (item.use_alternates && item.shortage === 0) {
        return <Badge className="bg-amber-100 text-amber-800 border-amber-200">Use Alternate</Badge>
      }
      if (item.use_alternates && item.shortage > 0) {
        return <Badge className="bg-orange-100 text-orange-800 border-orange-200">Partial Alt</Badge>
      }
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
  {
    key: "alternates",
    header: "Alternate",
    defaultWidth: 180,
    sortable: true,
    filterable: true,
    sortAccessor: (item) => item.alternates?.[0]?.ipn ?? "",
    filterAccessor: (item) => item.alternates?.map((a) => a.ipn).join(", ") ?? "",
    cell: (item) => {
      if (!item.alternates || item.alternates.length === 0) return <span className="text-muted-foreground">—</span>
      return (
        <div>
          {item.alternates.map((alt) => (
            <div key={alt.material_id} className="text-sm">
              <span className="font-medium">{alt.ipn}</span>
              <span className="text-muted-foreground ml-1">
                ({alt.quantity_on_hand} avail, use {alt.quantity_to_use})
              </span>
            </div>
          ))}
        </div>
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
    sortable: true,
    filterable: true,
    sortAccessor: (item) => item.material.internal_part_number,
    filterAccessor: (item) => item.material.internal_part_number,
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
    sortable: true,
    filterable: true,
    sortAccessor: (item) => item.total_required,
    filterAccessor: (item) => item.total_required.toLocaleString(),
    cell: (item) => (
      <span className="font-mono">{item.total_required.toLocaleString()}</span>
    ),
  },
  {
    key: "quantity_on_hand",
    header: "On Hand",
    defaultWidth: 100,
    className: "text-right",
    sortable: true,
    filterable: true,
    sortAccessor: (item) => item.quantity_on_hand,
    filterAccessor: (item) => item.quantity_on_hand.toLocaleString(),
    cell: (item) => (
      <span className="font-mono">{item.quantity_on_hand.toLocaleString()}</span>
    ),
  },
  {
    key: "quantity_allocated",
    header: "Allocated",
    defaultWidth: 100,
    className: "text-right",
    sortable: true,
    filterable: true,
    sortAccessor: (item) => item.quantity_allocated,
    filterAccessor: (item) => item.quantity_allocated.toLocaleString(),
    cell: (item) => (
      <span className="font-mono text-yellow-600">{item.quantity_allocated.toLocaleString()}</span>
    ),
  },
  {
    key: "quantity_available",
    header: "Available",
    defaultWidth: 100,
    className: "text-right",
    sortable: true,
    filterable: true,
    sortAccessor: (item) => item.quantity_available,
    filterAccessor: (item) => item.quantity_available.toLocaleString(),
    cell: (item) => (
      <span className="font-mono text-green-600">{item.quantity_available.toLocaleString()}</span>
    ),
  },
  {
    key: "quantity_on_order",
    header: "On Order",
    defaultWidth: 100,
    className: "text-right",
    sortable: true,
    filterable: true,
    sortAccessor: (item) => item.quantity_on_order,
    filterAccessor: (item) => item.quantity_on_order.toLocaleString(),
    cell: (item) => (
      <span className="font-mono text-blue-600">{item.quantity_on_order.toLocaleString()}</span>
    ),
  },
  {
    key: "net_requirement",
    header: "Net Need",
    defaultWidth: 100,
    className: "text-right",
    sortable: true,
    filterable: true,
    sortAccessor: (item) => item.net_requirement,
    filterAccessor: (item) => item.net_requirement > 0 ? item.net_requirement.toLocaleString() : "0",
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
    key: "earliest_eta",
    header: "ETA",
    defaultWidth: 100,
    sortable: true,
    filterable: true,
    sortAccessor: (item) => item.earliest_eta || "",
    filterAccessor: (item) => item.earliest_eta ? new Date(item.earliest_eta).toLocaleDateString() : "-",
    cell: (item) => {
      if (!item.earliest_eta) return <span className="text-muted-foreground">-</span>
      const date = new Date(item.earliest_eta)
      const isOverdue = date < new Date()
      return (
        <span className={`text-xs ${isOverdue ? "text-red-600 font-medium" : ""}`}>
          {date.toLocaleDateString()}
        </span>
      )
    },
  },
  {
    key: "status",
    header: "Status",
    defaultWidth: 140,
    resizable: false,
    sortable: true,
    filterable: true,
    sortAccessor: (item) => {
      const isCovered = item.quantity_available + item.quantity_on_order >= item.total_required
      return isCovered ? 1 : 0
    },
    filterAccessor: (item) => {
      if (item.po_numbers.length > 0) return item.po_numbers.join(", ")
      const isCovered = item.quantity_available >= item.total_required
      return isCovered ? "In Stock" : "Short"
    },
    cell: (item) => {
      const isCoveredByStock = item.quantity_available >= item.total_required
      const isCoveredWithPO = item.quantity_available + item.quantity_on_order >= item.total_required

      if (item.po_numbers.length > 0) {
        return (
          <Badge variant="outline" className={isCoveredWithPO ? "text-green-600 border-green-600" : "text-blue-600 border-blue-600"}>
            {item.po_numbers.join(", ")}
          </Badge>
        )
      }

      if (isCoveredByStock) {
        return (
          <Badge variant="outline" className="text-green-600 border-green-600">
            <CheckCircle className="h-3 w-3 mr-1" />
            In Stock
          </Badge>
        )
      }

      return (
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
  const [reqFilterOrder, setReqFilterOrder] = useState<string>("")
  const [reqFilterProduct, setReqFilterProduct] = useState<string>("")
  const [reqFilterResourceType, setReqFilterResourceType] = useState<string>("")
  const [shortFilterOrder, setShortFilterOrder] = useState<string>("")
  const [shortFilterCustomer, setShortFilterCustomer] = useState<string>("")
  const [shortFilterResourceType, setShortFilterResourceType] = useState<string>("")

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

  // AML data for export
  const { data: amlEntries } = useApi<ApprovedManufacturer[]>("/aml")

  // Orders for requirements filtering
  const { data: allOrders } = useApi<Array<{
    id: string; order_number: string; product?: { name: string; part_number: string }; status: string
  }>>("/orders")

  // Extract arrays from wrapper responses
  const shortagesRaw = shortagesResponse?.shortages || null
  const requirementsRaw = requirementsResponse?.materials || null

  // Transform to add id fields
  const shortages: MrpShortageWithId[] | null = shortagesRaw
    ? shortagesRaw.map((item) => ({ ...item, id: item.material_id }))
    : null

  const enhancedShortages: EnhancedShortageWithId[] | null = enhancedShortagesResponse?.shortages
    ? enhancedShortagesResponse.shortages.map((item) => ({ ...item, id: item.material_id }))
    : null

  const requirements: MrpRequirementWithId[] | null = requirementsRaw
    ? requirementsRaw.map((item) => ({ ...item, id: item.material_id }))
    : null

  // Build order→material and material→resource_type maps from enhanced data for filtering
  const orderMaterialMap = useMemo(() => {
    const map = new Map<string, Set<string>>() // order_id → Set<material_id>
    if (!enhancedShortagesResponse?.shortages) return map
    for (const s of enhancedShortagesResponse.shortages) {
      for (const o of s.orders) {
        const existing = map.get(o.order_id) ?? new Set()
        existing.add(s.material_id)
        map.set(o.order_id, existing)
      }
    }
    return map
  }, [enhancedShortagesResponse])

  const productMaterialMap = useMemo(() => {
    const map = new Map<string, Set<string>>() // product_name → Set<material_id>
    if (!enhancedShortagesResponse?.shortages) return map
    for (const s of enhancedShortagesResponse.shortages) {
      for (const p of s.affected_products) {
        const existing = map.get(p.product_name) ?? new Set()
        existing.add(s.material_id)
        map.set(p.product_name, existing)
      }
    }
    return map
  }, [enhancedShortagesResponse])

  // Get unique orders and products for filter dropdowns
  const activeOrders = useMemo(() => {
    if (!allOrders) return []
    return allOrders
      .filter((o) => ["ENTERED", "KITTING", "SMT", "TH"].includes(o.status))
      .map((o) => ({ id: o.id, label: `${o.order_number} — ${o.product?.name ?? ""}` }))
  }, [allOrders])

  const uniqueProducts = useMemo(() => {
    if (!allOrders) return []
    const seen = new Set<string>()
    return allOrders
      .filter((o) => ["ENTERED", "KITTING", "SMT", "TH"].includes(o.status))
      .filter((o) => {
        const name = o.product?.name ?? ""
        if (seen.has(name)) return false
        seen.add(name)
        return true
      })
      .map((o) => o.product?.name ?? "")
  }, [allOrders])

  const resourceTypes = ["SMT", "TH", "MECH", "PCB"]

  // Filter requirements based on selected filters
  const filteredRequirements = useMemo(() => {
    if (!requirements) return null
    let result = requirements

    if (reqFilterOrder) {
      const materialIds = orderMaterialMap.get(reqFilterOrder)
      if (materialIds) {
        result = result.filter((r) => materialIds.has(r.material_id))
      } else {
        result = []
      }
    }

    if (reqFilterProduct) {
      const materialIds = productMaterialMap.get(reqFilterProduct)
      if (materialIds) {
        result = result.filter((r) => materialIds.has(r.material_id))
      } else {
        result = []
      }
    }

    if (reqFilterResourceType) {
      result = result.filter((r) => r.material?.resource_type === reqFilterResourceType)
    }

    return result
  }, [requirements, reqFilterOrder, reqFilterProduct, reqFilterResourceType, orderMaterialMap, productMaterialMap])

  // Unique customers from enhanced shortages
  const uniqueCustomers = useMemo(() => {
    if (!enhancedShortagesResponse?.shortages) return []
    const seen = new Set<string>()
    const customers: Array<{ id: string; name: string }> = []
    for (const s of enhancedShortagesResponse.shortages) {
      for (const o of s.orders) {
        if (!seen.has(o.customer_id)) {
          seen.add(o.customer_id)
          customers.push({ id: o.customer_id, name: o.customer_name })
        }
      }
    }
    return customers.sort((a, b) => a.name.localeCompare(b.name))
  }, [enhancedShortagesResponse])

  // Filter shortages
  const filteredShortages = useMemo(() => {
    if (!enhancedShortages) return null
    let result = enhancedShortages

    if (shortFilterOrder) {
      result = result.filter((s) =>
        s.orders.some((o) => o.order_id === shortFilterOrder)
      )
    }

    if (shortFilterCustomer) {
      result = result.filter((s) =>
        s.orders.some((o) => o.customer_id === shortFilterCustomer)
      )
    }

    if (shortFilterResourceType) {
      result = result.filter((s) => {
        const rt = s.resource_type_usages?.find((u) => u.resource_type === shortFilterResourceType)
        return !!rt
      })
    }

    return result
  }, [enhancedShortages, shortFilterOrder, shortFilterCustomer, shortFilterResourceType])

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
              `shortages-by-material-${timestamp}.xlsx`,
              amlEntries ?? undefined,
            )
          }
          break
        case "by-customer":
          if (byCustomerResponse?.customers) {
            exportShortagesByCustomer(
              byCustomerResponse.customers,
              `shortages-by-customer-${timestamp}.xlsx`,
              amlEntries ?? undefined,
            )
          }
          break
        case "by-resource-type":
          if (byResourceTypeResponse?.resource_types) {
            exportShortagesByResourceType(
              byResourceTypeResponse.resource_types,
              `shortages-by-part-type-${timestamp}.xlsx`,
              amlEntries ?? undefined,
            )
          }
          break
        case "order-buildability":
          if (buildabilityResponse?.orders) {
            exportOrderBuildability(
              buildabilityResponse.orders,
              `order-buildability-${timestamp}.xlsx`,
              amlEntries ?? undefined,
            )
          }
          break
        case "affected-assemblies":
          if (enhancedShortagesResponse?.shortages) {
            exportAffectedAssemblies(
              enhancedShortagesResponse.shortages,
              `affected-assemblies-${timestamp}.xlsx`,
              amlEntries ?? undefined,
            )
          }
          break
      }
    } finally {
      setIsExporting(false)
    }
  }, [shortageView, enhancedShortagesResponse, byCustomerResponse, byResourceTypeResponse, buildabilityResponse, amlEntries])

  // Render the appropriate view
  const renderShortageView = () => {
    switch (shortageView) {
      case "by-material":
        return (
          <div className="space-y-4">
            {/* Shortage filters */}
            <div className="flex flex-wrap gap-3">
              <div className="w-[250px]">
                <Select value={shortFilterOrder || "__all__"} onValueChange={(v) => setShortFilterOrder(v === "__all__" ? "" : v)}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="All Orders" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Orders</SelectItem>
                    {activeOrders.map((o) => (
                      <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-[180px]">
                <Select value={shortFilterCustomer || "__all__"} onValueChange={(v) => setShortFilterCustomer(v === "__all__" ? "" : v)}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="All Customers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Customers</SelectItem>
                    {uniqueCustomers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-[150px]">
                <Select value={shortFilterResourceType || "__all__"} onValueChange={(v) => setShortFilterResourceType(v === "__all__" ? "" : v)}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Types</SelectItem>
                    {resourceTypes.map((rt) => (
                      <SelectItem key={rt} value={rt}>{rt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {(shortFilterOrder || shortFilterCustomer || shortFilterResourceType) && (
                <Button variant="ghost" size="sm" className="h-8" onClick={() => {
                  setShortFilterOrder("")
                  setShortFilterCustomer("")
                  setShortFilterResourceType("")
                }}>
                  Clear filters
                </Button>
              )}
            </div>
            {filteredShortages && filteredShortages.length > 0 ? (
              <DataTable
                data={filteredShortages}
                columns={shortagesColumns}
                isLoading={enhancedLoading}
                searchFilter={shortagesSearchFilter}
                searchPlaceholder="Search by IPN, description, quantity, alternate..."
                emptyMessage="No shortages found for the selected filters"
                storageKey="mrp-shortages"
                pageSize={50}
              />
            ) : enhancedLoading ? (
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
            )}
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
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>All Material Requirements</CardTitle>
                  <CardDescription>
                    Summary of requirements across all active orders (ENTERED, KITTING, SMT, TH)
                  </CardDescription>
                </div>
              </div>
              {/* Filter dropdowns */}
              <div className="flex flex-wrap gap-3 pt-2">
                <div className="w-[250px]">
                  <Select value={reqFilterOrder || "__all__"} onValueChange={(v) => setReqFilterOrder(v === "__all__" ? "" : v)}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="All Orders" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All Orders</SelectItem>
                      {activeOrders.map((o) => (
                        <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-[200px]">
                  <Select value={reqFilterProduct || "__all__"} onValueChange={(v) => setReqFilterProduct(v === "__all__" ? "" : v)}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="All Products" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All Products</SelectItem>
                      {uniqueProducts.map((p) => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-[150px]">
                  <Select value={reqFilterResourceType || "__all__"} onValueChange={(v) => setReqFilterResourceType(v === "__all__" ? "" : v)}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="All Types" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All Types</SelectItem>
                      {resourceTypes.map((rt) => (
                        <SelectItem key={rt} value={rt}>{rt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {(reqFilterOrder || reqFilterProduct || reqFilterResourceType) && (
                  <Button variant="ghost" size="sm" className="h-8" onClick={() => {
                    setReqFilterOrder("")
                    setReqFilterProduct("")
                    setReqFilterResourceType("")
                  }}>
                    Clear filters
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {filteredRequirements && filteredRequirements.length > 0 ? (
                <DataTable
                  data={filteredRequirements}
                  columns={requirementsColumns}
                  isLoading={requirementsLoading}
                  searchFilter={requirementsSearchFilter}
                  searchPlaceholder="Search by IPN, description, quantity..."
                  emptyMessage="No material requirements found for the selected filters."
                  storageKey="mrp-requirements"
                  pageSize={50}
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
