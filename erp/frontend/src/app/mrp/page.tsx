"use client"

import { useApi } from "@/hooks/use-api"
import { type MrpShortage, type MrpRequirement, type MrpShortagesResponse, type MrpRequirementsResponse } from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
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

// Extended type with id for table keys
type MrpShortageWithId = MrpShortage & { id: string }
type MrpRequirementWithId = MrpRequirement & { id: string }

export default function MRPPage() {
  const { data: shortagesResponse, isLoading: shortagesLoading } =
    useApi<MrpShortagesResponse>("/mrp/shortages")
  const { data: requirementsResponse, isLoading: requirementsLoading } =
    useApi<MrpRequirementsResponse>("/mrp/requirements")

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">MRP / Shortages</h1>
        <p className="text-muted-foreground">
          Material requirements planning and shortage analysis
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
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
        <TabsList>
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
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                Material Shortages
              </CardTitle>
              <CardDescription>
                Materials where required quantity exceeds available + on order
              </CardDescription>
            </CardHeader>
            <CardContent>
              {shortagesLoading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : shortages && shortages.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Material</TableHead>
                      <TableHead className="text-right">Required</TableHead>
                      <TableHead className="text-right">Available</TableHead>
                      <TableHead className="text-right">On Order</TableHead>
                      <TableHead className="text-right">Shortage</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shortages.map((item) => {
                      const severityPercent =
                        (Math.abs(item.shortage) / item.total_required) * 100
                      const severity =
                        severityPercent > 50
                          ? "critical"
                          : severityPercent > 25
                            ? "warning"
                            : "low"

                      return (
                        <TableRow key={item.id}>
                          <TableCell>
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
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {item.total_required.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {item.quantity_available.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right font-mono text-blue-600">
                            {item.quantity_on_order.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold text-red-600">
                            {Math.abs(item.shortage).toLocaleString()}
                          </TableCell>
                          <TableCell>
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
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8">
                  <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                  <p className="text-lg font-medium text-green-600">No Shortages</p>
                  <p className="text-muted-foreground">
                    All material requirements can be fulfilled with current stock and open POs.
                  </p>
                </div>
              )}
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
              {requirementsLoading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : requirements && requirements.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Material</TableHead>
                      <TableHead className="text-right">Required</TableHead>
                      <TableHead className="text-right">On Hand</TableHead>
                      <TableHead className="text-right">Allocated</TableHead>
                      <TableHead className="text-right">Available</TableHead>
                      <TableHead className="text-right">On Order</TableHead>
                      <TableHead className="text-right">Net Need</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {requirements.map((item) => {
                      const isCovered =
                        item.quantity_available + item.quantity_on_order >= item.total_required
                      const hasShortage = item.net_requirement > 0

                      return (
                        <TableRow key={item.id}>
                          <TableCell>
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
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {item.total_required.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {item.quantity_on_hand.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right font-mono text-yellow-600">
                            {item.quantity_allocated.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right font-mono text-green-600">
                            {item.quantity_available.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right font-mono text-blue-600">
                            {item.quantity_on_order.toLocaleString()}
                          </TableCell>
                          <TableCell
                            className={`text-right font-mono font-medium ${
                              hasShortage ? "text-red-600" : "text-green-600"
                            }`}
                          >
                            {hasShortage ? item.net_requirement.toLocaleString() : "0"}
                          </TableCell>
                          <TableCell>
                            {isCovered ? (
                              <Badge variant="outline" className="text-green-600 border-green-600">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Covered
                              </Badge>
                            ) : (
                              <Badge variant="destructive">
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                Short
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-center text-muted-foreground py-8">
                  No material requirements found. No active orders require materials.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
