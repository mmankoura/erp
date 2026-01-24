"use client"

import { useApi, useMutation } from "@/hooks/use-api"
import {
  api,
  type PurchaseOrder,
  type PurchaseOrderStatus,
  type Supplier,
  type Material,
  type CreatePurchaseOrderDto,
  type CreatePurchaseOrderLineDto,
} from "@/lib/api"
import { DataTable, type Column } from "@/components/data-table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Plus,
  Pencil,
  Trash2,
  MoreHorizontal,
  Send,
  CheckCircle,
  XCircle,
  Eye,
  X,
} from "lucide-react"
import { useState, useEffect } from "react"
import { toast } from "sonner"

// Status colors and labels
const statusConfig: Record<
  PurchaseOrderStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  DRAFT: { label: "Draft", variant: "secondary" },
  SUBMITTED: { label: "Submitted", variant: "outline" },
  CONFIRMED: { label: "Confirmed", variant: "default" },
  PARTIALLY_RECEIVED: { label: "Partial", variant: "outline" },
  RECEIVED: { label: "Received", variant: "default" },
  CLOSED: { label: "Closed", variant: "secondary" },
  CANCELLED: { label: "Cancelled", variant: "destructive" },
}

// Line item form state
interface LineItemForm {
  material_id: string
  quantity_ordered: number
  unit_cost: number | null
  notes: string
}

// Create/Edit PO Dialog
function PurchaseOrderDialog({
  purchaseOrder,
  onSuccess,
  trigger,
}: {
  purchaseOrder?: PurchaseOrder
  onSuccess: () => void
  trigger: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [supplierId, setSupplierId] = useState(purchaseOrder?.supplier_id || "")
  const [orderDate, setOrderDate] = useState(
    purchaseOrder?.order_date?.split("T")[0] || new Date().toISOString().split("T")[0]
  )
  const [expectedDate, setExpectedDate] = useState(
    purchaseOrder?.expected_date?.split("T")[0] || ""
  )
  const [currency, setCurrency] = useState(purchaseOrder?.currency || "USD")
  const [notes, setNotes] = useState(purchaseOrder?.notes || "")
  const [lines, setLines] = useState<LineItemForm[]>([])

  const { data: suppliers } = useApi<Supplier[]>("/suppliers")
  const { data: materials } = useApi<Material[]>("/materials")

  // Reset form when dialog opens
  useEffect(() => {
    if (open && !purchaseOrder) {
      setSupplierId("")
      setOrderDate(new Date().toISOString().split("T")[0])
      setExpectedDate("")
      setCurrency("USD")
      setNotes("")
      setLines([])
    }
  }, [open, purchaseOrder])

  const createMutation = useMutation(
    (data: CreatePurchaseOrderDto) => api.post<PurchaseOrder>("/purchase-orders", data),
    {
      onSuccess: () => {
        toast.success("Purchase order created successfully")
        setOpen(false)
        onSuccess()
      },
      onError: (error) => {
        toast.error(error.message || "Failed to create purchase order")
      },
    }
  )

  const updateMutation = useMutation(
    (data: Partial<CreatePurchaseOrderDto>) =>
      api.patch<PurchaseOrder>(`/purchase-orders/${purchaseOrder?.id}`, data),
    {
      onSuccess: () => {
        toast.success("Purchase order updated successfully")
        setOpen(false)
        onSuccess()
      },
      onError: (error) => {
        toast.error(error.message || "Failed to update purchase order")
      },
    }
  )

  const handleAddLine = () => {
    setLines([...lines, { material_id: "", quantity_ordered: 1, unit_cost: null, notes: "" }])
  }

  const handleRemoveLine = (index: number) => {
    setLines(lines.filter((_, i) => i !== index))
  }

  const handleLineChange = (index: number, field: keyof LineItemForm, value: string | number | null) => {
    const newLines = [...lines]
    newLines[index] = { ...newLines[index], [field]: value }
    setLines(newLines)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    const lineItems: CreatePurchaseOrderLineDto[] = lines
      .filter((line) => line.material_id)
      .map((line) => ({
        material_id: line.material_id,
        quantity_ordered: line.quantity_ordered,
        unit_cost: line.unit_cost || undefined,
        notes: line.notes || undefined,
      }))

    if (purchaseOrder) {
      updateMutation.mutate({
        supplier_id: supplierId,
        expected_date: expectedDate || undefined,
        currency,
        notes: notes || undefined,
      })
    } else {
      createMutation.mutate({
        supplier_id: supplierId,
        order_date: orderDate,
        expected_date: expectedDate || undefined,
        currency,
        notes: notes || undefined,
        lines: lineItems.length > 0 ? lineItems : undefined,
      })
    }
  }

  const isLoading = createMutation.isLoading || updateMutation.isLoading
  const totalAmount = lines.reduce((sum, line) => {
    if (line.unit_cost && line.quantity_ordered) {
      return sum + line.unit_cost * line.quantity_ordered
    }
    return sum
  }, 0)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {purchaseOrder ? "Edit Purchase Order" : "Create Purchase Order"}
            </DialogTitle>
            <DialogDescription>
              {purchaseOrder
                ? "Update the purchase order details."
                : "Create a new purchase order for your supplier."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Supplier and Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="supplier">Supplier *</Label>
                <Select value={supplierId} onValueChange={setSupplierId} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers?.map((supplier) => (
                      <SelectItem key={supplier.id} value={supplier.id}>
                        {supplier.name} ({supplier.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="currency">Currency</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="GBP">GBP</SelectItem>
                    <SelectItem value="CAD">CAD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="orderDate">Order Date *</Label>
                <Input
                  id="orderDate"
                  type="date"
                  value={orderDate}
                  onChange={(e) => setOrderDate(e.target.value)}
                  required
                  disabled={!!purchaseOrder}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="expectedDate">Expected Date</Label>
                <Input
                  id="expectedDate"
                  type="date"
                  value={expectedDate}
                  onChange={(e) => setExpectedDate(e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional notes..."
                rows={2}
              />
            </div>

            {/* Line Items - only for new POs */}
            {!purchaseOrder && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Line Items</Label>
                  <Button type="button" variant="outline" size="sm" onClick={handleAddLine}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add Line
                  </Button>
                </div>

                {lines.length > 0 && (
                  <div className="border rounded-md">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Material</TableHead>
                          <TableHead className="w-[100px]">Qty</TableHead>
                          <TableHead className="w-[120px]">Unit Cost</TableHead>
                          <TableHead className="w-[50px]"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {lines.map((line, index) => (
                          <TableRow key={index}>
                            <TableCell>
                              <Select
                                value={line.material_id}
                                onValueChange={(v) => handleLineChange(index, "material_id", v)}
                              >
                                <SelectTrigger className="h-8">
                                  <SelectValue placeholder="Select material" />
                                </SelectTrigger>
                                <SelectContent>
                                  {materials?.map((m) => (
                                    <SelectItem key={m.id} value={m.id}>
                                      {m.internal_part_number}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                min="1"
                                value={line.quantity_ordered}
                                onChange={(e) =>
                                  handleLineChange(index, "quantity_ordered", Number(e.target.value))
                                }
                                className="h-8"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={line.unit_cost || ""}
                                onChange={(e) =>
                                  handleLineChange(
                                    index,
                                    "unit_cost",
                                    e.target.value ? Number(e.target.value) : null
                                  )
                                }
                                placeholder="0.00"
                                className="h-8"
                              />
                            </TableCell>
                            <TableCell>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleRemoveLine(index)}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {totalAmount > 0 && (
                      <div className="px-4 py-2 text-right text-sm border-t">
                        <span className="text-muted-foreground">Total: </span>
                        <span className="font-medium">
                          {currency} {totalAmount.toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {lines.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4 border rounded-md">
                    No line items added. Click &quot;Add Line&quot; to add materials.
                  </p>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !supplierId}>
              {isLoading ? "Saving..." : purchaseOrder ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// View PO Detail Dialog
function PurchaseOrderDetailDialog({
  purchaseOrder,
  onSuccess,
  trigger,
}: {
  purchaseOrder: PurchaseOrder
  onSuccess: () => void
  trigger: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const { data: poDetail, refetch } = useApi<PurchaseOrder>(
    `/purchase-orders/${purchaseOrder.id}`,
    { enabled: open }
  )
  const { data: materials } = useApi<Material[]>("/materials", { enabled: open })

  // Line item mutations
  const addLineMutation = useMutation(
    (data: { material_id: string; quantity_ordered: number; unit_cost?: number }) =>
      api.post(`/purchase-orders/${purchaseOrder.id}/lines`, data),
    {
      onSuccess: () => {
        toast.success("Line added")
        refetch()
        onSuccess()
      },
      onError: (error) => toast.error(error.message),
    }
  )

  const deleteLineMutation = useMutation(
    (lineId: string) => api.delete(`/purchase-orders/lines/${lineId}`),
    {
      onSuccess: () => {
        toast.success("Line removed")
        refetch()
        onSuccess()
      },
      onError: (error) => toast.error(error.message),
    }
  )

  // Status mutations
  const submitMutation = useMutation(
    () => api.post(`/purchase-orders/${purchaseOrder.id}/submit`, {}),
    {
      onSuccess: () => {
        toast.success("PO submitted")
        refetch()
        onSuccess()
      },
      onError: (error) => toast.error(error.message),
    }
  )

  const confirmMutation = useMutation(
    () => api.post(`/purchase-orders/${purchaseOrder.id}/confirm`, {}),
    {
      onSuccess: () => {
        toast.success("PO confirmed")
        refetch()
        onSuccess()
      },
      onError: (error) => toast.error(error.message),
    }
  )

  const closeMutation = useMutation(
    () => api.post(`/purchase-orders/${purchaseOrder.id}/close`, {}),
    {
      onSuccess: () => {
        toast.success("PO closed")
        refetch()
        onSuccess()
      },
      onError: (error) => toast.error(error.message),
    }
  )

  const cancelMutation = useMutation(
    () => api.post(`/purchase-orders/${purchaseOrder.id}/cancel`, {}),
    {
      onSuccess: () => {
        toast.success("PO cancelled")
        refetch()
        onSuccess()
      },
      onError: (error) => toast.error(error.message),
    }
  )

  const [newLineMaterial, setNewLineMaterial] = useState("")
  const [newLineQty, setNewLineQty] = useState(1)
  const [newLineCost, setNewLineCost] = useState("")

  const handleAddLine = () => {
    if (!newLineMaterial) return
    addLineMutation.mutate({
      material_id: newLineMaterial,
      quantity_ordered: newLineQty,
      unit_cost: newLineCost ? Number(newLineCost) : undefined,
    })
    setNewLineMaterial("")
    setNewLineQty(1)
    setNewLineCost("")
  }

  const po = poDetail || purchaseOrder
  const canEdit = po.status === "DRAFT"
  const canSubmit = po.status === "DRAFT" && (po.lines?.length || 0) > 0
  const canConfirm = po.status === "SUBMITTED"
  const canClose = ["RECEIVED", "PARTIALLY_RECEIVED", "CONFIRMED"].includes(po.status)
  const canCancel = ["DRAFT", "SUBMITTED", "CONFIRMED"].includes(po.status)

  const totalAmount =
    po.lines?.reduce((sum, line) => {
      return sum + (line.unit_cost || 0) * line.quantity_ordered
    }, 0) || 0

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="flex items-center gap-2">
                {po.po_number}
                <Badge variant={statusConfig[po.status].variant}>
                  {statusConfig[po.status].label}
                </Badge>
              </DialogTitle>
              <DialogDescription>
                {po.supplier?.name} ({po.supplier?.code})
              </DialogDescription>
            </div>
            <div className="flex gap-2">
              {canSubmit && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => submitMutation.mutate(undefined)}
                  disabled={submitMutation.isLoading}
                >
                  <Send className="h-4 w-4 mr-1" />
                  Submit
                </Button>
              )}
              {canConfirm && (
                <Button
                  size="sm"
                  onClick={() => confirmMutation.mutate(undefined)}
                  disabled={confirmMutation.isLoading}
                >
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Confirm
                </Button>
              )}
              {canClose && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => closeMutation.mutate(undefined)}
                  disabled={closeMutation.isLoading}
                >
                  Close PO
                </Button>
              )}
              {canCancel && (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    if (confirm("Are you sure you want to cancel this PO?")) {
                      cancelMutation.mutate(undefined)
                    }
                  }}
                  disabled={cancelMutation.isLoading}
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  Cancel
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* PO Info */}
          <div className="grid grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Order Date</span>
              <p className="font-medium">{new Date(po.order_date).toLocaleDateString()}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Expected Date</span>
              <p className="font-medium">
                {po.expected_date ? new Date(po.expected_date).toLocaleDateString() : "-"}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Currency</span>
              <p className="font-medium">{po.currency}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Total</span>
              <p className="font-medium">
                {po.currency} {totalAmount.toFixed(2)}
              </p>
            </div>
          </div>

          {po.notes && (
            <div className="text-sm">
              <span className="text-muted-foreground">Notes: </span>
              {po.notes}
            </div>
          )}

          {/* Line Items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Line Items</h4>
            </div>

            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Material</TableHead>
                    <TableHead className="text-right">Ordered</TableHead>
                    <TableHead className="text-right">Received</TableHead>
                    <TableHead className="text-right">Unit Cost</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    {canEdit && <TableHead className="w-[50px]"></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {po.lines?.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell>{line.line_number}</TableCell>
                      <TableCell>
                        <div>
                          <span className="font-medium">
                            {line.material?.internal_part_number}
                          </span>
                          {line.material?.description && (
                            <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                              {line.material.description}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{line.quantity_ordered}</TableCell>
                      <TableCell className="text-right">
                        <span
                          className={
                            line.quantity_received >= line.quantity_ordered
                              ? "text-green-600"
                              : line.quantity_received > 0
                                ? "text-yellow-600"
                                : ""
                          }
                        >
                          {line.quantity_received}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {line.unit_cost ? `${po.currency} ${line.unit_cost.toFixed(2)}` : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {line.unit_cost
                          ? `${po.currency} ${(line.unit_cost * line.quantity_ordered).toFixed(2)}`
                          : "-"}
                      </TableCell>
                      {canEdit && (
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() => {
                              if (confirm("Remove this line?")) {
                                deleteLineMutation.mutate(line.id)
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                  {(!po.lines || po.lines.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={canEdit ? 7 : 6} className="text-center text-muted-foreground">
                        No line items
                      </TableCell>
                    </TableRow>
                  )}
                  {/* Add new line row - only in DRAFT */}
                  {canEdit && (
                    <TableRow className="bg-muted/30">
                      <TableCell></TableCell>
                      <TableCell>
                        <Select value={newLineMaterial} onValueChange={setNewLineMaterial}>
                          <SelectTrigger className="h-8">
                            <SelectValue placeholder="Add material..." />
                          </SelectTrigger>
                          <SelectContent>
                            {materials?.map((m) => (
                              <SelectItem key={m.id} value={m.id}>
                                {m.internal_part_number}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="1"
                          value={newLineQty}
                          onChange={(e) => setNewLineQty(Number(e.target.value))}
                          className="h-8 w-20 text-right"
                        />
                      </TableCell>
                      <TableCell></TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={newLineCost}
                          onChange={(e) => setNewLineCost(e.target.value)}
                          placeholder="0.00"
                          className="h-8 w-24 text-right"
                        />
                      </TableCell>
                      <TableCell></TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          onClick={handleAddLine}
                          disabled={!newLineMaterial || addLineMutation.isLoading}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function PurchaseOrdersPage() {
  const [statusFilter, setStatusFilter] = useState<string>("all")

  const endpoint =
    statusFilter === "all" ? "/purchase-orders" : `/purchase-orders?status=${statusFilter}`

  const { data: purchaseOrders, isLoading, refetch } = useApi<PurchaseOrder[]>(endpoint)

  const deleteMutation = useMutation((id: string) => api.delete(`/purchase-orders/${id}`), {
    onSuccess: () => {
      toast.success("Purchase order deleted")
      refetch()
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete purchase order")
    },
  })

  const columns: Column<PurchaseOrder>[] = [
    {
      key: "po_number",
      header: "PO #",
      cell: (po) => <span className="font-medium">{po.po_number}</span>,
    },
    {
      key: "supplier",
      header: "Supplier",
      cell: (po) => po.supplier?.name || "-",
    },
    {
      key: "status",
      header: "Status",
      cell: (po) => (
        <Badge variant={statusConfig[po.status].variant}>{statusConfig[po.status].label}</Badge>
      ),
    },
    {
      key: "order_date",
      header: "Order Date",
      cell: (po) => new Date(po.order_date).toLocaleDateString(),
    },
    {
      key: "expected_date",
      header: "Expected",
      cell: (po) => {
        if (!po.expected_date) return "-"
        const date = new Date(po.expected_date)
        const isOverdue = date < new Date() && !["RECEIVED", "CLOSED", "CANCELLED"].includes(po.status)
        return (
          <span className={isOverdue ? "text-destructive font-medium" : ""}>
            {date.toLocaleDateString()}
          </span>
        )
      },
    },
    {
      key: "total_amount",
      header: "Total",
      className: "text-right",
      cell: (po) =>
        po.total_amount ? `${po.currency} ${po.total_amount.toFixed(2)}` : "-",
    },
    {
      key: "actions",
      header: "",
      className: "w-[100px]",
      cell: (po) => (
        <div className="flex items-center gap-1">
          <PurchaseOrderDetailDialog
            purchaseOrder={po}
            onSuccess={refetch}
            trigger={
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Eye className="h-4 w-4" />
              </Button>
            }
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {po.status === "DRAFT" && (
                <>
                  <PurchaseOrderDialog
                    purchaseOrder={po}
                    onSuccess={refetch}
                    trigger={
                      <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                    }
                  />
                  <DropdownMenuSeparator />
                </>
              )}
              {po.status === "DRAFT" && (
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => {
                    if (confirm("Are you sure you want to delete this purchase order?")) {
                      deleteMutation.mutate(po.id)
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Purchase Orders</h1>
          <p className="text-muted-foreground">Manage purchase orders to suppliers</p>
        </div>
        <PurchaseOrderDialog
          onSuccess={refetch}
          trigger={
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create PO
            </Button>
          }
        />
      </div>

      {/* Status Filter */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Label htmlFor="status-filter" className="text-sm font-medium">
            Status:
          </Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]" id="status-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="DRAFT">Draft</SelectItem>
              <SelectItem value="SUBMITTED">Submitted</SelectItem>
              <SelectItem value="CONFIRMED">Confirmed</SelectItem>
              <SelectItem value="PARTIALLY_RECEIVED">Partially Received</SelectItem>
              <SelectItem value="RECEIVED">Received</SelectItem>
              <SelectItem value="CLOSED">Closed</SelectItem>
              <SelectItem value="CANCELLED">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <DataTable
        data={purchaseOrders}
        columns={columns}
        isLoading={isLoading}
        searchKey="po_number"
        searchPlaceholder="Search by PO number..."
        emptyMessage="No purchase orders found. Create your first PO to get started."
      />
    </div>
  )
}
