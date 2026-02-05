"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import {
  CheckCircle,
  AlertTriangle,
  XCircle,
  ChevronDown,
  ChevronRight,
  Factory
} from "lucide-react"
import type { OrderBuildability as OrderBuildabilityType, OrderBuildabilityResponse } from "@/lib/api"
import { useState } from "react"

interface OrderBuildabilityProps {
  data: OrderBuildabilityResponse | null
  isLoading: boolean
}

function getStatusIcon(status: string) {
  switch (status) {
    case "CAN_BUILD":
      return <CheckCircle className="h-4 w-4 text-green-500" />
    case "PARTIAL":
      return <AlertTriangle className="h-4 w-4 text-yellow-500" />
    case "BLOCKED":
      return <XCircle className="h-4 w-4 text-red-500" />
    default:
      return null
  }
}

function getStatusBadge(status: string) {
  switch (status) {
    case "CAN_BUILD":
      return (
        <Badge className="bg-green-100 text-green-800 border-green-200">
          <CheckCircle className="h-3 w-3 mr-1" />
          Can Build
        </Badge>
      )
    case "PARTIAL":
      return (
        <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">
          <AlertTriangle className="h-3 w-3 mr-1" />
          Partial
        </Badge>
      )
    case "BLOCKED":
      return (
        <Badge className="bg-red-100 text-red-800 border-red-200">
          <XCircle className="h-3 w-3 mr-1" />
          Blocked
        </Badge>
      )
    default:
      return <Badge variant="secondary">{status}</Badge>
  }
}

export function OrderBuildability({ data, isLoading }: OrderBuildabilityProps) {
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set())
  const [filterStatus, setFilterStatus] = useState<string | null>(null)

  const toggleOrder = (orderId: string) => {
    setExpandedOrders((prev) => {
      const next = new Set(prev)
      if (next.has(orderId)) {
        next.delete(orderId)
      } else {
        next.add(orderId)
      }
      return next
    })
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (!data || data.orders.length === 0) {
    return (
      <div className="text-center py-12">
        <Factory className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-lg font-medium">No Orders to Analyze</p>
        <p className="text-muted-foreground">
          No active orders found for buildability analysis.
        </p>
      </div>
    )
  }

  const filteredOrders = filterStatus
    ? data.orders.filter((o) => o.status === filterStatus)
    : data.orders

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4 print:grid-cols-4">
        <Card
          className={`cursor-pointer transition-colors ${filterStatus === null ? "ring-2 ring-primary" : "hover:bg-accent"}`}
          onClick={() => setFilterStatus(null)}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{data.total_orders}</div>
          </CardContent>
        </Card>
        <Card
          className={`cursor-pointer transition-colors ${filterStatus === "CAN_BUILD" ? "ring-2 ring-green-500" : "hover:bg-accent"}`}
          onClick={() => setFilterStatus(filterStatus === "CAN_BUILD" ? null : "CAN_BUILD")}
        >
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <CardTitle className="text-sm font-medium">Can Build</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{data.can_build_count}</div>
            <p className="text-xs text-muted-foreground">
              {Math.round((data.can_build_count / data.total_orders) * 100)}% of orders
            </p>
          </CardContent>
        </Card>
        <Card
          className={`cursor-pointer transition-colors ${filterStatus === "PARTIAL" ? "ring-2 ring-yellow-500" : "hover:bg-accent"}`}
          onClick={() => setFilterStatus(filterStatus === "PARTIAL" ? null : "PARTIAL")}
        >
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              <CardTitle className="text-sm font-medium">Partial</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-600">{data.partial_count}</div>
            <p className="text-xs text-muted-foreground">Some materials ready</p>
          </CardContent>
        </Card>
        <Card
          className={`cursor-pointer transition-colors ${filterStatus === "BLOCKED" ? "ring-2 ring-red-500" : "hover:bg-accent"}`}
          onClick={() => setFilterStatus(filterStatus === "BLOCKED" ? null : "BLOCKED")}
        >
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-500" />
              <CardTitle className="text-sm font-medium">Blocked</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">{data.blocked_count}</div>
            <p className="text-xs text-muted-foreground">Cannot start production</p>
          </CardContent>
        </Card>
      </div>

      {/* Orders Table */}
      <Card>
        <CardHeader>
          <CardTitle>Order Buildability</CardTitle>
          <CardDescription>
            {filterStatus
              ? `Showing ${filteredOrders.length} ${filterStatus.toLowerCase().replace("_", " ")} orders`
              : `Showing all ${data.total_orders} orders`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {filteredOrders.map((order) => {
              const isExpanded = expandedOrders.has(order.order_id)
              const completionPercent = Math.round(
                (order.materials_ready / order.materials_total) * 100
              )

              return (
                <div
                  key={order.order_id}
                  className="border rounded-lg print:break-inside-avoid"
                >
                  <div
                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-accent/50"
                    onClick={() => toggleOrder(order.order_id)}
                  >
                    <div className="flex items-center gap-4">
                      {order.critical_shortages.length > 0 ? (
                        isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground print:hidden" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground print:hidden" />
                        )
                      ) : (
                        <div className="w-4 print:hidden" />
                      )}
                      <div>
                        <p className="font-medium">
                          {order.order_number}
                          <span className="text-muted-foreground font-normal ml-2">
                            - {order.product_name}
                          </span>
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {order.customer_name} | Qty: {order.quantity} | Due:{" "}
                          {new Date(order.due_date).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">Materials</p>
                        <p className="font-mono">
                          <span className="text-green-600">{order.materials_ready}</span>
                          <span className="text-muted-foreground">/</span>
                          <span>{order.materials_total}</span>
                          <span className="text-muted-foreground ml-1">({completionPercent}%)</span>
                        </p>
                      </div>
                      {getStatusBadge(order.status)}
                    </div>
                  </div>

                  {/* Expanded: Critical Shortages */}
                  {(isExpanded || (order.critical_shortages.length > 0 && false)) &&
                    order.critical_shortages.length > 0 && (
                      <div className={`border-t bg-muted/30 p-4 ${!isExpanded ? "hidden print:block" : ""}`}>
                        <p className="text-sm font-medium mb-2 text-red-600">
                          Critical Shortages ({order.critical_shortages.length})
                        </p>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>IPN</TableHead>
                              <TableHead>Description</TableHead>
                              <TableHead className="text-right">Required</TableHead>
                              <TableHead className="text-right">Available</TableHead>
                              <TableHead className="text-right">On Order</TableHead>
                              <TableHead className="text-right" title="Shortage for this specific order">Order Short</TableHead>
                              <TableHead className="text-right" title="Global shortage across all orders">Global Short</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {order.critical_shortages.map((shortage) => (
                              <TableRow key={shortage.material_id}>
                                <TableCell className="font-mono">{shortage.ipn}</TableCell>
                                <TableCell className="text-muted-foreground max-w-[200px] truncate">
                                  {shortage.description ?? "-"}
                                </TableCell>
                                <TableCell className="text-right font-mono">
                                  {shortage.required.toLocaleString()}
                                </TableCell>
                                <TableCell className="text-right font-mono">
                                  {shortage.available.toLocaleString()}
                                </TableCell>
                                <TableCell className="text-right font-mono text-blue-600">
                                  {shortage.on_order.toLocaleString()}
                                </TableCell>
                                <TableCell className="text-right font-mono font-bold text-red-600">
                                  {shortage.shortage > 0 ? shortage.shortage.toLocaleString() : "-"}
                                </TableCell>
                                <TableCell className="text-right font-mono font-bold text-orange-600">
                                  {shortage.global_shortage > 0 ? shortage.global_shortage.toLocaleString() : "-"}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
