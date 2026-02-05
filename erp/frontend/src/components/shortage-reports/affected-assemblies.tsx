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
import { Box, ChevronDown, ChevronRight, CheckCircle } from "lucide-react"
import type { EnhancedMaterialShortage } from "@/lib/api"
import { useState, useMemo } from "react"

interface AffectedAssembliesProps {
  shortages: EnhancedMaterialShortage[] | null
  isLoading: boolean
}

interface ProductWithShortages {
  product_id: string
  product_name: string
  shortage_count: number
  total_shortage_qty: number
  shortages: Array<{
    material_id: string
    ipn: string
    description: string | null
    shortage: number
    total_required: number
    quantity_available: number
    quantity_on_order: number
  }>
}

export function AffectedAssemblies({ shortages, isLoading }: AffectedAssembliesProps) {
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set())

  // Build product-centric view from shortages
  const products: ProductWithShortages[] = useMemo(() => {
    if (!shortages) return []

    const productMap = new Map<string, ProductWithShortages>()

    for (const shortage of shortages) {
      for (const product of shortage.affected_products) {
        let existing = productMap.get(product.product_id)
        if (!existing) {
          existing = {
            product_id: product.product_id,
            product_name: product.product_name,
            shortage_count: 0,
            total_shortage_qty: 0,
            shortages: [],
          }
          productMap.set(product.product_id, existing)
        }
        existing.shortage_count++
        existing.total_shortage_qty += shortage.shortage
        existing.shortages.push({
          material_id: shortage.material_id,
          ipn: shortage.material.internal_part_number,
          description: shortage.material.description,
          shortage: shortage.shortage,
          total_required: shortage.total_required,
          quantity_available: shortage.quantity_available,
          quantity_on_order: shortage.quantity_on_order,
        })
      }
    }

    return Array.from(productMap.values()).sort((a, b) => b.shortage_count - a.shortage_count)
  }, [shortages])

  const toggleProduct = (productId: string) => {
    setExpandedProducts((prev) => {
      const next = new Set(prev)
      if (next.has(productId)) {
        next.delete(productId)
      } else {
        next.add(productId)
      }
      return next
    })
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    )
  }

  if (products.length === 0) {
    return (
      <div className="text-center py-12">
        <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
        <p className="text-lg font-medium text-green-600">No Affected Assemblies</p>
        <p className="text-muted-foreground">
          All products can be built with current stock and open POs.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid gap-4 md:grid-cols-3 print:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Products Affected
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">{products.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Shortage Items
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {products.reduce((sum, p) => sum + p.shortage_count, 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Shortage Qty
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {products.reduce((sum, p) => sum + p.total_shortage_qty, 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Product Cards */}
      <div className="space-y-4">
        {products.map((product) => {
          const isExpanded = expandedProducts.has(product.product_id)

          return (
            <Card key={product.product_id} className="print:break-inside-avoid">
              <CardHeader className="pb-3">
                <div
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => toggleProduct(product.product_id)}
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronDown className="h-5 w-5 text-muted-foreground print:hidden" />
                    ) : (
                      <ChevronRight className="h-5 w-5 text-muted-foreground print:hidden" />
                    )}
                    <Box className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <CardTitle className="text-lg">{product.product_name}</CardTitle>
                      <CardDescription>Assembly / Product</CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Short Items</p>
                      <p className="text-xl font-bold text-red-600">{product.shortage_count}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Total Shortage</p>
                      <p className="text-xl font-bold">{product.total_shortage_qty.toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              </CardHeader>

              {(isExpanded || true) && (
                <CardContent className={!isExpanded ? "hidden print:block" : ""}>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>IPN</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Available</TableHead>
                        <TableHead className="text-right">On Order</TableHead>
                        <TableHead className="text-right">Required</TableHead>
                        <TableHead className="text-right">Shortage</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {product.shortages.map((shortage) => (
                        <TableRow key={shortage.material_id}>
                          <TableCell className="font-mono font-medium">
                            {shortage.ipn}
                          </TableCell>
                          <TableCell className="text-muted-foreground max-w-[200px] truncate">
                            {shortage.description ?? "-"}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {shortage.quantity_available.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right font-mono text-blue-600">
                            {shortage.quantity_on_order.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {shortage.total_required.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold text-red-600">
                            {shortage.shortage.toLocaleString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
