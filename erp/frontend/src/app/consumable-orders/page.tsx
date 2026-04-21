"use client"

import { useState } from "react"
import { useApi, useMutation } from "@/hooks/use-api"
import { api } from "@/lib/api"
import { DataTable, type Column } from "@/components/data-table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
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
import { Plus, Trash2, CheckCircle, ClipboardList, Pencil, Undo2 } from "lucide-react"
import { toast } from "sonner"
import { useAuth } from "@/contexts/auth-context"

interface ConsumableOrderLine {
  id: string
  ata_part_number: string | null
  description: string
  manufacturer: string | null
  manufacturer_pn: string | null
  quantity: number
  unit_cost: number | null
  customer: string | null
  line_number: number | null
  notes: string | null
}

interface ConsumableOrder {
  id: string
  order_number: string
  supplier: string
  status: "ORDERED" | "RECEIVED"
  order_date: string
  expected_date: string | null
  currency: string
  notes: string | null
  created_by: string | null
  lines: ConsumableOrderLine[]
  created_at: string
}

interface NewLine {
  ata_part_number: string
  description: string
  manufacturer: string
  manufacturer_pn: string
  quantity: string
  unit_cost: string
  customer: string
  notes: string
}

const emptyLine: NewLine = {
  ata_part_number: "",
  description: "",
  manufacturer: "",
  manufacturer_pn: "",
  quantity: "1",
  unit_cost: "",
  customer: "",
  notes: "",
}

export default function ConsumableOrdersPage() {
  const { user } = useAuth()
  const [createOpen, setCreateOpen] = useState(false)
  const [filterStatus, setFilterStatus] = useState<string>("")

  // Form state
  const [supplier, setSupplier] = useState("")
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split("T")[0])
  const [expectedDate, setExpectedDate] = useState("")
  const [currency, setCurrency] = useState("CAD")
  const [notes, setNotes] = useState("")
  const [lines, setLines] = useState<NewLine[]>([{ ...emptyLine }])

  const { data: orders, isLoading, refetch } = useApi<ConsumableOrder[]>(
    filterStatus ? `/consumable-orders?status=${filterStatus}` : "/consumable-orders"
  )

  const createMutation = useMutation(
    (data: unknown) => api.post<ConsumableOrder>("/consumable-orders", data),
    {
      onSuccess: (result) => {
        toast.success(`Consumable order ${result.order_number} created`)
        setCreateOpen(false)
        resetForm()
        refetch()
      },
      onError: (error) => toast.error(error.message || "Failed to create order"),
    }
  )

  const receiveMutation = useMutation(
    (id: string) => api.post<ConsumableOrder>(`/consumable-orders/${id}/receive`, {}),
    {
      onSuccess: () => {
        toast.success("Order marked as received")
        refetch()
      },
      onError: (error) => toast.error(error.message || "Failed to mark as received"),
    }
  )

  const undoReceiveMutation = useMutation(
    (id: string) => api.post<ConsumableOrder>(`/consumable-orders/${id}/undo-receive`, {}),
    {
      onSuccess: () => {
        toast.success("Receiving undone — order back to ORDERED")
        refetch()
      },
      onError: (error) => toast.error(error.message || "Failed to undo receive"),
    }
  )

  const updateMutation = useMutation(
    ({ id, data }: { id: string; data: unknown }) => api.patch<ConsumableOrder>(`/consumable-orders/${id}`, data),
    {
      onSuccess: () => {
        toast.success("Order updated")
        setEditOrder(null)
        refetch()
      },
      onError: (error) => toast.error(error.message || "Failed to update order"),
    }
  )

  const [editOrder, setEditOrder] = useState<ConsumableOrder | null>(null)

  const deleteMutation = useMutation(
    (id: string) => api.delete(`/consumable-orders/${id}`),
    {
      onSuccess: () => {
        toast.success("Order deleted")
        refetch()
      },
      onError: (error) => toast.error(error.message || "Failed to delete order"),
    }
  )

  const resetForm = () => {
    setSupplier("")
    setOrderDate(new Date().toISOString().split("T")[0])
    setExpectedDate("")
    setCurrency("CAD")
    setNotes("")
    setLines([{ ...emptyLine }])
  }

  const handleCreate = () => {
    const validLines = lines.filter((l) => l.description.trim())
    if (!supplier.trim()) { toast.error("Supplier is required"); return }
    if (validLines.length === 0) { toast.error("At least one line item is required"); return }

    createMutation.mutate({
      supplier: supplier.trim(),
      order_date: orderDate,
      expected_date: expectedDate || undefined,
      currency,
      notes: notes || undefined,
      created_by: user?.username,
      lines: validLines.map((l) => ({
        ata_part_number: l.ata_part_number || undefined,
        description: l.description,
        manufacturer: l.manufacturer || undefined,
        manufacturer_pn: l.manufacturer_pn || undefined,
        quantity: parseFloat(l.quantity) || 1,
        unit_cost: l.unit_cost ? parseFloat(l.unit_cost) : undefined,
        customer: l.customer || undefined,
        notes: l.notes || undefined,
      })),
    })
  }

  const updateLine = (index: number, field: keyof NewLine, value: string) => {
    const updated = [...lines]
    updated[index] = { ...updated[index], [field]: value }
    setLines(updated)
  }

  const addLine = () => setLines([...lines, { ...emptyLine }])
  const removeLine = (index: number) => {
    if (lines.length <= 1) return
    setLines(lines.filter((_, i) => i !== index))
  }

  const columns: Column<ConsumableOrder>[] = [
    {
      key: "order_number",
      header: "Order #",
      defaultWidth: 180,
      sortable: true,
      filterable: true,
      sortAccessor: (o) => o.order_number,
      filterAccessor: (o) => o.order_number,
      cell: (o) => <span className="font-mono font-medium">{o.order_number}</span>,
    },
    {
      key: "supplier",
      header: "Supplier",
      defaultWidth: 180,
      sortable: true,
      filterable: true,
      sortAccessor: (o) => o.supplier,
      filterAccessor: (o) => o.supplier,
    },
    {
      key: "items",
      header: "Items",
      defaultWidth: 300,
      cell: (o) => (
        <div className="text-sm space-y-0.5">
          {o.lines.slice(0, 3).map((l) => (
            <div key={l.id} className="truncate max-w-[280px]">
              {l.ata_part_number && <span className="font-medium">{l.ata_part_number} — </span>}
              {l.description}
              {l.customer && <span className="text-muted-foreground ml-1">({l.customer})</span>}
            </div>
          ))}
          {o.lines.length > 3 && (
            <span className="text-muted-foreground">+{o.lines.length - 3} more</span>
          )}
        </div>
      ),
    },
    {
      key: "total",
      header: "Total",
      defaultWidth: 100,
      className: "text-right",
      sortable: true,
      sortAccessor: (o) => o.lines.reduce((sum, l) => sum + (parseFloat(String(l.quantity)) * parseFloat(String(l.unit_cost ?? 0))), 0),
      cell: (o) => {
        const total = o.lines.reduce((sum, l) => sum + (parseFloat(String(l.quantity)) * parseFloat(String(l.unit_cost ?? 0))), 0)
        return <span className="font-mono">{total > 0 ? `${total.toFixed(2)} ${o.currency}` : "—"}</span>
      },
    },
    {
      key: "order_date",
      header: "Order Date",
      defaultWidth: 110,
      sortable: true,
      sortAccessor: (o) => new Date(o.order_date).getTime(),
      cell: (o) => new Date(o.order_date).toLocaleDateString(),
    },
    {
      key: "status",
      header: "Status",
      defaultWidth: 110,
      sortable: true,
      filterable: true,
      sortAccessor: (o) => o.status,
      filterAccessor: (o) => o.status,
      cell: (o) => (
        <Badge className={o.status === "RECEIVED"
          ? "bg-green-100 text-green-800 border-green-200"
          : "bg-blue-100 text-blue-800 border-blue-200"
        }>
          {o.status}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      defaultWidth: 140,
      cell: (o) => (
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="Edit"
            onClick={(e) => {
              e.stopPropagation()
              setEditOrder(o)
            }}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          {o.status === "ORDERED" && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              title="Mark Received"
              onClick={(e) => {
                e.stopPropagation()
                receiveMutation.mutate(o.id)
              }}
            >
              <CheckCircle className="h-4 w-4 text-green-600" />
            </Button>
          )}
          {o.status === "RECEIVED" && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              title="Undo Receive"
              onClick={(e) => {
                e.stopPropagation()
                undoReceiveMutation.mutate(o.id)
              }}
            >
              <Undo2 className="h-4 w-4 text-orange-600" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive"
            title="Delete"
            onClick={(e) => {
              e.stopPropagation()
              if (confirm("Delete this consumable order?")) {
                deleteMutation.mutate(o.id)
              }
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardList className="h-6 w-6" />
            Consumable Orders
          </h1>
          <p className="text-muted-foreground mt-1">
            Track orders for production consumables (solder paste, stencils, etc.)
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={filterStatus || "__all__"} onValueChange={(v) => setFilterStatus(v === "__all__" ? "" : v)}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Statuses</SelectItem>
              <SelectItem value="ORDERED">Ordered</SelectItem>
              <SelectItem value="RECEIVED">Received</SelectItem>
            </SelectContent>
          </Select>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Order
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>New Consumable Order</DialogTitle>
                <DialogDescription>
                  Order number will be auto-generated (CON-YYYYMMDD-NNN)
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-1.5">
                    <Label>Supplier *</Label>
                    <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Supplier name" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Order Date</Label>
                    <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Expected Date</Label>
                    <Input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Currency</Label>
                    <Select value={currency} onValueChange={setCurrency}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CAD">CAD</SelectItem>
                        <SelectItem value="USD">USD</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Notes</Label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" rows={2} />
                </div>

                {/* Line items */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>Line Items</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addLine}>
                      <Plus className="h-3 w-3 mr-1" /> Add Line
                    </Button>
                  </div>
                  <div className="space-y-3">
                    {lines.map((line, idx) => (
                      <div key={idx} className="grid grid-cols-8 gap-2 items-end border rounded-md p-3 bg-muted/30">
                        <div className="col-span-1 space-y-1">
                          <Label className="text-xs">AT&A P/N</Label>
                          <Input value={line.ata_part_number} onChange={(e) => updateLine(idx, "ata_part_number", e.target.value)} placeholder="P/N" className="h-8 text-sm" />
                        </div>
                        <div className="col-span-2 space-y-1">
                          <Label className="text-xs">Description *</Label>
                          <Input value={line.description} onChange={(e) => updateLine(idx, "description", e.target.value)} placeholder="Description" className="h-8 text-sm" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">MFR</Label>
                          <Input value={line.manufacturer} onChange={(e) => updateLine(idx, "manufacturer", e.target.value)} placeholder="MFR" className="h-8 text-sm" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">MFR P/N</Label>
                          <Input value={line.manufacturer_pn} onChange={(e) => updateLine(idx, "manufacturer_pn", e.target.value)} placeholder="MFR P/N" className="h-8 text-sm" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Qty</Label>
                          <Input type="number" value={line.quantity} onChange={(e) => updateLine(idx, "quantity", e.target.value)} className="h-8 text-sm" min="0" step="any" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Unit Cost</Label>
                          <Input type="number" value={line.unit_cost} onChange={(e) => updateLine(idx, "unit_cost", e.target.value)} placeholder="0.00" className="h-8 text-sm" min="0" step="any" />
                        </div>
                        <div className="flex items-end gap-1">
                          <div className="flex-1 space-y-1">
                            <Label className="text-xs">Customer</Label>
                            <Input value={line.customer} onChange={(e) => updateLine(idx, "customer", e.target.value)} placeholder="Optional" className="h-8 text-sm" />
                          </div>
                          {lines.length > 1 && (
                            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeLine(idx)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => { setCreateOpen(false); resetForm() }}>Cancel</Button>
                <Button onClick={handleCreate} disabled={createMutation.isLoading}>
                  {createMutation.isLoading ? "Creating..." : "Create Order"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <DataTable
        data={orders ?? []}
        columns={columns}
        isLoading={isLoading}
        searchFilter={(o, search) => {
          const s = search.toLowerCase()
          return (
            o.order_number.toLowerCase().includes(s) ||
            o.supplier.toLowerCase().includes(s) ||
            o.lines.some((l) =>
              l.description.toLowerCase().includes(s) ||
              (l.ata_part_number ?? "").toLowerCase().includes(s) ||
              (l.customer ?? "").toLowerCase().includes(s)
            )
          )
        }}
        searchPlaceholder="Search by order #, supplier, description, part number..."
        emptyMessage="No consumable orders found"
        pageSize={25}
      />

      {/* Edit Dialog */}
      {editOrder && (
        <EditConsumableOrderDialog
          order={editOrder}
          open={!!editOrder}
          onOpenChange={(open) => { if (!open) setEditOrder(null) }}
          onSave={(data) => updateMutation.mutate({ id: editOrder.id, data })}
          isSaving={updateMutation.isLoading}
        />
      )}
    </div>
  )
}

function EditConsumableOrderDialog({
  order,
  open,
  onOpenChange,
  onSave,
  isSaving,
}: {
  order: ConsumableOrder
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (data: unknown) => void
  isSaving: boolean
}) {
  const [supplier, setSupplier] = useState(order.supplier)
  const [orderDate, setOrderDate] = useState(order.order_date.split("T")[0])
  const [expectedDate, setExpectedDate] = useState(order.expected_date?.split("T")[0] ?? "")
  const [currency, setCurrency] = useState(order.currency)
  const [notes, setNotes] = useState(order.notes ?? "")
  const [editLines, setEditLines] = useState<NewLine[]>(
    order.lines.map((l) => ({
      ata_part_number: l.ata_part_number ?? "",
      description: l.description,
      manufacturer: l.manufacturer ?? "",
      manufacturer_pn: l.manufacturer_pn ?? "",
      quantity: String(parseFloat(String(l.quantity))),
      unit_cost: l.unit_cost ? String(parseFloat(String(l.unit_cost))) : "",
      customer: l.customer ?? "",
      notes: l.notes ?? "",
    }))
  )

  const updateLine = (index: number, field: keyof NewLine, value: string) => {
    const updated = [...editLines]
    updated[index] = { ...updated[index], [field]: value }
    setEditLines(updated)
  }

  const addLine = () => setEditLines([...editLines, { ...emptyLine }])
  const removeLine = (index: number) => {
    if (editLines.length <= 1) return
    setEditLines(editLines.filter((_, i) => i !== index))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Order {order.order_number}</DialogTitle>
          <DialogDescription>Update consumable order details</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label>Supplier *</Label>
              <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Order Date</Label>
              <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Expected Date</Label>
              <Input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CAD">CAD</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Line Items</Label>
              <Button type="button" variant="outline" size="sm" onClick={addLine}>
                <Plus className="h-3 w-3 mr-1" /> Add Line
              </Button>
            </div>
            <div className="space-y-3">
              {editLines.map((line, idx) => (
                <div key={idx} className="grid grid-cols-8 gap-2 items-end border rounded-md p-3 bg-muted/30">
                  <div className="col-span-1 space-y-1">
                    <Label className="text-xs">AT&A P/N</Label>
                    <Input value={line.ata_part_number} onChange={(e) => updateLine(idx, "ata_part_number", e.target.value)} className="h-8 text-sm" />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">Description *</Label>
                    <Input value={line.description} onChange={(e) => updateLine(idx, "description", e.target.value)} className="h-8 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">MFR</Label>
                    <Input value={line.manufacturer} onChange={(e) => updateLine(idx, "manufacturer", e.target.value)} className="h-8 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">MFR P/N</Label>
                    <Input value={line.manufacturer_pn} onChange={(e) => updateLine(idx, "manufacturer_pn", e.target.value)} className="h-8 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Qty</Label>
                    <Input type="number" value={line.quantity} onChange={(e) => updateLine(idx, "quantity", e.target.value)} className="h-8 text-sm" min="0" step="any" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Unit Cost</Label>
                    <Input type="number" value={line.unit_cost} onChange={(e) => updateLine(idx, "unit_cost", e.target.value)} className="h-8 text-sm" min="0" step="any" />
                  </div>
                  <div className="flex items-end gap-1">
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs">Customer</Label>
                      <Input value={line.customer} onChange={(e) => updateLine(idx, "customer", e.target.value)} className="h-8 text-sm" />
                    </div>
                    {editLines.length > 1 && (
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeLine(idx)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => {
              const validLines = editLines.filter((l) => l.description.trim())
              if (!supplier.trim()) { toast.error("Supplier is required"); return }
              if (validLines.length === 0) { toast.error("At least one line item is required"); return }
              onSave({
                supplier: supplier.trim(),
                order_date: orderDate,
                expected_date: expectedDate || undefined,
                currency,
                notes: notes || undefined,
                lines: validLines.map((l) => ({
                  ata_part_number: l.ata_part_number || undefined,
                  description: l.description,
                  manufacturer: l.manufacturer || undefined,
                  manufacturer_pn: l.manufacturer_pn || undefined,
                  quantity: parseFloat(l.quantity) || 1,
                  unit_cost: l.unit_cost ? parseFloat(l.unit_cost) : undefined,
                  customer: l.customer || undefined,
                  notes: l.notes || undefined,
                })),
              })
            }}
            disabled={isSaving}
          >
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
