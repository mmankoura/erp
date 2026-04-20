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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ArrowLeft, Save, Truck, XCircle, Pencil, Package, FileText, PackageCheck, PackageX, Play, CheckCircle, Loader2 } from "lucide-react"
import { useState, useEffect } from "react"
import { toast } from "sonner"
import Link from "next/link"
import { useRouter, useParams } from "next/navigation"
import { MaterialReturnWorkflow } from "@/components/orders/material-return-workflow"
import { useAuth } from "@/contexts/auth-context"

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
  const { user } = useAuth()

  const [isEditing, setIsEditing] = useState(false)
  const [shipQuantity, setShipQuantity] = useState(0)

  const { data: order, isLoading, refetch } = useApi<Order>(`/orders/${orderId}`)

  // Fetch BOM revision for this order
  const { data: bomRevision } = useApi<BomRevision>(
    order?.bom_revision_id ? `/bom/revision/${order.bom_revision_id}` : "",
    { enabled: !!order?.bom_revision_id }
  )

  // Allocations for this order
  const { data: allocations, refetch: refetchAllocations } = useApi<
    Array<{ id: string; material_id: string; quantity: number; status: string }>
  >(
    orderId ? `/inventory/allocations/order/${orderId}` : "",
    { enabled: !!orderId }
  )

  const hasActiveAllocations = (allocations ?? []).some((a) => a.status === "ACTIVE")

  // Supply sources for this order
  const { data: supplySources, refetch: refetchSources } = useApi<
    Array<{ id: string; order_id: string; material_id: string; supply_source: "COMPANY" | "CUSTOMER"; material: { internal_part_number: string } }>
  >(
    orderId ? `/orders/${orderId}/supply-sources` : "",
    { enabled: !!orderId }
  )

  const supplySourceMap = new Map(
    supplySources?.map((s) => [s.material_id, s.supply_source]) ?? []
  )

  const toggleSupplySource = async (materialId: string) => {
    const current = supplySourceMap.get(materialId) ?? "COMPANY"
    const next = current === "COMPANY" ? "CUSTOMER" : "COMPANY"
    try {
      await api.patch(`/orders/${orderId}/supply-sources`, {
        updates: [{ material_id: materialId, supply_source: next }],
      })
      refetchSources()
      toast.success(`Supply source updated to ${next === "COMPANY" ? "AT&A" : (order?.customer?.name ?? "Customer")}`)
    } catch {
      toast.error("Failed to update supply source")
    }
  }

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

  const allocateMutation = useMutation(
    (_: void) => api.post<{
      order_id: string
      order_number: string
      total_materials: number
      fully_allocated: number
      partially_allocated: number
      not_allocated: number
    }>("/inventory/allocate-for-order", {
      order_id: orderId,
      allocate_available_only: true,
    }),
    {
      onSuccess: (result) => {
        if (result.not_allocated === 0) {
          toast.success(`All ${result.total_materials} materials fully allocated`)
        } else if (result.fully_allocated > 0 || result.partially_allocated > 0) {
          toast.success(
            `Allocated: ${result.fully_allocated} full, ${result.partially_allocated} partial, ${result.not_allocated} unavailable`
          )
        } else {
          toast.error("No materials could be allocated — insufficient inventory")
        }
        refetch()
        refetchAllocations()
      },
      onError: (error) => {
        toast.error(error.message || "Failed to allocate materials")
      },
    }
  )

  const deallocateMutation = useMutation(
    (_: void) => api.delete<{ cancelled: number }>(`/inventory/allocations/order/${orderId}`),
    {
      onSuccess: (result) => {
        toast.success(`${result.cancelled} allocation(s) released`)
        refetch()
        refetchAllocations()
      },
      onError: (error) => {
        toast.error(error.message || "Failed to deallocate materials")
      },
    }
  )

  // Production stage transitions
  const [stageDialog, setStageDialog] = useState<{
    open: boolean
    fromStage: string
    toStage: string
    label: string
  }>({ open: false, fromStage: "", toStage: "", label: "" })
  const [stageQty, setStageQty] = useState("")
  const [consumptionPreview, setConsumptionPreview] = useState<
    Array<{ material_id: string; ipn: string; description: string | null; resource_type: string; qty_to_consume: number }>
  >([])
  const [loadingPreview, setLoadingPreview] = useState(false)

  const openStageDialog = async (fromStage: string, toStage: string, label: string) => {
    const defaultQty = order ? getStageQty(order, fromStage) : 0
    setStageDialog({ open: true, fromStage, toStage, label })
    setStageQty(String(defaultQty))
    setConsumptionPreview([])

    // Load consumption preview if moving out of SMT or TH
    if (fromStage === "SMT" || fromStage === "TH") {
      setLoadingPreview(true)
      try {
        const preview = await api.get<
          Array<{ material_id: string; ipn: string; description: string | null; resource_type: string; qty_to_consume: number }>
        >(`/production/order/${orderId}/consumption-preview?from_stage=${fromStage}&quantity=${defaultQty}`)
        setConsumptionPreview(preview)
      } catch {
        setConsumptionPreview([])
      } finally {
        setLoadingPreview(false)
      }
    }
  }

  const updatePreview = async (qty: string) => {
    setStageQty(qty)
    const numQty = parseInt(qty, 10)
    if (!numQty || numQty <= 0) return
    if (stageDialog.fromStage === "SMT" || stageDialog.fromStage === "TH") {
      try {
        const preview = await api.get<
          Array<{ material_id: string; ipn: string; description: string | null; resource_type: string; qty_to_consume: number }>
        >(`/production/order/${orderId}/consumption-preview?from_stage=${stageDialog.fromStage}&quantity=${numQty}`)
        setConsumptionPreview(preview)
      } catch {
        // ignore
      }
    }
  }

  const stageMutation = useMutation(
    (vars: { from_stage: string; to_stage: string; quantity: number }) =>
      api.post(`/production/order/${orderId}/move`, {
        from_stage: vars.from_stage,
        to_stage: vars.to_stage,
        quantity: vars.quantity,
        created_by: user?.username,
      }),
    {
      onSuccess: () => {
        toast.success(`Stage updated: ${stageDialog.label}`)
        setStageDialog({ open: false, fromStage: "", toStage: "", label: "" })
        refetch()
        refetchAllocations()
      },
      onError: (error) => {
        toast.error(error.message || "Failed to update stage")
      },
    }
  )

  const startProductionMutation = useMutation(
    (_: void) =>
      api.post(`/production/order/${orderId}/start`, {
        quantity: order?.quantity,
        created_by: user?.username,
      }),
    {
      onSuccess: () => {
        toast.success("Production started — units moved to kitting")
        refetch()
      },
      onError: (error) => {
        toast.error(error.message || "Failed to start production")
      },
    }
  )

  const handleSave = () => {
    updateMutation.mutate(formData)
  }

  const getStageQty = (o: Order, stage: string): number => {
    switch (stage) {
      case "NOT_STARTED": return o.quantity - o.quantity_in_kitting - o.quantity_in_smt - o.quantity_in_th - o.quantity_completed - o.quantity_shipped
      case "KITTING": return o.quantity_in_kitting
      case "SMT": return o.quantity_in_smt
      case "TH": return o.quantity_in_th
      case "COMPLETED": return o.quantity_completed
      default: return 0
    }
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

            {/* Production Stage Actions */}
            {!["SHIPPED", "CANCELLED"].includes(order.status) && (
              <div>
                <Label className="text-muted-foreground">Production</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {/* Start Kitting — from ENTERED */}
                  {order.status === "ENTERED" && (
                    <Button
                      size="sm"
                      onClick={() => startProductionMutation.mutate(undefined)}
                      disabled={startProductionMutation.isLoading}
                    >
                      <Play className="h-4 w-4 mr-1" />
                      {startProductionMutation.isLoading ? "Starting..." : "Start Kitting"}
                    </Button>
                  )}

                  {/* From KITTING → SMT or TH */}
                  {order.quantity_in_kitting > 0 && (
                    <>
                      {(order.production_type === "SMT_AND_TH" || order.production_type === "SMT_ONLY") && (
                        <Button size="sm" variant="outline" onClick={() => openStageDialog("KITTING", "SMT", "Start SMT")}>
                          Start SMT ({order.quantity_in_kitting})
                        </Button>
                      )}
                      {order.production_type === "TH_ONLY" && (
                        <Button size="sm" variant="outline" onClick={() => openStageDialog("KITTING", "TH", "Start TH")}>
                          Start TH ({order.quantity_in_kitting})
                        </Button>
                      )}
                    </>
                  )}

                  {/* Complete SMT → TH or COMPLETED */}
                  {order.quantity_in_smt > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openStageDialog(
                        "SMT",
                        order.production_type === "SMT_ONLY" ? "COMPLETED" : "TH",
                        order.production_type === "SMT_ONLY" ? "Complete SMT" : "Complete SMT → TH"
                      )}
                    >
                      <CheckCircle className="h-4 w-4 mr-1" />
                      Complete SMT ({order.quantity_in_smt})
                    </Button>
                  )}

                  {/* Complete TH → COMPLETED */}
                  {order.quantity_in_th > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openStageDialog("TH", "COMPLETED", "Complete TH")}
                    >
                      <CheckCircle className="h-4 w-4 mr-1" />
                      Complete TH ({order.quantity_in_th})
                    </Button>
                  )}

                  {/* WIP summary */}
                  <div className="w-full text-xs text-muted-foreground mt-1 space-x-3">
                    {order.quantity_in_kitting > 0 && <span>Kitting: {order.quantity_in_kitting}</span>}
                    {order.quantity_in_smt > 0 && <span>SMT: {order.quantity_in_smt}</span>}
                    {order.quantity_in_th > 0 && <span>TH: {order.quantity_in_th}</span>}
                    {order.quantity_completed > 0 && <span>Completed: {order.quantity_completed}</span>}
                    {order.quantity_shipped > 0 && <span>Shipped: {order.quantity_shipped}</span>}
                  </div>
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

            {/* Material Allocation */}
            {order.bom_revision_id && !["SHIPPED", "CANCELLED"].includes(order.status) && (
              <>
                <Separator />
                <div>
                  <Label className="text-muted-foreground">Material Allocation</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => allocateMutation.mutate(undefined)}
                      disabled={allocateMutation.isLoading || deallocateMutation.isLoading || hasActiveAllocations}
                    >
                      <PackageCheck className="h-4 w-4 mr-2" />
                      {allocateMutation.isLoading ? "Allocating..." : hasActiveAllocations ? "Allocated" : "Allocate Materials"}
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={allocateMutation.isLoading || deallocateMutation.isLoading || !hasActiveAllocations}
                        >
                          <PackageX className="h-4 w-4 mr-2" />
                          Deallocate
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Deallocate Materials?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will release all active material allocations for order {order.order_number}.
                            The inventory will become available for other orders.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deallocateMutation.mutate(undefined)}>
                            Deallocate
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </>
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
                      <TableHead className="w-[140px]">Supply Source</TableHead>
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
                            <TableCell>
                              {item.material_id && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    toggleSupplySource(item.material_id)
                                  }}
                                  className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors ${
                                    supplySourceMap.get(item.material_id) === "CUSTOMER"
                                      ? "bg-blue-100 text-blue-800 hover:bg-blue-200"
                                      : "bg-green-100 text-green-800 hover:bg-green-200"
                                  }`}
                                >
                                  {supplySourceMap.get(item.material_id) === "CUSTOMER"
                                    ? (order?.customer?.name ?? "Customer")
                                    : "AT&A"}
                                </button>
                              )}
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

      {/* Stage Transition Dialog with Consumption Preview */}
      <Dialog open={stageDialog.open} onOpenChange={(open) => {
        if (!open) setStageDialog({ open: false, fromStage: "", toStage: "", label: "" })
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{stageDialog.label}</DialogTitle>
            <DialogDescription>
              Enter the quantity to move from {stageDialog.fromStage} to {stageDialog.toStage}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Quantity</Label>
              <Input
                type="number"
                value={stageQty}
                onChange={(e) => updatePreview(e.target.value)}
                min={1}
                max={order ? getStageQty(order, stageDialog.fromStage) : 0}
              />
              <p className="text-xs text-muted-foreground">
                {order ? getStageQty(order, stageDialog.fromStage) : 0} units available in {stageDialog.fromStage}
              </p>
            </div>

            {/* Consumption Preview */}
            {(stageDialog.fromStage === "SMT" || stageDialog.fromStage === "TH") && (
              <div>
                <Label className="text-muted-foreground">Materials to be consumed</Label>
                {loadingPreview ? (
                  <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading preview...
                  </div>
                ) : consumptionPreview.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">No materials to consume at this stage.</p>
                ) : (
                  <div className="border rounded-md mt-2 max-h-[300px] overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium">IPN</th>
                          <th className="text-left px-3 py-2 font-medium">Type</th>
                          <th className="text-right px-3 py-2 font-medium">Qty</th>
                        </tr>
                      </thead>
                      <tbody>
                        {consumptionPreview.map((item) => (
                          <tr key={item.material_id} className="border-t">
                            <td className="px-3 py-1.5">
                              <span className="font-medium">{item.ipn}</span>
                              {item.description && (
                                <p className="text-xs text-muted-foreground truncate max-w-[200px]">{item.description}</p>
                              )}
                            </td>
                            <td className="px-3 py-1.5 text-muted-foreground">{item.resource_type}</td>
                            <td className="px-3 py-1.5 text-right font-mono">{item.qty_to_consume.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setStageDialog({ open: false, fromStage: "", toStage: "", label: "" })}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const qty = parseInt(stageQty, 10)
                if (qty > 0) {
                  stageMutation.mutate({
                    from_stage: stageDialog.fromStage,
                    to_stage: stageDialog.toStage,
                    quantity: qty,
                  })
                }
              }}
              disabled={stageMutation.isLoading || !stageQty || parseInt(stageQty, 10) <= 0}
            >
              {stageMutation.isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : consumptionPreview.length > 0 ? (
                "Confirm & Consume"
              ) : (
                "Confirm"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
