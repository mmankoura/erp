"use client"

import { useApi } from "@/hooks/use-api"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  FileText,
  Package,
  AlertTriangle,
  Clock,
  CheckCircle,
  TrendingDown,
  Activity,
} from "lucide-react"
import type { Order, HealthStatus, MrpShortage } from "@/lib/api"
import Link from "next/link"

interface DashboardStats {
  orders: {
    pending: number
    confirmed: number
    inProduction: number
    total: number
  }
  purchaseOrders: {
    open: number
    awaitingReceipt: number
  }
  shortages: number
}

function StatsCard({
  title,
  value,
  description,
  icon: Icon,
  href,
}: {
  title: string
  value: string | number
  description?: string
  icon: React.ElementType
  trend?: "up" | "down" | "neutral"
  href?: string
}) {
  const content = (
    <Card className={href ? "hover:bg-accent/50 transition-colors cursor-pointer" : ""}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </CardContent>
    </Card>
  )

  if (href) {
    return <Link href={href}>{content}</Link>
  }

  return content
}

function StatsCardSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-4" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-16 mb-1" />
        <Skeleton className="h-3 w-32" />
      </CardContent>
    </Card>
  )
}

function RecentOrdersCard({ orders, isLoading }: { orders: Order[] | null; isLoading: boolean }) {
  const statusColors: Record<string, string> = {
    ENTERED: "bg-yellow-100 text-yellow-800",
    KITTING: "bg-blue-100 text-blue-800",
    SMT: "bg-purple-100 text-purple-800",
    TH: "bg-indigo-100 text-indigo-800",
    SHIPPED: "bg-green-100 text-green-800",
    ON_HOLD: "bg-orange-100 text-orange-800",
    CANCELLED: "bg-red-100 text-red-800",
  }

  return (
    <Card className="col-span-full lg:col-span-2">
      <CardHeader>
        <CardTitle>Recent Orders</CardTitle>
        <CardDescription>Latest orders in the system</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="space-y-1">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-5 w-20" />
              </div>
            ))}
          </div>
        ) : orders && orders.length > 0 ? (
          <div className="space-y-3">
            {orders.slice(0, 5).map((order) => (
              <Link
                key={order.id}
                href={`/orders/${order.id}`}
                className="flex items-center justify-between hover:bg-accent/50 -mx-2 px-2 py-1 rounded transition-colors"
              >
                <div>
                  <p className="font-medium">{order.order_number}</p>
                  <p className="text-sm text-muted-foreground">
                    {order.customer?.name || "Unknown Customer"} • {order.quantity} units
                  </p>
                </div>
                <Badge className={statusColors[order.status] || "bg-gray-100"}>
                  {order.status.replace("_", " ")}
                </Badge>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">No orders found</p>
        )}
        <Link
          href="/orders"
          className="text-sm text-primary hover:underline mt-4 inline-block"
        >
          View all orders →
        </Link>
      </CardContent>
    </Card>
  )
}

function ShortagesCard({ shortages, isLoading }: { shortages: MrpShortage[] | null; isLoading: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          Material Shortages
        </CardTitle>
        <CardDescription>Materials with insufficient stock</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="space-y-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
            ))}
          </div>
        ) : shortages && shortages.length > 0 ? (
          <div className="space-y-3">
            {shortages.slice(0, 5).map((shortage) => (
              <div key={shortage.material_id} className="space-y-1">
                <p className="font-medium text-sm">
                  {shortage.material.internal_part_number}
                </p>
                <p className="text-xs text-muted-foreground">
                  Need: {shortage.required_quantity} • Have: {shortage.available_quantity} •{" "}
                  <span className="text-destructive font-medium">
                    Short: {shortage.shortage}
                  </span>
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-600" />
            No shortages - all materials available
          </p>
        )}
        <Link
          href="/mrp"
          className="text-sm text-primary hover:underline mt-4 inline-block"
        >
          View MRP details →
        </Link>
      </CardContent>
    </Card>
  )
}

export default function DashboardPage() {
  const { data: health, isLoading: healthLoading } = useApi<HealthStatus>("/health")
  const { data: orders, isLoading: ordersLoading } = useApi<Order[]>("/orders")
  const { data: shortages, isLoading: shortagesLoading } = useApi<MrpShortage[]>("/mrp/shortages")

  // Calculate stats from orders
  const stats: DashboardStats = {
    orders: {
      pending: orders?.filter((o) => o.status === "ENTERED").length || 0,
      confirmed: orders?.filter((o) => o.status === "KITTING").length || 0,
      inProduction: orders?.filter((o) => ["SMT", "TH"].includes(o.status)).length || 0,
      total: orders?.length || 0,
    },
    purchaseOrders: {
      open: 0,
      awaitingReceipt: 0,
    },
    shortages: shortages?.length || 0,
  }

  const isLoading = healthLoading || ordersLoading

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Overview of your manufacturing operations
        </p>
      </div>

      {/* System Status */}
      <div className="flex items-center gap-2">
        {healthLoading ? (
          <Skeleton className="h-5 w-32" />
        ) : health?.status === "ok" ? (
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
            <Activity className="h-3 w-3 mr-1" />
            System Online
          </Badge>
        ) : (
          <Badge variant="destructive">
            <Activity className="h-3 w-3 mr-1" />
            System Offline
          </Badge>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {isLoading ? (
          <>
            <StatsCardSkeleton />
            <StatsCardSkeleton />
            <StatsCardSkeleton />
            <StatsCardSkeleton />
          </>
        ) : (
          <>
            <StatsCard
              title="New Orders"
              value={stats.orders.pending}
              description="Ready for kitting"
              icon={Clock}
              href="/orders?status=ENTERED"
            />
            <StatsCard
              title="In Production"
              value={stats.orders.inProduction}
              description="Currently in SMT or TH"
              icon={FileText}
              href="/orders?status=SMT"
            />
            <StatsCard
              title="Total Orders"
              value={stats.orders.total}
              description="All orders in system"
              icon={Package}
              href="/orders"
            />
            <StatsCard
              title="Material Shortages"
              value={stats.shortages}
              description={stats.shortages > 0 ? "Materials need attention" : "All materials available"}
              icon={stats.shortages > 0 ? TrendingDown : CheckCircle}
              href="/mrp"
            />
          </>
        )}
      </div>

      {/* Recent Orders & Shortages */}
      <div className="grid gap-4 lg:grid-cols-3">
        <RecentOrdersCard orders={orders} isLoading={ordersLoading} />
        <ShortagesCard shortages={shortages} isLoading={shortagesLoading} />
      </div>
    </div>
  )
}
