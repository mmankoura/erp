"use client"

import React, { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { toast } from "sonner"
import { useApi, useMutation } from "@/hooks/use-api"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  ArrowLeft,
  Plus,
  Trash2,
  CheckCircle,
  Undo2,
  FileDown,
  FileSpreadsheet,
  Save,
} from "lucide-react"
import {
  type ConsumableOrder,
  type ConsumableOrderStatus,
  type NewLine,
  emptyLine,
} from "../page"

const statusBadgeVariant: Record<ConsumableOrderStatus, "default" | "secondary"> = {
  ORDERED: "default",
  RECEIVED: "secondary",
}

function toForm(order: ConsumableOrder): {
  supplier: string
  orderDate: string
  expectedDate: string
  currency: string
  notes: string
  lines: NewLine[]
} {
  return {
    supplier: order.supplier,
    orderDate: order.order_date.split("T")[0],
    expectedDate: order.expected_date?.split("T")[0] ?? "",
    currency: order.currency,
    notes: order.notes ?? "",
    lines: order.lines.map((l) => ({
      ata_part_number: l.ata_part_number ?? "",
      description: l.description,
      manufacturer: l.manufacturer ?? "",
      manufacturer_pn: l.manufacturer_pn ?? "",
      quantity: String(parseFloat(String(l.quantity))),
      unit_cost: l.unit_cost != null ? String(parseFloat(String(l.unit_cost))) : "",
      customer: l.customer ?? "",
      notes: l.notes ?? "",
    })),
  }
}

export default function ConsumableOrderDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const { data: order, isLoading, refetch } = useApi<ConsumableOrder>(
    `/consumable-orders/${id}`,
  )

  const [supplier, setSupplier] = useState("")
  const [orderDate, setOrderDate] = useState("")
  const [expectedDate, setExpectedDate] = useState("")
  const [currency, setCurrency] = useState("CAD")
  const [notes, setNotes] = useState("")
  const [lines, setLines] = useState<NewLine[]>([])

  useEffect(() => {
    if (!order) return
    const f = toForm(order)
    setSupplier(f.supplier)
    setOrderDate(f.orderDate)
    setExpectedDate(f.expectedDate)
    setCurrency(f.currency)
    setNotes(f.notes)
    setLines(f.lines)
  }, [order])

  const updateMutation = useMutation(
    (data: unknown) => api.patch<ConsumableOrder>(`/consumable-orders/${id}`, data),
    {
      onSuccess: () => {
        toast.success("Order updated")
        refetch()
      },
      onError: (error) => toast.error(error.message || "Failed to update order"),
    },
  )

  const deleteMutation = useMutation(
    () => api.delete(`/consumable-orders/${id}`),
    {
      onSuccess: () => {
        toast.success("Order deleted")
        router.push("/consumable-orders")
      },
      onError: (error) => toast.error(error.message || "Failed to delete order"),
    },
  )

  const transitionStatus = async (endpoint: "receive" | "undo-receive") => {
    try {
      await api.post(`/consumable-orders/${id}/${endpoint}`, {})
      toast.success(
        endpoint === "receive" ? "Order marked as received" : "Receiving undone — back to ORDERED",
      )
      refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed")
    }
  }

  const canEdit = order?.status === "ORDERED"

  const updateLine = (index: number, field: keyof NewLine, value: string) => {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, [field]: value } : l)))
  }
  const addLine = () => setLines((prev) => [...prev, { ...emptyLine }])
  const removeLine = (index: number) => {
    if (lines.length <= 1) return
    setLines((prev) => prev.filter((_, i) => i !== index))
  }

  const dirty = useMemo(() => {
    if (!order) return false
    const orig = toForm(order)
    if (
      orig.supplier !== supplier ||
      orig.orderDate !== orderDate ||
      orig.expectedDate !== expectedDate ||
      orig.currency !== currency ||
      orig.notes !== notes
    )
      return true
    if (orig.lines.length !== lines.length) return true
    for (let i = 0; i < lines.length; i++) {
      const a = orig.lines[i]
      const b = lines[i]
      if (
        a.ata_part_number !== b.ata_part_number ||
        a.description !== b.description ||
        a.manufacturer !== b.manufacturer ||
        a.manufacturer_pn !== b.manufacturer_pn ||
        a.quantity !== b.quantity ||
        a.unit_cost !== b.unit_cost ||
        a.customer !== b.customer ||
        a.notes !== b.notes
      )
        return true
    }
    return false
  }, [order, supplier, orderDate, expectedDate, currency, notes, lines])

  const handleSave = () => {
    const validLines = lines.filter((l) => l.description.trim())
    if (!supplier.trim()) {
      toast.error("Supplier is required")
      return
    }
    if (validLines.length === 0) {
      toast.error("At least one line item is required")
      return
    }
    updateMutation.mutate({
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
  }

  const totalAmount = lines.reduce(
    (sum, l) => sum + (parseFloat(l.quantity) || 0) * (parseFloat(l.unit_cost) || 0),
    0,
  )

  if (isLoading) {
    return <div className="text-muted-foreground">Loading...</div>
  }
  if (!order) {
    return (
      <div className="space-y-3">
        <Link href="/consumable-orders">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to Consumable Orders
          </Button>
        </Link>
        <p className="text-muted-foreground">Consumable order not found.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Link href="/consumable-orders">
        <Button variant="ghost" size="sm">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Consumable Orders
        </Button>
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            {order.order_number}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center hover:opacity-80 transition-opacity cursor-pointer"
                  title="Change status"
                >
                  <Badge variant={statusBadgeVariant[order.status]}>{order.status}</Badge>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {order.status === "ORDERED" && (
                  <DropdownMenuItem onClick={() => transitionStatus("receive")}>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Mark Received
                  </DropdownMenuItem>
                )}
                {order.status === "RECEIVED" && (
                  <DropdownMenuItem onClick={() => transitionStatus("undo-receive")}>
                    <Undo2 className="h-4 w-4 mr-2" />
                    Undo Receive
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </h1>
          <p className="text-sm text-muted-foreground">{order.supplier}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              const { generateConsumablePoPdf } = await import("@/lib/consumable-po-pdf")
              await generateConsumablePoPdf(order)
            }}
          >
            <FileDown className="h-4 w-4 mr-1" />
            PDF
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              const { exportConsumableOrderToExcel } = await import("@/lib/consumable-po-excel")
              exportConsumableOrderToExcel(order)
            }}
          >
            <FileSpreadsheet className="h-4 w-4 mr-1" />
            Excel
          </Button>
          {canEdit && (
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!dirty || updateMutation.isLoading}
            >
              <Save className="h-4 w-4 mr-1" />
              {updateMutation.isLoading ? "Saving..." : dirty ? "Save Changes" : "Saved"}
            </Button>
          )}
          <Button
            size="sm"
            variant="destructive"
            onClick={() => {
              if (confirm(`Delete order ${order.order_number}?`)) {
                deleteMutation.mutate(undefined)
              }
            }}
            disabled={deleteMutation.isLoading}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Delete
          </Button>
        </div>
      </div>

      <div className="rounded-md border bg-muted/30 px-4 py-3">
        <div className="grid grid-cols-5 gap-4">
          <div className="space-y-1">
            <Label className="text-xs">Supplier *</Label>
            <Input
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              className="h-8"
              disabled={!canEdit}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Order Date *</Label>
            <Input
              type="date"
              value={orderDate}
              onChange={(e) => setOrderDate(e.target.value)}
              className="h-8"
              disabled={!canEdit}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Expected Date</Label>
            <Input
              type="date"
              value={expectedDate}
              onChange={(e) => setExpectedDate(e.target.value)}
              className="h-8"
              disabled={!canEdit}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Currency</Label>
            <Select value={currency} onValueChange={setCurrency} disabled={!canEdit}>
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CAD">CAD</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Notes</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes..."
              className="h-8"
              disabled={!canEdit}
            />
          </div>
        </div>
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-[40px] text-center">#</TableHead>
              <TableHead className="w-[140px]">AT&A P/N</TableHead>
              <TableHead>Description *</TableHead>
              <TableHead className="w-[140px]">MFR</TableHead>
              <TableHead className="w-[140px]">MFR P/N</TableHead>
              <TableHead className="w-[80px] text-right">Qty</TableHead>
              <TableHead className="w-[110px] text-right">Unit Cost</TableHead>
              <TableHead className="w-[140px]">Customer</TableHead>
              <TableHead className="w-[100px] text-right">Total</TableHead>
              {canEdit && <TableHead className="w-[50px]"></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line, idx) => {
              const qty = parseFloat(line.quantity) || 0
              const cost = parseFloat(line.unit_cost) || 0
              const lineTotal = qty * cost
              return (
                <TableRow key={idx} className="group">
                  <TableCell className="text-center text-muted-foreground text-xs">
                    {idx + 1}
                  </TableCell>
                  <TableCell className="p-1">
                    <Input
                      value={line.ata_part_number}
                      onChange={(e) => updateLine(idx, "ata_part_number", e.target.value)}
                      placeholder="P/N"
                      className="h-7 text-xs border-transparent bg-transparent hover:border-input focus:border-input"
                      disabled={!canEdit}
                    />
                  </TableCell>
                  <TableCell className="p-1">
                    <Input
                      value={line.description}
                      onChange={(e) => updateLine(idx, "description", e.target.value)}
                      placeholder="Description"
                      className="h-7 text-xs border-transparent bg-transparent hover:border-input focus:border-input"
                      disabled={!canEdit}
                    />
                  </TableCell>
                  <TableCell className="p-1">
                    <Input
                      value={line.manufacturer}
                      onChange={(e) => updateLine(idx, "manufacturer", e.target.value)}
                      placeholder="MFR"
                      className="h-7 text-xs border-transparent bg-transparent hover:border-input focus:border-input"
                      disabled={!canEdit}
                    />
                  </TableCell>
                  <TableCell className="p-1">
                    <Input
                      value={line.manufacturer_pn}
                      onChange={(e) => updateLine(idx, "manufacturer_pn", e.target.value)}
                      placeholder="MFR P/N"
                      className="h-7 text-xs border-transparent bg-transparent hover:border-input focus:border-input"
                      disabled={!canEdit}
                    />
                  </TableCell>
                  <TableCell className="p-1">
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      value={line.quantity}
                      onChange={(e) => updateLine(idx, "quantity", e.target.value)}
                      className="h-7 text-xs text-right border-transparent bg-transparent hover:border-input focus:border-input"
                      disabled={!canEdit}
                    />
                  </TableCell>
                  <TableCell className="p-1">
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      value={line.unit_cost}
                      onChange={(e) => updateLine(idx, "unit_cost", e.target.value)}
                      placeholder="0.00"
                      className="h-7 text-xs text-right border-transparent bg-transparent hover:border-input focus:border-input"
                      disabled={!canEdit}
                    />
                  </TableCell>
                  <TableCell className="p-1">
                    <Input
                      value={line.customer}
                      onChange={(e) => updateLine(idx, "customer", e.target.value)}
                      placeholder="Optional"
                      className="h-7 text-xs border-transparent bg-transparent hover:border-input focus:border-input"
                      disabled={!canEdit}
                    />
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums">
                    {lineTotal > 0 ? `${currency} ${lineTotal.toFixed(2)}` : "—"}
                  </TableCell>
                  {canEdit && (
                    <TableCell className="p-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-destructive opacity-0 group-hover:opacity-100"
                        onClick={() => removeLine(idx)}
                        disabled={lines.length <= 1}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        {canEdit ? (
          <Button type="button" variant="outline" size="sm" onClick={addLine}>
            <Plus className="h-4 w-4 mr-1" />
            Add Line
          </Button>
        ) : (
          <div />
        )}
        {totalAmount > 0 && (
          <span className="text-sm">
            <span className="text-muted-foreground">Total: </span>
            <span className="font-medium">
              {currency} {totalAmount.toFixed(2)}
            </span>
          </span>
        )}
      </div>
    </div>
  )
}
