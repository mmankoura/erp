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
import { Cpu, CircuitBoard, Wrench, LayoutGrid, CheckCircle } from "lucide-react"
import type { ResourceTypeShortage } from "@/lib/api"

interface ShortageByResourceTypeProps {
  resourceTypes: ResourceTypeShortage[] | null
  isLoading: boolean
}

function getResourceTypeIcon(type: string) {
  switch (type) {
    case "SMT":
      return <Cpu className="h-5 w-5" />
    case "TH":
      return <CircuitBoard className="h-5 w-5" />
    case "MECH":
      return <Wrench className="h-5 w-5" />
    case "PCB":
      return <LayoutGrid className="h-5 w-5" />
    default:
      return <CircuitBoard className="h-5 w-5" />
  }
}

function getResourceTypeLabel(type: string) {
  switch (type) {
    case "SMT":
      return "Surface Mount (SMT)"
    case "TH":
      return "Through-Hole (TH)"
    case "MECH":
      return "Mechanical"
    case "PCB":
      return "PCB / Bare Board"
    case "DNP":
      return "Do Not Place"
    case "UNKNOWN":
      return "Unknown Type"
    default:
      return type
  }
}

function getResourceTypeColor(type: string) {
  switch (type) {
    case "SMT":
      return "bg-blue-100 text-blue-800 border-blue-200"
    case "TH":
      return "bg-green-100 text-green-800 border-green-200"
    case "MECH":
      return "bg-yellow-100 text-yellow-800 border-yellow-200"
    case "PCB":
      return "bg-purple-100 text-purple-800 border-purple-200"
    default:
      return "bg-gray-100 text-gray-800 border-gray-200"
  }
}

export function ShortageByResourceType({ resourceTypes, isLoading }: ShortageByResourceTypeProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-48 w-full" />
        ))}
      </div>
    )
  }

  if (!resourceTypes || resourceTypes.length === 0) {
    return (
      <div className="text-center py-12">
        <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
        <p className="text-lg font-medium text-green-600">No Shortages by Part Type</p>
        <p className="text-muted-foreground">
          All part types have sufficient inventory.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4 print:grid-cols-4">
        {resourceTypes.map((rt) => (
          <Card key={rt.resource_type} className={`border-2 ${getResourceTypeColor(rt.resource_type)}`}>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                {getResourceTypeIcon(rt.resource_type)}
                <CardTitle className="text-sm font-medium">{rt.resource_type}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{rt.total_materials_short}</div>
              <p className="text-xs text-muted-foreground">materials short</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Detail Cards per Resource Type */}
      {resourceTypes.map((rt) => (
        <Card key={rt.resource_type} className="print:break-inside-avoid">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {getResourceTypeIcon(rt.resource_type)}
                <div>
                  <CardTitle>{getResourceTypeLabel(rt.resource_type)}</CardTitle>
                  <CardDescription>
                    {rt.total_materials_short} materials, {rt.total_shortage_quantity.toLocaleString()} units short
                  </CardDescription>
                </div>
              </div>
              <Badge variant="destructive" className="text-lg px-3 py-1">
                {rt.total_materials_short}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>IPN</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Available</TableHead>
                  <TableHead className="text-right">On Order</TableHead>
                  <TableHead className="text-right">Required</TableHead>
                  <TableHead className="text-right">Shortage</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rt.materials.map((material) => (
                  <TableRow key={material.material_id}>
                    <TableCell className="font-mono font-medium">
                      {material.ipn}
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-[200px] truncate">
                      {material.description ?? "-"}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {material.quantity_available.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono text-blue-600">
                      {material.quantity_on_order.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {material.total_required.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold text-red-600">
                      {material.shortage.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline">{material.affected_orders_count}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
