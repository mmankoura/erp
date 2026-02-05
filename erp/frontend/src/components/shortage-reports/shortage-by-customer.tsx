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
import { ChevronDown, ChevronRight, Building2, AlertTriangle } from "lucide-react"
import type { CustomerShortage } from "@/lib/api"
import { useState } from "react"

interface ShortageByCustomerProps {
  customers: CustomerShortage[] | null
  isLoading: boolean
}

export function ShortageByCustomer({ customers, isLoading }: ShortageByCustomerProps) {
  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set())
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set())

  const toggleCustomer = (customerId: string) => {
    setExpandedCustomers((prev) => {
      const next = new Set(prev)
      if (next.has(customerId)) {
        next.delete(customerId)
      } else {
        next.add(customerId)
      }
      return next
    })
  }

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
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    )
  }

  if (!customers || customers.length === 0) {
    return (
      <div className="text-center py-12">
        <Building2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
        <p className="text-lg font-medium text-green-600">No Customer Shortages</p>
        <p className="text-muted-foreground">
          All customers' orders can be fulfilled with current stock and open POs.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {customers.map((customer) => {
        const isCustomerExpanded = expandedCustomers.has(customer.customer_id)

        return (
          <Card key={customer.customer_id} className="print:break-inside-avoid">
            <CardHeader className="pb-3">
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => toggleCustomer(customer.customer_id)}
              >
                <div className="flex items-center gap-3">
                  {isCustomerExpanded ? (
                    <ChevronDown className="h-5 w-5 text-muted-foreground print:hidden" />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-muted-foreground print:hidden" />
                  )}
                  <Building2 className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <CardTitle className="text-lg">{customer.customer_name}</CardTitle>
                    <CardDescription>{customer.customer_code}</CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Orders Affected</p>
                    <p className="text-xl font-bold">{customer.total_orders_affected}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Shortage Items</p>
                    <p className="text-xl font-bold text-red-600">{customer.total_shortage_items}</p>
                  </div>
                </div>
              </div>
            </CardHeader>

            {(isCustomerExpanded || true) && (
              <CardContent className={!isCustomerExpanded ? "hidden print:block" : ""}>
                <div className="space-y-3">
                  {customer.orders.map((order) => {
                    const isOrderExpanded = expandedOrders.has(order.order_id)

                    return (
                      <div
                        key={order.order_id}
                        className="border rounded-lg p-3 print:break-inside-avoid"
                      >
                        <div
                          className="flex items-center justify-between cursor-pointer"
                          onClick={() => toggleOrder(order.order_id)}
                        >
                          <div className="flex items-center gap-3">
                            {isOrderExpanded ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground print:hidden" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground print:hidden" />
                            )}
                            <div>
                              <p className="font-medium">
                                Order #{order.order_number}
                                <span className="text-muted-foreground font-normal ml-2">
                                  - {order.product_name}
                                </span>
                              </p>
                              <p className="text-sm text-muted-foreground">
                                Due: {new Date(order.due_date).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                          <Badge variant="destructive">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            {order.shortages.length} short
                          </Badge>
                        </div>

                        {(isOrderExpanded || true) && (
                          <div className={!isOrderExpanded ? "hidden print:block" : "mt-3"}>
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>IPN</TableHead>
                                  <TableHead>Description</TableHead>
                                  <TableHead className="text-right">Shortage</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {order.shortages.map((shortage) => (
                                  <TableRow key={shortage.material_id}>
                                    <TableCell className="font-mono">{shortage.ipn}</TableCell>
                                    <TableCell className="text-muted-foreground">
                                      {shortage.description ?? "-"}
                                    </TableCell>
                                    <TableCell className="text-right font-mono text-red-600 font-bold">
                                      {shortage.shortage.toLocaleString()}
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
            )}
          </Card>
        )
      })}
    </div>
  )
}
