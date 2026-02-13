"use client"

import { useApi, useMutation } from "@/hooks/use-api"
import { api, type Order, type OrderStatus, type BomRevision } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Separator } from "@/components/ui/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ArrowLeft, Save, Truck, XCircle, Pencil, Package, FileText } from "lucide-react"
import { useState, useEffect } from "react"
import { toast } from "sonner"
import Link from "next/link"
import { useRouter, useParams } from "next/navigation"
import { MaterialReturnWorkflow } from "@/components/orders/material-return-workflow"

const orderStatusColors: Record<string, string> = {
  ENTERED: "bg-yellow-100 text-yellow-800 border-yellow-200",
  KITTING: "bg-blue-100 text-blue-800 border-blue-200",
  SMT: "bg-purple-100 text-purple-800 border-purple-200",
  TH: "bg-indigo-100 text-indigo-800 border-indigo-200",
  SHIPPED: "bg-green-100 text-green-800 border-green-200",
  ON_HOLD: "bg-orange-100 text-orange-800 border-orange-200",
  CANCELLED: "bg-red-100 text-red-800 border-red-200",
}

const statusTransitions: Record<string, OrderStatus[]> = {
  ENTERED: ["KITTING", "ON_HOLD", "CANCELLED"],
  KITTING: ["SMT", "TH", "ON_HOLD", "CANCELLED"],
  SMT: ["TH", "SHIPPED", "ON_HOLD"],
  TH: ["SHIPPED", "ON_HOLD"],
  SHIPPED: [],
  ON_HOLD: [], // Resume handled separately
  CANCELLED: [],
}

export default function OrderDetailPage() {
  const router = useRouter()
  const params = useParams()
  const orderId = params.id as string

  const [isEditing, setIsEditing] = useState(false)
  const [shipQuantity, setShipQuantity] = useState(0)

  const { data: order, isLoading, refetch } = useApi<Order>(`/orders/${orderId}`)

  // Fetch BOM revision for this order
  const { data: bomRevision } = useApi<BomRevision>(
    order?.bom_revision_id ? `/bom/revision/${order.bom_revision_id}` : "",
    { enabled: !!order?.bom_revision_id }
  )

  const [formData, setFormData] = useState({
    po_number: "",
    wo_number: "",
    quantity: 0,
    due_date: "",
    notes: "",
  })

  useEffect(() => {
    if (order) {
      setFormData({
        po_number: order.po_number || "",
        wo_number: order.wo_number || "",
        quantity: order.quantity,
        due_date: order.due_date.split("T")[0],
        notes: order.notes || "",
      })
      setShipQuantity(order.quantity - order.quantity_shipped)
    }
  }, [order])

  const updateMutation = useMutation(
    (data: typeof formData) => api.patch<Order>(`/orders/${orderId}`, {
      ...data,
      quantity: Number(data.quantity),
      po_number: data.po_number || undefined,
      wo_number: data.wo_number || undefined,
      notes: data.notes || undefined,
    }),
    {
      onSuccess: () => {
        toast.success("Order updated successfully")
        setIsEditing(false)
        refetch()
      },
      onError: (error) => {
        toast.error(error.message || "Failed to update order")
      },
    }
  )

  const statusMutation = useMutation(
    (status: OrderStatus) => api.patch<Order>(`/orders/${orderId}/status`, { status }),
    {
      onSuccess: () => {
        toast.success("Order status updated")
        refetch()
      },
      onError: (error) => {
        toast.error(error.message || "Failed to update status")
      },
    }
  )

  const shipMutation = useMutation(
    (quantity: number) => api.post<Order>(`/orders/${orderId}/ship`, { quantity }),
    {
      onSuccess: (updatedOrder) => {
        toast.success(`Shipped ${shipQuantity} units`)
        refetch()
      },
      onError: (error) => {
        toast.error(error.message || "Failed to record shipment")
      },
    }
  )

  const cancelMutation = useMutation(
    (_: void) => api.post<Order>(`/orders/${orderId}/cancel`, {}),
    {
      onSuccess: () => {
        toast.success("Order cancelled")
        refetch()
      },
      onError: (error) => {
        toast.error(error.message || "Failed to cancel order")
      },
    }
  )

  const handleSave = () => {
    updateMutation.mutate(formData)
  }

  const handleShip = () => {
    if (shipQuantity > 0) {
      shipMutation.mutate(shipQuantity)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold">Order not found</h2>
        <Button asChild className="mt-4">
          <Link href="/orders">Back to Orders</Link>
        </Button>
      </div>
    )
  }

  const canEdit = !["SHIPPED", "CANCELLED"].includes(order.status)
  const canShip = ["SMT", "TH"].includes(order.status) && order.quantity_shipped < order.quantity
  const canCancel = ["ENTERED", "KITTING"].includes(order.status) // Can only cancel before production
  const availableTransitions = statusTransitions[order.status] || []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/orders">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{order.order_number}</h1>
              <Badge variant="outline" className={orderStatusColors[order.status]}>
                {order.status.replace("_", " ")}
              </Badge>
              <Badge variant="secondary">{order.order_type}</Badge>
            </div>
            <p className="text-muted-foreground">
              {order.customer?.name} - {order.product?.name}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {canEdit && !isEditing && (
            <Button variant="outline" onClick={() => setIsEditing(true)}>
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </Button>
          )}
          {isEditing && (
            <>
              <Button variant="outline" onClick={() => setIsEditing(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={updateMutation.isLoading}>
                <Save className="h-4 w-4 mr-2" />
                Save
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Order Information */}
        <Card>
          <CardHeader>
            <CardTitle>Order Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground">Customer</Label>
                <p className="font-medium">{order.customer?.name}</p>
                <p className="text-sm text-muted-foreground">{order.customer?.code}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Product</Label>
                <p className="font-medium">{order.product?.name}</p>
                <p className="text-sm text-muted-foreground">{order.product?.part_number}</p>
              </div>
            </div>

            <Separator />

            {isEditing ? (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="quantity">Quantity</Label>
                    <Input
                      id="quantity"
                      type="number"
                      min={order.quantity_shipped || 1}
                      value={formData.quantity}
                      onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="due_date">Due Date</Label>
                    <Input
                      id="due_date"
                      type="date"
                      value={formData.due_date}
                      onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="po_number">Customer PO</Label>
                    <Input
                      id="po_number"
                      value={formData.po_number}
                      onChange={(e) => setFormData({ ...formData, po_number: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="wo_number">Work Order</Label>
                    <Input
                      id="wo_number"
                      value={formData.wo_number}
                      onChange={(e) => setFormData({ ...formData, wo_number: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={3}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">Quantity</Label>
                    <p className="font-medium">{order.quantity.toLocaleString()}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Due Date</Label>
                    <p className="font-medium">{new Date(order.due_date).toLocaleDateString()}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">Customer PO</Label>
                    <p className="font-medium">{order.po_number || "-"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Work Order</Label>
                    <p className="font-medium">{order.wo_number || "-"}</p>
                  </div>
                </div>
                {order.notes && (
                  <div>
                    <Label className="text-muted-foreground">Notes</Label>
                    <p className="text-sm">{order.notes}</p>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Status & Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Status & Shipping</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Shipping Progress */}
            <div>
              <Label className="text-muted-foreground">Shipping Progress</Label>
              <div className="mt-2">
                <div className="flex justify-between text-sm mb-1">
                  <span>{order.quantity_shipped.toLocaleString()} shipped</span>
                  <span>{order.quantity.toLocaleString()} total</span>
                </div>
                <div className="w-full bg-secondary rounded-full h-2.5">
                  <div
                    className="bg-primary h-2.5 rounded-full transition-all"
                    style={{ width: `${(order.quantity_shipped / order.quantity) * 100}%` }}
                  ></div>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {order.quantity - order.quantity_shipped} remaining
                </p>
              </div>
            </div>

            <Separator />

            {/* Status Transition */}
            {availableTransitions.length > 0 && (
              <div>
                <Label className="text-muted-foreground">Update Status</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {availableTransitions
                    .filter(s => s !== "CANCELLED")
                    .map((status) => (
                      <Button
                        key={status}
                        variant="outline"
                        size="sm"
                        onClick={() => statusMutation.mutate(status)}
                        disabled={statusMutation.isLoading}
                      >
                        {status.replace("_", " ")}
                      </Button>
                    ))}
                </div>
              </div>
            )}

            {/* Ship Units */}
            {canShip && (
              <div>
                <Label className="text-muted-foreground">Record Shipment</Label>
                <div className="flex items-center gap-2 mt-2">
                  <Input
                    type="number"
                    min={1}
                    max={order.quantity - order.quantity_shipped}
                    value={shipQuantity}
                    onChange={(e) => setShipQuantity(parseInt(e.target.value) || 0)}
                    className="w-32"
                  />
                  <Button onClick={handleShip} disabled={shipMutation.isLoading || shipQuantity <= 0}>
                    <Truck className="h-4 w-4 mr-2" />
                    Ship
                  </Button>
                </div>
              </div>
            )}

            <Separator />

            {/* Cancel Order */}
            {canCancel && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" className="w-full">
                    <XCircle className="h-4 w-4 mr-2" />
                    Cancel Order
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Cancel Order?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will cancel order {order.order_number}. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep Order</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => cancelMutation.mutate(undefined)}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Cancel Order
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}

            {/* Timestamps */}
            <div className="text-sm text-muted-foreground space-y-1">
              <p>Created: {new Date(order.created_at).toLocaleString()}</p>
              <p>Updated: {new Date(order.updated_at).toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* BOM / Material Requirements */}
      {bomRevision && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Bill of Materials
                </CardTitle>
                <CardDescription>
                  Revision {bomRevision.revision_number} - {bomRevision.items?.length || 0} line items
                </CardDescription>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Order Quantity</p>
                <p className="text-2xl font-bold">{order.quantity.toLocaleString()}</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {bomRevision.items && bomRevision.items.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px]">Line</TableHead>
                      <TableHead>Internal P/N</TableHead>
                      <TableHead>Alternate IPN</TableHead>
                      <TableHead>Manufacturer</TableHead>
                      <TableHead>Manufacturer P/N</TableHead>
                      <TableHead className="text-right w-[100px]">Qty Per</TableHead>
                      <TableHead className="text-right w-[120px]">Total Qty Req</TableHead>
                      <TableHead>Ref Des</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bomRevision.items
                      .sort((a, b) => (a.line_number || 0) - (b.line_number || 0))
                      .map((item) => {
                        const totalQty = item.quantity_required * order.quantity
                        return (
                          <TableRow key={item.id}>
                            <TableCell className="font-mono text-sm">
                              {item.line_number || "-"}
                            </TableCell>
                            <TableCell>
                              <span className="font-medium">
                                {item.material?.internal_part_number || "-"}
                              </span>
                            </TableCell>
                            <TableCell className="text-sm">
                              {item.alternate_ipn || "-"}
                            </TableCell>
                            <TableCell className="text-sm">
                              {item.material?.manufacturer || "-"}
                            </TableCell>
                            <TableCell className="text-sm">
                              {item.material?.manufacturer_pn || "-"}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {item.quantity_required}
                            </TableCell>
                            <TableCell className="text-right font-mono font-bold">
                              {totalQty.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-sm font-mono max-w-[150px] truncate" title={item.reference_designators || ""}>
                              {item.reference_designators || "-"}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <p>No items in this BOM revision</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* No BOM Warning */}
      {order && !order.bom_revision_id && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="py-6">
            <div className="flex items-center gap-3 text-yellow-800">
              <FileText className="h-5 w-5" />
              <div>
                <p className="font-medium">No BOM Revision Linked</p>
                <p className="text-sm">This order does not have a bill of materials attached.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Material Return Workflow - show for orders in production stages */}
      {order && ["KITTING", "SMT", "TH"].includes(order.status) && order.bom_revision_id && (
        <MaterialReturnWorkflow order={order} onUpdate={() => refetch()} />
      )}
    </div>
  )
}
