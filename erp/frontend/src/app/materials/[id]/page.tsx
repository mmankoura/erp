"use client"

import { useApi } from "@/hooks/use-api"
import { api, type Material, type WhereUsedResponse, type UsageSummary } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { ArrowLeft, Package, FileText, ShoppingCart, Boxes } from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"

const orderStatusColors: Record<string, string> = {
  ENTERED: "bg-yellow-100 text-yellow-800",
  KITTING: "bg-blue-100 text-blue-800",
  SMT: "bg-purple-100 text-purple-800",
  TH: "bg-indigo-100 text-indigo-800",
  SHIPPED: "bg-green-100 text-green-800",
  ON_HOLD: "bg-orange-100 text-orange-800",
  CANCELLED: "bg-red-100 text-red-800",
}

export default function MaterialDetailPage() {
  const params = useParams()
  const materialId = params.id as string

  const { data: material, isLoading: materialLoading } = useApi<Material>(`/materials/${materialId}`)
  const { data: whereUsed, isLoading: whereUsedLoading } = useApi<WhereUsedResponse>(
    `/materials/${materialId}/where-used`
  )
  const { data: summary, isLoading: summaryLoading } = useApi<UsageSummary>(
    `/materials/${materialId}/usage-summary`
  )

  if (materialLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
      </div>
    )
  }

  if (!material) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold">Material not found</h2>
        <Button asChild className="mt-4">
          <Link href="/materials">Back to Materials</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/materials">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{material.internal_part_number}</h1>
          <p className="text-muted-foreground">
            {material.description || "No description"}
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Products Using</CardTitle>
            <Boxes className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{summary?.total_products || 0}</div>
            )}
            <p className="text-xs text-muted-foreground">with active BOMs</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Open Orders</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{summary?.open_orders_count || 0}</div>
            )}
            <p className="text-xs text-muted-foreground">needing this material</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Qty Required</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">
                {summary?.total_qty_required_by_open_orders?.toLocaleString() || 0}
              </div>
            )}
            <p className="text-xs text-muted-foreground">across open orders</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Manufacturer</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold truncate" title={material.manufacturer || "-"}>
              {material.manufacturer || "-"}
            </div>
            <p className="text-xs text-muted-foreground truncate" title={material.manufacturer_pn || "-"}>
              {material.manufacturer_pn || "-"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="where-used" className="space-y-4">
        <TabsList>
          <TabsTrigger value="where-used">Where Used</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>

        {/* Where Used Tab */}
        <TabsContent value="where-used" className="space-y-4">
          {/* Products Section */}
          <Card>
            <CardHeader>
              <CardTitle>Products Using This Material</CardTitle>
              <CardDescription>
                Active BOM revisions that include this material
              </CardDescription>
            </CardHeader>
            <CardContent>
              {whereUsedLoading ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : whereUsed?.products && whereUsed.products.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Part Number</TableHead>
                      <TableHead>Revision</TableHead>
                      <TableHead>Qty Per Unit</TableHead>
                      <TableHead>Resource Type</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {whereUsed.products.map((product, index) => (
                      <TableRow key={`${product.product_id}-${index}`}>
                        <TableCell className="font-medium">
                          <Link
                            href={`/products/${product.product_id}`}
                            className="hover:underline text-primary"
                          >
                            {product.product_name}
                          </Link>
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {product.product_part_number}
                        </TableCell>
                        <TableCell>
                          <Badge variant={product.is_active_revision ? "default" : "secondary"}>
                            {product.revision_number}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono">
                          {product.quantity_per_unit}
                        </TableCell>
                        <TableCell>
                          {product.resource_type ? (
                            <Badge variant="outline">{product.resource_type}</Badge>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-muted-foreground text-center py-8">
                  This material is not used in any active BOM revisions
                </p>
              )}
            </CardContent>
          </Card>

          {/* Open Orders Section */}
          <Card>
            <CardHeader>
              <CardTitle>Open Orders Requiring This Material</CardTitle>
              <CardDescription>
                Active orders that need this material for production
              </CardDescription>
            </CardHeader>
            <CardContent>
              {whereUsedLoading ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : whereUsed?.orders && whereUsed.orders.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order #</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Order Qty</TableHead>
                      <TableHead>Total Required</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Due Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {whereUsed.orders.map((order) => (
                      <TableRow key={order.order_id}>
                        <TableCell className="font-medium">
                          <Link
                            href={`/orders/${order.order_id}`}
                            className="hover:underline text-primary"
                          >
                            {order.order_number}
                          </Link>
                        </TableCell>
                        <TableCell>{order.customer_name}</TableCell>
                        <TableCell>{order.product_name}</TableCell>
                        <TableCell className="font-mono">
                          {order.order_quantity.toLocaleString()}
                        </TableCell>
                        <TableCell className="font-mono font-bold">
                          {order.total_required.toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge className={orderStatusColors[order.status]}>
                            {order.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {new Date(order.due_date).toLocaleDateString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-muted-foreground text-center py-8">
                  No open orders require this material
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Details Tab */}
        <TabsContent value="details">
          <Card>
            <CardHeader>
              <CardTitle>Material Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-4">
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">Internal Part Number</dt>
                  <dd className="text-sm font-mono">{material.internal_part_number}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">Manufacturer Part Number</dt>
                  <dd className="text-sm font-mono">{material.manufacturer_pn || "-"}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">Manufacturer</dt>
                  <dd className="text-sm">{material.manufacturer || "-"}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">Category</dt>
                  <dd className="text-sm">{material.category || "-"}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">Unit of Measure</dt>
                  <dd className="text-sm">{material.uom}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">Costing Method</dt>
                  <dd className="text-sm">{material.costing_method || "-"}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">Standard Cost</dt>
                  <dd className="text-sm">
                    {material.standard_cost
                      ? `$${Number(material.standard_cost).toFixed(4)}`
                      : "-"}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">Customer</dt>
                  <dd className="text-sm">{material.customer?.name || "-"}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-sm font-medium text-muted-foreground">Description</dt>
                  <dd className="text-sm">{material.description || "-"}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">Created</dt>
                  <dd className="text-sm">{new Date(material.created_at).toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">Updated</dt>
                  <dd className="text-sm">{new Date(material.updated_at).toLocaleString()}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
