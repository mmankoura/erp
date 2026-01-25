"use client"

import { useApi, useMutation } from "@/hooks/use-api"
import { toast } from "sonner"
import { api, type Order, type MrpShortage, type MaterialStatus } from "@/lib/api"
import { DataTable, type Column } from "@/components/data-table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Plus, Eye, ShoppingCart, Package, Clock, CheckCircle, Trash2 } from "lucide-react"
import { useState, useMemo } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

const orderStatusColors: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800 border-yellow-200",
  CONFIRMED: "bg-blue-100 text-blue-800 border-blue-200",
  IN_PRODUCTION: "bg-purple-100 text-purple-800 border-purple-200",
  SHIPPED: "bg-green-100 text-green-800 border-green-200",
  COMPLETED: "bg-gray-100 text-gray-800 border-gray-200",
  CANCELLED: "bg-red-100 text-red-800 border-red-200",
}

const materialStatusColors: Record<MaterialStatus, { bg: string; icon: React.ElementType; label: string }> = {
  READY: { bg: "bg-green-100 text-green-800", icon: CheckCircle, label: "Ready" },
  PARTIAL: { bg: "bg-yellow-100 text-yellow-800", icon: Package, label: "Partial" },
  AWAITING_RECEIPT: { bg: "bg-blue-100 text-blue-800", icon: Clock, label: "Awaiting Receipt" },
  PURCHASING: { bg: "bg-orange-100 text-orange-800", icon: ShoppingCart, label: "Purchasing" },
  NEEDS_REVIEW: { bg: "bg-gray-100 text-gray-800", icon: Eye, label: "Needs Review" },
}

function MaterialStatusBadge({ status }: { status: MaterialStatus }) {
  const config = materialStatusColors[status]
  const Icon = config.icon

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <Badge variant="outline" className={`${config.bg} border-0 gap-1`}>
            <Icon className="h-3 w-3" />
            {config.label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          {status === "READY" && "All materials available for production"}
          {status === "PARTIAL" && "Some materials available, others pending"}
          {status === "AWAITING_RECEIPT" && "Purchase orders placed, waiting for delivery"}
          {status === "PURCHASING" && "Materials need to be purchased"}
          {status === "NEEDS_REVIEW" && "Material availability not yet checked"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// Compute material status from shortages and PO data
function computeMaterialStatus(
  orderId: string,
  shortages: MrpShortage[] | null,
  // In a real implementation, we'd also check open POs
): MaterialStatus {
  if (!shortages) return "NEEDS_REVIEW"

  // Filter shortages for this specific order (simplified - in reality, would need order-specific query)
  const hasShortages = shortages.length > 0

  if (!hasShortages) {
    return "READY"
  }

  // Check if POs exist for shortages (simplified logic)
  // In production, we'd query the backend for this
  const allCoveredByPOs = false // Would check PO coverage
  const someCoveredByPOs = false // Would check partial PO coverage

  if (allCoveredByPOs) {
    return "AWAITING_RECEIPT"
  }

  if (someCoveredByPOs) {
    return "PARTIAL"
  }

  return "PURCHASING"
}

export default function OrdersPage() {
  const router = useRouter()
  const [statusFilter, setStatusFilter] = useState<string>("all")

  const { data: orders, isLoading, refetch } = useApi<Order[]>("/orders")
  const { data: shortages } = useApi<MrpShortage[]>("/mrp/shortages")

  const deleteMutation = useMutation<void, string>({
    mutationFn: (id) => api.delete(`/orders/${id}`),
    onSuccess: () => {
      toast.success("Order deleted successfully")
      refetch()
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete order")
    },
  })

  const bulkDeleteMutation = useMutation<{ deleted: number }, string[]>({
    mutationFn: (ids) => api.post("/orders/bulk-delete", { ids }),
    onSuccess: (data) => {
      toast.success(`${data.deleted} order(s) deleted successfully`)
      refetch()
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete orders")
    },
  })

  const handleDelete = (id: string, orderNumber: string) => {
    if (confirm(`Are you sure you want to delete order ${orderNumber}?`)) {
      deleteMutation.mutate(id)
    }
  }

  const handleBulkDelete = (ids: string[]) => {
    if (confirm(`Are you sure you want to delete ${ids.length} order(s)?`)) {
      bulkDeleteMutation.mutate(ids)
    }
  }

  // Filter orders by status
  const filteredOrders = useMemo(() => {
    if (!orders) return null
    if (statusFilter === "all") return orders
    return orders.filter((order) => order.status === statusFilter)
  }, [orders, statusFilter])

  const columns: Column<Order>[] = [
    {
      key: "order_number",
      header: "Order #",
      cell: (order) => (
        <span className="font-medium">{order.order_number}</span>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      cell: (order) => order.customer?.name || "Unknown",
    },
    {
      key: "product",
      header: "Product",
      cell: (order) => order.product?.name || order.product?.part_number || "Unknown",
    },
    {
      key: "quantity",
      header: "Qty",
      cell: (order) => order.quantity.toLocaleString(),
    },
    {
      key: "status",
      header: "Order Status",
      cell: (order) => (
        <Badge variant="outline" className={orderStatusColors[order.status]}>
          {order.status.replace("_", " ")}
        </Badge>
      ),
    },
    {
      key: "material_status",
      header: "Material Status",
      cell: (order) => {
        // Only show material status for active orders
        if (["CANCELLED", "COMPLETED", "SHIPPED"].includes(order.status)) {
          return <span className="text-muted-foreground text-sm">-</span>
        }
        const materialStatus = computeMaterialStatus(order.id, shortages)
        return <MaterialStatusBadge status={materialStatus} />
      },
    },
    {
      key: "due_date",
      header: "Due Date",
      cell: (order) => {
        const date = new Date(order.due_date)
        const isOverdue = date < new Date() && !["COMPLETED", "SHIPPED", "CANCELLED"].includes(order.status)
        return (
          <span className={isOverdue ? "text-destructive font-medium" : ""}>
            {date.toLocaleDateString()}
            {isOverdue && " (Overdue)"}
          </span>
        )
      },
    },
    {
      key: "order_type",
      header: "Type",
      cell: (order) => (
        <Badge variant="secondary" className="text-xs">
          {order.order_type}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "w-[100px]",
      cell: (order) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={(e) => {
              e.stopPropagation()
              router.push(`/orders/${order.id}`)
            }}
          >
            <Eye className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation()
              handleDelete(order.id, order.order_number)
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ]

  // Calculate status counts for filter badges
  const statusCounts = useMemo(() => {
    if (!orders) return {}
    return orders.reduce((acc, order) => {
      acc[order.status] = (acc[order.status] || 0) + 1
      return acc
    }, {} as Record<string, number>)
  }, [orders])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Orders</h1>
          <p className="text-muted-foreground">
            Manage customer orders and track production status
          </p>
        </div>
        <Button asChild>
          <Link href="/orders/new">
            <Plus className="h-4 w-4 mr-2" />
            New Order
          </Link>
        </Button>
      </div>

      {/* Status Filter */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Filter by status:</span>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                All ({orders?.length || 0})
              </SelectItem>
              <SelectItem value="PENDING">
                Pending ({statusCounts.PENDING || 0})
              </SelectItem>
              <SelectItem value="CONFIRMED">
                Confirmed ({statusCounts.CONFIRMED || 0})
              </SelectItem>
              <SelectItem value="IN_PRODUCTION">
                In Production ({statusCounts.IN_PRODUCTION || 0})
              </SelectItem>
              <SelectItem value="SHIPPED">
                Shipped ({statusCounts.SHIPPED || 0})
              </SelectItem>
              <SelectItem value="COMPLETED">
                Completed ({statusCounts.COMPLETED || 0})
              </SelectItem>
              <SelectItem value="CANCELLED">
                Cancelled ({statusCounts.CANCELLED || 0})
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Material Status Legend */}
      <div className="flex flex-wrap items-center gap-4 p-3 bg-muted/50 rounded-lg">
        <span className="text-sm font-medium">Material Status:</span>
        {Object.entries(materialStatusColors).map(([status, config]) => {
          const Icon = config.icon
          return (
            <div key={status} className="flex items-center gap-1 text-sm">
              <Badge variant="outline" className={`${config.bg} border-0 gap-1 text-xs`}>
                <Icon className="h-3 w-3" />
                {config.label}
              </Badge>
            </div>
          )
        })}
      </div>

      <DataTable
        data={filteredOrders}
        columns={columns}
        isLoading={isLoading}
        searchKey="order_number"
        searchPlaceholder="Search by order number..."
        emptyMessage="No orders found"
        onRowClick={(order) => router.push(`/orders/${order.id}`)}
        enableSelection
        onBulkDelete={handleBulkDelete}
      />
    </div>
  )
}
