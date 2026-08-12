"use client"

import React from "react"
import { useApi, useMutation } from "@/hooks/use-api"
import {
  api,
  type PurchaseOrder,
  type PurchaseOrderLine,
  type PurchaseOrderStatus,
  type Supplier,
  type Material,
  type PoHistory,
} from "@/lib/api"
import { VirtualGrid, type VirtualGridColumn } from "@/components/virtual-grid"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Plus,
  Pencil,
  Trash2,
  MoreHorizontal,
  Send,
  CheckCircle,
  XCircle,
  Eye,
  Upload,
  Loader2,
  History,
  FileDown,
  FileSpreadsheet,
} from "lucide-react"
import { useState, useEffect, useMemo, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { useAuth, UserRole } from "@/contexts/auth-context"
import { Lock, Unlock } from "lucide-react"
import { cn } from "@/lib/utils"

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

// View PO Detail — renders as a Dialog by default, or as embedded content (for
// the /purchase-orders/[id] route page) when `embedded` is true.
export function PurchaseOrderDetailDialog({
  purchaseOrder,
  onSuccess,
  trigger,
  open: openProp,
  onOpenChange,
  embedded,
}: {
  purchaseOrder: PurchaseOrder
  onSuccess: () => void
  trigger?: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  embedded?: boolean
}) {
  const [internalOpen, setInternalOpen] = useState(false)
  const isControlled = openProp !== undefined
  const open = isControlled ? openProp : internalOpen
  const setOpen = (next: boolean) => {
    if (!isControlled) setInternalOpen(next)
    onOpenChange?.(next)
  }
  // In embedded (page) mode we always fetch; otherwise gate on dialog open.
  const fetchEnabled = embedded || open
  const { data: poDetail, refetch } = useApi<PurchaseOrder>(
    `/purchase-orders/${purchaseOrder.id}`,
    { enabled: fetchEnabled }
  )
  const { data: materials } = useApi<Material[]>("/materials", { enabled: fetchEnabled })

  // Line item mutations
  const addLineMutation = useMutation(
    (data: { material_id: string; quantity_ordered: number; unit_cost?: number; manufacturer: string; manufacturer_pn: string; packaging: string }) =>
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

  const deletePoMutation = useMutation(
    () => api.delete(`/purchase-orders/${purchaseOrder.id}`),
    {
      onSuccess: () => {
        toast.success("PO deleted")
        setOpen(false)
        onSuccess()
      },
      onError: (error) => toast.error(error.message),
    }
  )

  const [newLineIpnSearch, setNewLineIpnSearch] = useState("")
  const [newLineMaterial, setNewLineMaterial] = useState("")
  const [newLineQty, setNewLineQty] = useState(1)
  const [newLineCost, setNewLineCost] = useState("")
  const [newLineMfg, setNewLineMfg] = useState("")
  const [newLineMpn, setNewLineMpn] = useState("")

  const handleAddLine = () => {
    if (!newLineMaterial || !newLineMfg || !newLineMpn) {
      toast.error("Manufacturer and MPN are required")
      return
    }
    addLineMutation.mutate({
      material_id: newLineMaterial,
      quantity_ordered: newLineQty,
      unit_cost: newLineCost ? Number(newLineCost) : undefined,
      manufacturer: newLineMfg,
      manufacturer_pn: newLineMpn,
      packaging: "",
    })
    setNewLineIpnSearch("")
    setNewLineMaterial("")
    setNewLineQty(1)
    setNewLineCost("")
    setNewLineMfg("")
    setNewLineMpn("")
  }

  const handleDetailIpnSelect = (materialId: string) => {
    const material = materials?.find((m) => m.id === materialId)
    if (!material) return
    setNewLineMaterial(materialId)
    setNewLineIpnSearch(material.internal_part_number)
    setNewLineMfg(material.manufacturer || "")
    setNewLineMpn(material.manufacturer_pn || "")
  }

  const filteredDetailMaterials = materials?.filter((m) =>
    m.internal_part_number.toLowerCase().includes(newLineIpnSearch.toLowerCase())
  ) || []
  const showDetailDropdown = newLineIpnSearch.length > 0 && !newLineMaterial && filteredDetailMaterials.length > 0

  const po = poDetail || purchaseOrder
  const canEdit = po.status === "DRAFT"
  const canSubmit = po.status === "DRAFT" && (po.lines?.length || 0) > 0
  const canConfirm = po.status === "SUBMITTED"
  const canClose = ["RECEIVED", "PARTIALLY_RECEIVED", "CONFIRMED"].includes(po.status)
  const canCancel = ["DRAFT", "SUBMITTED", "CONFIRMED"].includes(po.status)

  const totalAmount =
    po.lines?.reduce((sum, line) => {
      return sum + (parseFloat(String(line.unit_cost)) || 0) * parseFloat(String(line.quantity_ordered))
    }, 0) || 0

  const titleAndDescription = embedded ? (
    <>
      <h1 className="text-2xl font-bold flex items-center gap-2">
        {po.po_number}
        <Badge variant={statusConfig[po.status].variant}>
          {statusConfig[po.status].label}
        </Badge>
      </h1>
      <p className="text-sm text-muted-foreground">
        {po.supplier?.name} ({po.supplier?.code})
      </p>
    </>
  ) : (
    <>
      <DialogTitle className="flex items-center gap-2">
        {po.po_number}
        <Badge variant={statusConfig[po.status].variant}>
          {statusConfig[po.status].label}
        </Badge>
      </DialogTitle>
      <DialogDescription>
        {po.supplier?.name} ({po.supplier?.code})
      </DialogDescription>
    </>
  )

  const actionButtons = (
    <div className="flex gap-2">
      <Button
        size="sm"
        variant="outline"
        onClick={async () => {
          const { generatePoPdf } = await import("@/lib/po-pdf")
          await generatePoPdf(po)
        }}
      >
        <FileDown className="h-4 w-4 mr-1" />
        PDF
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={async () => {
          const { exportPoToExcel } = await import("@/lib/po-excel")
          exportPoToExcel(po)
        }}
      >
        <FileSpreadsheet className="h-4 w-4 mr-1" />
        Excel
      </Button>
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
      <Button
        size="sm"
        variant="destructive"
        onClick={() => {
          const msg =
            po.status === "DRAFT"
              ? `Delete PO ${po.po_number}?`
              : `Delete PO ${po.po_number} (status: ${po.status})? This is a soft delete — the PO will be hidden but receipts already posted against it stay in inventory.`
          if (confirm(msg)) {
            deletePoMutation.mutate(undefined)
          }
        }}
        disabled={deletePoMutation.isLoading}
      >
        <Trash2 className="h-4 w-4 mr-1" />
        Delete
      </Button>
    </div>
  )

  const headerRow = (
    <div className="flex items-center justify-between">
      <div>{titleAndDescription}</div>
      {actionButtons}
    </div>
  )

  const bodyContent = (
    <div className="space-y-3">
          {/* PO header panel */}
          <div className="rounded-md border bg-muted/30 px-4 py-3">
            <div className="grid grid-cols-5 gap-4 text-sm">
              <div>
                <span className="text-xs text-muted-foreground">Supplier</span>
                <p className="font-medium truncate">
                  {po.supplier?.name || "-"}{po.supplier?.code ? ` (${po.supplier.code})` : ""}
                </p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Order Date</span>
                <p className="font-medium">{new Date(po.order_date).toLocaleDateString()}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Expected Date</span>
                <p className="font-medium">
                  {po.expected_date ? new Date(po.expected_date).toLocaleDateString() : "-"}
                </p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Currency</span>
                <p className="font-medium">{po.currency}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Total</span>
                <p className="font-medium">
                  {po.currency} {totalAmount.toFixed(2)}
                </p>
              </div>
            </div>
            {po.notes && (
              <div className="mt-2 text-sm">
                <span className="text-xs text-muted-foreground">Notes: </span>
                {po.notes}
              </div>
            )}
          </div>

          {/* Line Items */}
          <div className="space-y-2">

            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Material</TableHead>
                    <TableHead>Mfg / MPN</TableHead>
                    <TableHead className="text-right">Ordered</TableHead>
                    <TableHead className="text-right">Received</TableHead>
                    <TableHead className="text-right">Unit Cost</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    {canEdit && <TableHead className="w-[50px]"></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {po.lines?.map((line) => {
                    const qty = parseFloat(String(line.quantity_ordered)) || 0
                    const cost = line.unit_cost != null ? parseFloat(String(line.unit_cost)) : null
                    return (
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
                            <p className="text-xs text-muted-foreground">
                              {line.material?.customer?.name || "-"} | {line.material?.resource_type || "-"}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <InlineTextCell
                              lineId={line.id}
                              field="manufacturer"
                              initial={line.manufacturer || line.material?.manufacturer || ""}
                              onSaved={refetch}
                              disabled={!canEdit}
                            />
                            <InlineTextCell
                              lineId={line.id}
                              field="manufacturer_pn"
                              initial={line.manufacturer_pn || line.material?.manufacturer_pn || ""}
                              onSaved={refetch}
                              disabled={!canEdit}
                            />
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <InlineNumberCell
                            lineId={line.id}
                            field="quantity_ordered"
                            initial={qty}
                            step="1"
                            formatter={(n) => n.toString()}
                            onSaved={refetch}
                            disabled={!canEdit}
                          />
                        </TableCell>
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
                          <InlineNumberCell
                            lineId={line.id}
                            field="unit_cost"
                            initial={cost}
                            formatter={(n) => `${po.currency} ${n.toFixed(2)}`}
                            onSaved={refetch}
                            disabled={!canEdit}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          {cost != null ? `${po.currency} ${(cost * qty).toFixed(2)}` : "-"}
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
                    )
                  })}
                  {(!po.lines || po.lines.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={canEdit ? 8 : 7} className="text-center text-muted-foreground">
                        No line items
                      </TableCell>
                    </TableRow>
                  )}
                  {/* Add new line - only in DRAFT */}
                  {canEdit && (
                    <>
                      <TableRow>
                        <TableCell colSpan={canEdit ? 8 : 7} className="p-0">
                          <div className="bg-muted/30 p-3 space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium text-muted-foreground">Add Line</span>
                            </div>
                            <div className="grid grid-cols-4 gap-2">
                              <div className="relative">
                                <Input
                                  value={newLineIpnSearch}
                                  onChange={(e) => {
                                    setNewLineIpnSearch(e.target.value)
                                    setNewLineMaterial("")
                                  }}
                                  placeholder="Type IPN..."
                                  className="h-8"
                                />
                                {showDetailDropdown && (
                                  <div className="absolute z-50 top-full left-0 right-0 mt-1 max-h-40 overflow-y-auto bg-popover border rounded-md shadow-md">
                                    {filteredDetailMaterials.slice(0, 10).map((m) => (
                                      <button
                                        key={m.id}
                                        type="button"
                                        className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent"
                                        onClick={() => handleDetailIpnSelect(m.id)}
                                      >
                                        {m.internal_part_number}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <Input
                                type="number"
                                min="1"
                                value={newLineQty}
                                onChange={(e) => setNewLineQty(Number(e.target.value))}
                                placeholder="Qty"
                                className="h-8"
                              />
                              <Input
                                value={newLineMfg}
                                onChange={(e) => setNewLineMfg(e.target.value)}
                                placeholder="Manufacturer *"
                                className="h-8"
                              />
                              <Input
                                value={newLineMpn}
                                onChange={(e) => setNewLineMpn(e.target.value)}
                                placeholder="MPN *"
                                className="h-8"
                              />
                            </div>
                            <div className="grid grid-cols-4 gap-2">
                              <Input
                                type="number"
                                min="0"
                                step="any"
                                value={newLineCost}
                                onChange={(e) => setNewLineCost(e.target.value)}
                                placeholder="Unit Cost"
                                className="h-8"
                              />
                              <div className="col-span-2"></div>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8"
                                onClick={handleAddLine}
                                disabled={!newLineMaterial || addLineMutation.isLoading}
                              >
                                <Plus className="h-4 w-4 mr-1" />
                                Add
                              </Button>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    </>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
    </div>
  )

  if (embedded) {
    return (
      <div className="space-y-4">
        {headerRow}
        {bodyContent}
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>{headerRow}</DialogHeader>
        {bodyContent}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// One row per PO line. POs with no lines get a single placeholder row so they
// remain visible.
// ==================== Inline editor cells (Phase 1) ====================

const statusRowTint: Record<PurchaseOrderStatus, string> = {
  DRAFT: "bg-slate-100 border-l-4 border-l-slate-400",
  SUBMITTED: "bg-amber-100 border-l-4 border-l-amber-500",
  CONFIRMED: "bg-blue-100 border-l-4 border-l-blue-500",
  PARTIALLY_RECEIVED: "bg-cyan-100 border-l-4 border-l-cyan-500",
  RECEIVED: "bg-emerald-100 border-l-4 border-l-emerald-500",
  CLOSED: "bg-zinc-200 border-l-4 border-l-zinc-500",
  CANCELLED: "bg-rose-100 border-l-4 border-l-rose-500",
}

function lineEditAllowed(status: PurchaseOrderStatus): boolean {
  return status === "DRAFT"
}

function InlineNumberCell({
  lineId,
  field,
  initial,
  formatter,
  step,
  onSaved,
  disabled,
}: {
  lineId: string
  field: "quantity_ordered" | "unit_cost"
  initial: number | null
  formatter: (n: number) => string
  step?: string
  onSaved: () => void
  disabled?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState<string>(initial != null ? String(initial) : "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setValue(initial != null ? String(initial) : "")
  }, [initial])

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  const commit = async () => {
    const trimmed = value.trim()
    if (trimmed === "" || isNaN(Number(trimmed)) || Number(trimmed) < 0) {
      setError(true)
      return
    }
    setError(false)
    const num = parseFloat(trimmed)
    if (num === initial) {
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      await api.patch(`/purchase-orders/lines/${lineId}`, { [field]: num })
      onSaved()
      setEditing(false)
    } catch (err) {
      setError(true)
      toast.error(err instanceof Error ? err.message : "Save failed")
      setValue(initial != null ? String(initial) : "")
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setEditing(true)}
        className={cn(
          "font-mono text-sm w-full text-right tabular-nums",
          disabled ? "cursor-not-allowed text-muted-foreground" : "hover:bg-accent rounded px-1 -mx-1 cursor-text",
        )}
      >
        {initial != null ? formatter(initial) : "—"}
      </button>
    )
  }

  return (
    <div className="relative w-full">
      <Input
        ref={inputRef}
        type="number"
        step={step ?? "any"}
        min={0}
        value={value}
        onChange={(e) => { setValue(e.target.value); setError(false) }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); inputRef.current?.blur() }
          if (e.key === "Escape") {
            e.preventDefault()
            setValue(initial != null ? String(initial) : "")
            setError(false)
            setEditing(false)
          }
        }}
        disabled={saving}
        className={cn(
          "h-7 text-right font-mono text-sm tabular-nums px-1 py-0",
          error && "border-destructive focus-visible:ring-destructive",
        )}
      />
      {saving && (
        <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-blue-500" title="Saving..." />
      )}
    </div>
  )
}

function InlineTextCell({
  lineId,
  field,
  initial,
  onSaved,
  disabled,
}: {
  lineId: string
  field: "manufacturer" | "manufacturer_pn"
  initial: string | null
  onSaved: () => void
  disabled?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState<string>(initial ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setValue(initial ?? "") }, [initial])
  useEffect(() => { if (editing) inputRef.current?.select() }, [editing])

  const commit = async () => {
    const trimmed = value.trim()
    if (trimmed === (initial ?? "")) {
      setEditing(false)
      return
    }
    setSaving(true)
    setError(false)
    try {
      await api.patch(`/purchase-orders/lines/${lineId}`, { [field]: trimmed })
      onSaved()
      setEditing(false)
    } catch (err) {
      setError(true)
      toast.error(err instanceof Error ? err.message : "Save failed")
      setValue(initial ?? "")
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setEditing(true)}
        className={cn(
          "text-sm w-full text-left truncate",
          disabled ? "cursor-not-allowed text-muted-foreground" : "hover:bg-accent rounded px-1 -mx-1 cursor-text",
        )}
      >
        {initial || "—"}
      </button>
    )
  }
  return (
    <div className="relative w-full">
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => { setValue(e.target.value); setError(false) }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); inputRef.current?.blur() }
          if (e.key === "Escape") {
            e.preventDefault()
            setValue(initial ?? "")
            setError(false)
            setEditing(false)
          }
        }}
        disabled={saving}
        className={cn(
          "h-7 text-sm px-1 py-0",
          error && "border-destructive focus-visible:ring-destructive",
        )}
      />
      {saving && (
        <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-blue-500" title="Saving..." />
      )}
    </div>
  )
}

function nextStatusTransitions(status: PurchaseOrderStatus): Array<{
  label: string
  endpoint: "submit" | "confirm" | "close" | "cancel"
  destructive?: boolean
}> {
  switch (status) {
    case "DRAFT":
      return [
        { label: "Submit", endpoint: "submit" },
        { label: "Cancel", endpoint: "cancel", destructive: true },
      ]
    case "SUBMITTED":
      return [
        { label: "Confirm", endpoint: "confirm" },
        { label: "Cancel", endpoint: "cancel", destructive: true },
      ]
    case "CONFIRMED":
      return [
        { label: "Close", endpoint: "close" },
        { label: "Cancel", endpoint: "cancel", destructive: true },
      ]
    case "PARTIALLY_RECEIVED":
    case "RECEIVED":
      return [{ label: "Close", endpoint: "close" }]
    case "CLOSED":
    case "CANCELLED":
      return []
  }
}

function InlineStatusCell({
  po,
  onSaved,
  disabled,
}: {
  po: PurchaseOrder
  onSaved: () => void
  disabled?: boolean
}) {
  const transitions = nextStatusTransitions(po.status)
  const [pending, setPending] = useState<string | null>(null)

  const run = async (endpoint: string, destructive?: boolean) => {
    if (destructive && !confirm(`Confirm: ${endpoint} PO ${po.po_number}?`)) return
    setPending(endpoint)
    try {
      await api.post(`/purchase-orders/${po.id}/${endpoint}`, {})
      toast.success(`PO ${po.po_number} → ${endpoint}`)
      onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed to ${endpoint}`)
    } finally {
      setPending(null)
    }
  }

  if (disabled || transitions.length === 0) {
    return <Badge variant={statusConfig[po.status].variant}>{statusConfig[po.status].label}</Badge>
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={pending !== null}
          className="inline-flex items-center hover:opacity-80 transition-opacity cursor-pointer disabled:opacity-50"
          title="Change status"
        >
          <Badge variant={statusConfig[po.status].variant}>
            {pending ? "..." : statusConfig[po.status].label}
          </Badge>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {transitions.map((t) => (
          <DropdownMenuItem
            key={t.endpoint}
            className={t.destructive ? "text-destructive" : ""}
            onClick={() => run(t.endpoint, t.destructive)}
          >
            {t.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

type PoLineRow = {
  po: PurchaseOrder
  line: PurchaseOrderLine | null
  rowKey: string
}

function GeneratePoPdfDialog() {
  const [open, setOpen] = useState(false)
  const [poNumber, setPoNumber] = useState("")
  const [loading, setLoading] = useState(false)

  const handleGenerate = async () => {
    const trimmed = poNumber.trim()
    if (!trimmed) {
      toast.error("Enter a PO number")
      return
    }
    setLoading(true)
    try {
      const po = await api.get<PurchaseOrder>(
        `/purchase-orders/number/${encodeURIComponent(trimmed)}`,
      )
      const { generatePoPdf } = await import("@/lib/po-pdf")
      await generatePoPdf(po)
      setOpen(false)
      setPoNumber("")
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to generate PDF"
      toast.error(msg.includes("404") ? `PO "${trimmed}" not found` : msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <FileDown className="h-4 w-4 mr-2" />
          Generate PDF
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Generate PO PDF</DialogTitle>
          <DialogDescription>
            Enter a PO number to download its PDF.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="pdf-po-number">PO Number</Label>
          <Input
            id="pdf-po-number"
            value={poNumber}
            onChange={(e) => setPoNumber(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleGenerate()
            }}
            placeholder="e.g., 8833123"
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleGenerate} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <FileDown className="h-4 w-4 mr-2" />
                Generate PDF
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function PurchaseOrdersPage() {
  const router = useRouter()

  const [statusFilter, setStatusFilter] = useState<string>("all")
  const { hasRole } = useAuth()
  const canEditTable = hasRole(UserRole.ADMIN, UserRole.MANAGER)
  const [editUnlocked, setEditUnlocked] = useState(false)

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

  // Flatten POs into per-line rows. POs with no lines get a single placeholder
  // row keyed by the PO id so they're still visible/searchable.
  const flatLines = useMemo<PoLineRow[] | null>(() => {
    if (!purchaseOrders) return null
    const rows: PoLineRow[] = []
    for (const po of purchaseOrders) {
      if (!po.lines || po.lines.length === 0) {
        rows.push({ po, line: null, rowKey: `po-${po.id}` })
      } else {
        for (const line of po.lines) {
          rows.push({ po, line, rowKey: `line-${line.id}` })
        }
      }
    }
    return rows
  }, [purchaseOrders])

  const columns: VirtualGridColumn<PoLineRow>[] = [
    {
      id: "po_number",
      header: "PO #",
      size: 110,
      accessorFn: (r) => r.po.po_number,
      cell: (r) => (
        <Link
          href={`/purchase-orders/${r.po.id}`}
          className="font-medium italic hover:underline"
          title="Open PO details"
        >
          {r.po.po_number}
        </Link>
      ),
    },
    {
      id: "supplier",
      header: "Supplier",
      size: 160,
      accessorFn: (r) => r.po.supplier?.name || "",
      filterAccessor: (r) => r.po.supplier?.name || "-",
      cell: (r) => (
        <span className="italic text-muted-foreground">
          {r.po.supplier?.name || "-"}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      size: 140,
      accessorFn: (r) => r.po.status,
      filterAccessor: (r) => statusConfig[r.po.status].label,
      cell: (r) =>
        editUnlocked ? (
          <InlineStatusCell po={r.po} onSaved={refetch} />
        ) : (
          <Badge variant={statusConfig[r.po.status].variant}>{statusConfig[r.po.status].label}</Badge>
        ),
    },
    {
      id: "order_date",
      header: "Order Date",
      size: 110,
      accessorFn: (r) => new Date(r.po.order_date).getTime(),
      cell: (r) => new Date(r.po.order_date).toLocaleDateString(),
    },
    {
      id: "expected_date",
      header: "Expected",
      size: 110,
      accessorFn: (r) =>
        r.po.expected_date ? new Date(r.po.expected_date).getTime() : 0,
      cell: (r) => {
        if (!r.po.expected_date) return "-"
        const date = new Date(r.po.expected_date)
        const isOverdue =
          date < new Date() &&
          !["RECEIVED", "CLOSED", "CANCELLED"].includes(r.po.status)
        return (
          <span className={isOverdue ? "text-destructive font-medium" : ""}>
            {date.toLocaleDateString()}
          </span>
        )
      },
    },
    {
      id: "line_number",
      header: "Line",
      size: 60,
      align: "right",
      accessorFn: (r) => r.line?.line_number ?? 0,
      cell: (r) =>
        r.line ? (
          <span className="font-mono text-sm">{r.line.line_number}</span>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        ),
    },
    {
      id: "ipn",
      header: "IPN",
      size: 140,
      accessorFn: (r) => r.line?.material?.internal_part_number || "",
      filterAccessor: (r) => r.line?.material?.internal_part_number || "—",
      cell: (r) =>
        r.line?.material?.internal_part_number ? (
          <span className="font-mono text-sm">
            {r.line.material.internal_part_number}
          </span>
        ) : (
          <span className="text-muted-foreground text-xs italic">no lines</span>
        ),
    },
    {
      id: "manufacturer",
      header: "MFR",
      size: 130,
      accessorFn: (r) =>
        r.line?.manufacturer || r.line?.material?.manufacturer || "",
      filterAccessor: (r) =>
        r.line?.manufacturer || r.line?.material?.manufacturer || "-",
      cell: (r) => {
        if (!r.line) return "-"
        if (editUnlocked && lineEditAllowed(r.po.status)) {
          return (
            <InlineTextCell
              lineId={r.line.id}
              field="manufacturer"
              initial={r.line.manufacturer || r.line.material?.manufacturer || ""}
              onSaved={refetch}
            />
          )
        }
        return (
          <span className="text-sm">
            {r.line.manufacturer || r.line.material?.manufacturer || "-"}
          </span>
        )
      },
    },
    {
      id: "manufacturer_pn",
      header: "MPN",
      size: 150,
      accessorFn: (r) =>
        r.line?.manufacturer_pn || r.line?.material?.manufacturer_pn || "",
      cell: (r) => {
        if (!r.line) return "-"
        if (editUnlocked && lineEditAllowed(r.po.status)) {
          return (
            <InlineTextCell
              lineId={r.line.id}
              field="manufacturer_pn"
              initial={r.line.manufacturer_pn || r.line.material?.manufacturer_pn || ""}
              onSaved={refetch}
            />
          )
        }
        return (
          <span className="font-mono text-sm">
            {r.line.manufacturer_pn || r.line.material?.manufacturer_pn || "-"}
          </span>
        )
      },
    },
    {
      id: "qty_ordered",
      header: "Qty Ord",
      size: 90,
      align: "right",
      accessorFn: (r) =>
        r.line ? parseFloat(String(r.line.quantity_ordered)) : 0,
      cell: (r) => {
        if (!r.line) return "-"
        if (editUnlocked && lineEditAllowed(r.po.status)) {
          return (
            <InlineNumberCell
              lineId={r.line.id}
              field="quantity_ordered"
              initial={parseFloat(String(r.line.quantity_ordered))}
              formatter={(n) => n.toLocaleString()}
              step="any"
              onSaved={refetch}
            />
          )
        }
        return (
          <span className="font-mono">
            {parseFloat(String(r.line.quantity_ordered)).toLocaleString()}
          </span>
        )
      },
    },
    {
      id: "qty_received",
      header: "Qty Rcv",
      size: 90,
      align: "right",
      accessorFn: (r) =>
        r.line ? parseFloat(String(r.line.quantity_received)) : 0,
      cell: (r) =>
        r.line ? (
          <span className="font-mono">
            {parseFloat(String(r.line.quantity_received)).toLocaleString()}
          </span>
        ) : (
          "-"
        ),
    },
    {
      id: "unit_cost",
      header: "Unit Cost",
      size: 130,
      align: "right",
      accessorFn: (r) =>
        r.line?.unit_cost != null ? parseFloat(String(r.line.unit_cost)) : 0,
      cell: (r) => {
        if (!r.line) return "-"
        if (editUnlocked && lineEditAllowed(r.po.status)) {
          return (
            <InlineNumberCell
              lineId={r.line.id}
              field="unit_cost"
              initial={r.line.unit_cost != null ? parseFloat(String(r.line.unit_cost)) : null}
              formatter={(n) => `${r.po.currency} ${n.toFixed(4)}`}
              step="0.0001"
              onSaved={refetch}
            />
          )
        }
        if (r.line.unit_cost == null) return "-"
        return (
          <span className="font-mono text-sm">
            {r.po.currency} {parseFloat(String(r.line.unit_cost)).toFixed(4)}
          </span>
        )
      },
    },
    {
      id: "line_total",
      header: "Line Total",
      size: 120,
      align: "right",
      accessorFn: (r) => {
        if (!r.line || r.line.unit_cost == null) return 0
        return (
          parseFloat(String(r.line.unit_cost)) *
          parseFloat(String(r.line.quantity_ordered))
        )
      },
      cell: (r) => {
        if (!r.line || r.line.unit_cost == null) return "-"
        const total =
          parseFloat(String(r.line.unit_cost)) *
          parseFloat(String(r.line.quantity_ordered))
        return (
          <span className="font-mono text-sm">
            {r.po.currency} {total.toFixed(2)}
          </span>
        )
      },
    },
    {
      id: "actions",
      header: "",
      size: 100,
      sortable: false,
      filterable: false,
      accessorFn: () => "",
      cell: (r) => (
        <div className="flex items-center gap-1">
          <Link href={`/purchase-orders/${r.po.id}`}>
            <Button variant="ghost" size="icon" className="h-8 w-8" title="Open PO details">
              <Eye className="h-4 w-4" />
            </Button>
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {r.po.status === "DRAFT" && (
                <>
                  <DropdownMenuItem
                    onClick={() => router.push(`/purchase-orders/${r.po.id}`)}
                  >
                    <Pencil className="h-4 w-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => {
                  const msg =
                    r.po.status === "DRAFT"
                      ? `Delete PO ${r.po.po_number}?`
                      : `Delete PO ${r.po.po_number} (status: ${r.po.status})? This is a soft delete — the PO will be hidden but receipts already posted against it stay in inventory.`
                  if (confirm(msg)) {
                    deleteMutation.mutate(r.po.id)
                  }
                }}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
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
        <div className="flex items-center gap-2">
          <GeneratePoPdfDialog />
          <Link href="/purchase-orders/new">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create PO
            </Button>
          </Link>
        </div>
      </div>

      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">Active POs</TabsTrigger>
          <TabsTrigger value="history">
            <History className="h-4 w-4 mr-1" />
            History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-4">
          {/* Status Filter + Edit lock */}
          <div className="flex items-center justify-between gap-4">
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
            {canEditTable && (
              <Button
                variant={editUnlocked ? "default" : "outline"}
                size="sm"
                onClick={() => setEditUnlocked((v) => !v)}
              >
                {editUnlocked ? (
                  <>
                    <Unlock className="h-4 w-4 mr-1" />
                    Edit unlocked
                  </>
                ) : (
                  <>
                    <Lock className="h-4 w-4 mr-1" />
                    Edit locked
                  </>
                )}
              </Button>
            )}
          </div>

          <VirtualGrid
            data={flatLines}
            columns={columns}
            isLoading={isLoading}
            rowClassName={(r) => statusRowTint[r.po.status]}
            searchPlaceholder="Search by PO #, supplier, IPN, MFR, or MPN..."
            searchFn={(r, q) =>
              r.po.po_number.toLowerCase().includes(q) ||
              (r.po.supplier?.name?.toLowerCase().includes(q) ?? false) ||
              (r.line?.material?.internal_part_number?.toLowerCase().includes(q) ?? false) ||
              (r.line?.manufacturer?.toLowerCase().includes(q) ?? false) ||
              (r.line?.manufacturer_pn?.toLowerCase().includes(q) ?? false) ||
              (r.line?.material?.manufacturer?.toLowerCase().includes(q) ?? false) ||
              (r.line?.material?.manufacturer_pn?.toLowerCase().includes(q) ?? false)
            }
          />
        </TabsContent>

        <TabsContent value="history">
          <PoHistoryTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ==================== PO History Tab ====================

function PoHistoryTab() {
  const [searchQuery, setSearchQuery] = useState("")
  const endpoint = searchQuery
    ? `/purchase-orders/history?search=${encodeURIComponent(searchQuery)}`
    : "/purchase-orders/history"
  const { data: history, isLoading, refetch } = useApi<PoHistory[]>(endpoint)
  const { data: countData } = useApi<{ count: number }>("/purchase-orders/history/count")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImporting(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch("/api/purchase-orders/history/import", {
        method: "POST",
        body: formData,
        credentials: "include",
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.message || "Import failed")
      }
      const result = await res.json()
      toast.success(`Imported ${result.imported} records`)
      refetch()
    } catch (err: any) {
      toast.error(err.message || "Import failed")
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const columns: VirtualGridColumn<PoHistory>[] = [
    {
      id: "po_number",
      header: "PO #",
      size: 120,
      sortable: true,
      accessorFn: (item) => item.po_number,
      cell: (item) => <span className="font-mono font-medium">{item.po_number}</span>,
    },
    {
      id: "order_date",
      header: "Date",
      size: 100,
      sortable: true,
      accessorFn: (item) => item.order_date ?? "",
      cell: (item) => item.order_date ? new Date(item.order_date).toLocaleDateString() : "-",
    },
    {
      id: "supplier",
      header: "Supplier",
      size: 130,
      sortable: true,
      filterable: true,
      accessorFn: (item) => item.supplier ?? "",
      filterAccessor: (item) => item.supplier ?? "-",
      cell: (item) => item.supplier ?? "-",
    },
    {
      id: "ipn",
      header: "IPN (AT&A#)",
      size: 120,
      sortable: true,
      accessorFn: (item) => item.ipn ?? "",
      cell: (item) => <span className="font-mono text-sm">{item.ipn ?? "-"}</span>,
    },
    {
      id: "manufacturer",
      header: "MFR",
      size: 130,
      sortable: true,
      filterable: true,
      accessorFn: (item) => item.manufacturer ?? "",
      filterAccessor: (item) => item.manufacturer ?? "-",
      cell: (item) => item.manufacturer ?? "-",
    },
    {
      id: "mpn",
      header: "MPN",
      size: 150,
      sortable: true,
      accessorFn: (item) => item.mpn ?? "",
      cell: (item) => <span className="font-mono text-sm">{item.mpn ?? "-"}</span>,
    },
    {
      id: "description",
      header: "Description",
      size: 200,
      accessorFn: (item) => item.description ?? "",
      cell: (item) => (
        <span className="text-sm truncate max-w-[200px] block">{item.description ?? "-"}</span>
      ),
    },
    {
      id: "quantity",
      header: "Qty",
      size: 80,
      align: "right",
      sortable: true,
      accessorFn: (item) => item.quantity ?? 0,
      cell: (item) => item.quantity != null ? parseFloat(String(item.quantity)).toLocaleString() : "-",
    },
    {
      id: "mounting_type",
      header: "Mount",
      size: 80,
      sortable: true,
      filterable: true,
      accessorFn: (item) => item.mounting_type ?? "",
      filterAccessor: (item) => item.mounting_type ?? "-",
      cell: (item) => item.mounting_type ? <Badge variant="outline">{item.mounting_type}</Badge> : "-",
    },
    {
      id: "customer",
      header: "Customer",
      size: 110,
      sortable: true,
      filterable: true,
      accessorFn: (item) => item.customer ?? "",
      filterAccessor: (item) => item.customer ?? "-",
      cell: (item) => item.customer ?? "-",
    },
    {
      id: "unit_price",
      header: "Unit Price",
      size: 110,
      align: "right",
      sortable: true,
      accessorFn: (item) => item.unit_price ?? 0,
      cell: (item) => {
        if (item.unit_price == null) return "-"
        return `${item.currency ?? ""} ${parseFloat(String(item.unit_price)).toFixed(4)}`
      },
    },
    {
      id: "comments",
      header: "Comments",
      size: 140,
      accessorFn: (item) => item.comments ?? "",
      cell: (item) => (
        <span className="text-sm truncate max-w-[140px] block">{item.comments ?? "-"}</span>
      ),
    },
  ]

  const isEmpty = (countData?.count ?? 0) === 0 && !isLoading

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {countData?.count != null ? `${countData.count.toLocaleString()} historical records` : ""}
        </p>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={handleImport}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
          >
            {importing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            Import Excel
          </Button>
        </div>
      </div>

      {isEmpty ? (
        <div className="text-center py-12 text-muted-foreground">
          <History className="mx-auto h-12 w-12 mb-4 opacity-50" />
          <p className="text-lg font-medium">No historical PO data</p>
          <p className="text-sm">Import your vendor PO record Excel file to view historical data here.</p>
        </div>
      ) : (
        <VirtualGrid
          data={history ?? []}
          columns={columns}
          isLoading={isLoading}
          searchPlaceholder="Search by PO#, supplier, IPN, MPN, customer..."
          searchFn={(item, q) =>
            (item.po_number ?? "").toLowerCase().includes(q) ||
            (item.supplier ?? "").toLowerCase().includes(q) ||
            (item.ipn ?? "").toLowerCase().includes(q) ||
            (item.mpn ?? "").toLowerCase().includes(q) ||
            (item.description ?? "").toLowerCase().includes(q) ||
            (item.manufacturer ?? "").toLowerCase().includes(q) ||
            (item.customer ?? "").toLowerCase().includes(q) ||
            (item.comments ?? "").toLowerCase().includes(q)
          }
          spreadsheet
          storageKey="po-history"
          getRowId={(r) => r.id}
        />
      )}
    </div>
  )
}
