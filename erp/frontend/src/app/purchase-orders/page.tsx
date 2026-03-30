"use client"

import React from "react"
import { useApi, useMutation } from "@/hooks/use-api"
import {
  api,
  type PurchaseOrder,
  type PurchaseOrderStatus,
  type Supplier,
  type Material,
  type CreatePurchaseOrderDto,
  type CreatePurchaseOrderLineDto,
  type PoHistory,
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
  X,
  Upload,
  Loader2,
  History,
} from "lucide-react"
import { useState, useEffect, useRef } from "react"
import { toast } from "sonner"

// Calculate date + N business days (skips weekends)
function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date)
  let added = 0
  while (added < days) {
    result.setDate(result.getDate() + 1)
    const dow = result.getDay()
    if (dow !== 0 && dow !== 6) added++
  }
  return result
}

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
  ipn_search: string
  quantity_ordered: number
  unit_cost: number | null
  manufacturer: string
  manufacturer_pn: string
  notes: string
  // Auto-populated display fields
  customer_name: string
  description: string
  resource_type: string
}

// Create/Edit PO Dialog — full-window with excel-style line table
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
  const defaultExpected = addBusinessDays(new Date(), 2).toISOString().split("T")[0]
  const [expectedDate, setExpectedDate] = useState(
    purchaseOrder?.expected_date?.split("T")[0] || defaultExpected
  )
  const [currency, setCurrency] = useState(purchaseOrder?.currency || "USD")
  const [notes, setNotes] = useState(purchaseOrder?.notes || "")
  const [lines, setLines] = useState<LineItemForm[]>([])
  const [activeNoteIndex, setActiveNoteIndex] = useState<number | null>(null)
  const [showPasteModal, setShowPasteModal] = useState(false)
  const [pasteText, setPasteText] = useState("")

  const { data: suppliers } = useApi<Supplier[]>("/suppliers")
  const { data: materials } = useApi<Material[]>("/materials")

  useEffect(() => {
    if (open && !purchaseOrder) {
      setSupplierId("")
      setOrderDate(new Date().toISOString().split("T")[0])
      setExpectedDate(addBusinessDays(new Date(), 2).toISOString().split("T")[0])
      setCurrency("USD")
      setNotes("")
      setLines([createEmptyLine()])
      setActiveNoteIndex(null)
    }
  }, [open, purchaseOrder])

  function createEmptyLine(): LineItemForm {
    return {
      material_id: "", ipn_search: "", quantity_ordered: 1, unit_cost: null,
      manufacturer: "", manufacturer_pn: "",
      notes: "", customer_name: "", description: "", resource_type: "",
    }
  }

  const updateLine = (index: number, updates: Partial<LineItemForm>) => {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...updates } : l)))
  }

  const handleIpnChange = (index: number, value: string) => {
    updateLine(index, { ipn_search: value, material_id: "" })
  }

  const handleIpnSelect = (index: number, materialId: string) => {
    const material = materials?.find((m) => m.id === materialId)
    if (!material) return
    updateLine(index, {
      material_id: materialId,
      ipn_search: material.internal_part_number,
      manufacturer: material.manufacturer || "",
      manufacturer_pn: material.manufacturer_pn || "",
      customer_name: material.customer?.name || "",
      description: material.description || "",
      resource_type: material.resource_type || "",
    })
  }

  const handleAddLine = () => {
    setLines((prev) => [...prev, createEmptyLine()])
  }

  const handlePasteImport = () => {
    if (!pasteText.trim()) return
    const rows = pasteText.trim().split("\n")
    // Detect header row and find column indices
    const firstRow = rows[0].split("\t")
    const headerMap: Record<string, number> = {}
    const headerKeywords: Record<string, string[]> = {
      index: ["index", "#"],
      mpn: ["manufacturer part number", "manufacturer part #", "mfg part", "mpn"],
      manufacturer: ["manufacturer"],
      description: ["description"],
      customerRef: ["customer reference", "customer ref", "reference"],
      quantity: ["quantity", "qty"],
      unitPrice: ["unit price", "price"],
    }

    // Try to match headers — check longer/more specific keywords first,
    // and don't let two keys claim the same column index
    const usedColumns = new Set<number>()
    // Process mpn before manufacturer so "Manufacturer Part Number" maps to mpn, not manufacturer
    const keyOrder = ["mpn", "customerRef", "unitPrice", "manufacturer", "description", "quantity", "index"]
    for (let i = 0; i < firstRow.length; i++) {
      const col = firstRow[i].trim().toLowerCase()
      for (const key of keyOrder) {
        if (key in headerMap) continue
        const keywords = headerKeywords[key]
        if (keywords?.some((kw) => col.includes(kw)) && !usedColumns.has(i)) {
          headerMap[key] = i
          usedColumns.add(i)
          break
        }
      }
    }

    const hasHeaders = "mpn" in headerMap || "manufacturer" in headerMap
    const dataRows = hasHeaders ? rows.slice(1) : rows

    const materialMap = new Map<string, Material>()
    materials?.forEach((m) => {
      materialMap.set(m.internal_part_number.toLowerCase(), m)
    })

    const newLines: LineItemForm[] = []
    for (const row of dataRows) {
      const cols = row.split("\t")
      if (cols.length < 3) continue
      // Skip subtotal/empty rows
      if (cols.every((c) => !c.trim()) || row.toLowerCase().includes("subtotal")) continue

      const get = (key: string, fallbackIdx?: number): string => {
        const idx = headerMap[key] ?? fallbackIdx
        return idx !== undefined && idx < cols.length ? cols[idx].trim() : ""
      }

      const mpn = get("mpn", 2)
      const mfg = get("manufacturer", 3)
      const desc = get("description", 4)
      const custRef = get("customerRef", 5)
      const qtyStr = get("quantity", 6)
      const priceStr = get("unitPrice", 8)

      const qty = parseInt(qtyStr) || 1
      const price = parseFloat(priceStr.replace(/[$,]/g, "")) || null

      // Try to match customer reference to IPN
      const matchedMaterial = custRef ? materialMap.get(custRef.toLowerCase()) : undefined

      newLines.push({
        material_id: matchedMaterial?.id || "",
        ipn_search: matchedMaterial?.internal_part_number || custRef || "",
        quantity_ordered: qty,
        unit_cost: price,
        manufacturer: mfg,
        manufacturer_pn: mpn,
        notes: "",
        customer_name: matchedMaterial?.customer?.name || "",
        description: matchedMaterial?.description || desc,
        resource_type: matchedMaterial?.resource_type || "",
      })
    }

    if (newLines.length > 0) {
      // Replace the empty starting line if it exists
      const hasOnlyEmpty = lines.length === 1 && !lines[0].material_id && !lines[0].ipn_search
      setLines(hasOnlyEmpty ? newLines : [...lines, ...newLines])
      toast.success(`Imported ${newLines.length} line(s)`)
    } else {
      toast.error("Could not parse any lines from pasted data")
    }

    setPasteText("")
    setShowPasteModal(false)
  }

  const handleRemoveLine = (index: number) => {
    if (lines.length <= 1) return
    setLines((prev) => prev.filter((_, i) => i !== index))
    if (activeNoteIndex === index) setActiveNoteIndex(null)
  }

  const createMutation = useMutation(
    (data: CreatePurchaseOrderDto) => api.post<PurchaseOrder>("/purchase-orders", data),
    {
      onSuccess: () => {
        toast.success("Purchase order created successfully")
        setOpen(false)
        onSuccess()
      },
      onError: (error) => toast.error(error.message || "Failed to create purchase order"),
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
      onError: (error) => toast.error(error.message || "Failed to update purchase order"),
    }
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const lineItems: CreatePurchaseOrderLineDto[] = lines
      .filter((line) => line.material_id)
      .map((line) => ({
        material_id: line.material_id,
        quantity_ordered: line.quantity_ordered,
        unit_cost: line.unit_cost || undefined,
        manufacturer: line.manufacturer,
        manufacturer_pn: line.manufacturer_pn,
        packaging: "",
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
  const totalAmount = lines.reduce((sum, l) => sum + (l.unit_cost || 0) * l.quantity_ordered, 0)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent showCloseButton={false} className="!max-w-[95vw] w-full !h-[90vh] flex flex-col p-0">
        <DialogTitle className="sr-only">
          {purchaseOrder ? "Edit Purchase Order" : "New Purchase Order"}
        </DialogTitle>
        <form onSubmit={handleSubmit} className="flex flex-col h-full">
          {/* Header bar */}
          <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
            <div>
              <h2 className="text-lg font-semibold">
                {purchaseOrder ? "Edit Purchase Order" : "New Purchase Order"}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              {!purchaseOrder && (
                <Button type="button" variant="outline" onClick={() => setShowPasteModal(true)}>
                  <Upload className="h-4 w-4 mr-1" />
                  Paste from DigiKey
                </Button>
              )}
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading || !supplierId}>
                {isLoading ? "Saving..." : purchaseOrder ? "Update" : "Create PO"}
              </Button>
            </div>
          </div>

          {/* PO header fields */}
          <div className="px-6 py-3 border-b shrink-0 bg-muted/30">
            <div className="grid grid-cols-5 gap-4">
              <div className="space-y-1">
                <Label className="text-xs">Supplier *</Label>
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder="Select supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers?.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} ({s.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Order Date *</Label>
                <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)}
                  className="h-8" required disabled={!!purchaseOrder} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Expected Date</Label>
                <Input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)}
                  className="h-8" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Currency</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="CAD">CAD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="GBP">GBP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">PO Notes</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional notes..." className="h-8" />
              </div>
            </div>
          </div>

          {/* Excel-style line items table */}
          {!purchaseOrder && (
            <div className="flex-1 overflow-auto px-6 py-3">
              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-[40px] text-center">#</TableHead>
                      <TableHead className="w-[180px]">IPN</TableHead>
                      <TableHead className="w-[120px]">Client</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="w-[60px]">Type</TableHead>
                      <TableHead className="w-[150px]">Manufacturer *</TableHead>
                      <TableHead className="w-[150px]">MPN *</TableHead>
                      <TableHead className="w-[80px] text-right">Qty *</TableHead>
                      <TableHead className="w-[100px] text-right">Unit Cost</TableHead>
                      <TableHead className="w-[70px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((line, index) => {
                      const filtered = line.ipn_search && !line.material_id
                        ? (materials?.filter((m) =>
                            m.internal_part_number.toLowerCase().includes(line.ipn_search.toLowerCase())
                          ) || [])
                        : []

                      return (
                        <React.Fragment key={index}>
                          <TableRow className="group">
                            <TableCell className="text-center text-muted-foreground text-xs">{index + 1}</TableCell>
                            <TableCell className="p-1 relative">
                              <Input
                                value={line.ipn_search}
                                onChange={(e) => handleIpnChange(index, e.target.value)}
                                placeholder="Type IPN..."
                                className="h-7 text-xs border-transparent bg-transparent hover:border-input focus:border-input"
                              />
                              {filtered.length > 0 && (
                                <div className="absolute z-50 left-1 right-1 top-full mt-0.5 max-h-48 overflow-y-auto bg-popover border rounded-md shadow-lg">
                                  {filtered.slice(0, 15).map((m) => (
                                    <button
                                      key={m.id}
                                      type="button"
                                      className="w-full text-left px-2 py-1 text-xs hover:bg-accent truncate"
                                      onClick={() => handleIpnSelect(index, m.id)}
                                    >
                                      <span className="font-medium">{m.internal_part_number}</span>
                                      {m.description && (
                                        <span className="text-muted-foreground ml-1">— {m.description}</span>
                                      )}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground truncate max-w-[120px]">
                              {line.customer_name || "—"}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground truncate max-w-[200px]">
                              {line.description || "—"}
                            </TableCell>
                            <TableCell className="text-xs">
                              {line.resource_type ? (
                                <Badge variant="outline" className="text-[10px] px-1 py-0">{line.resource_type}</Badge>
                              ) : "—"}
                            </TableCell>
                            <TableCell className="p-1">
                              <Input
                                value={line.manufacturer}
                                onChange={(e) => updateLine(index, { manufacturer: e.target.value })}
                                placeholder="Manufacturer"
                                className="h-7 text-xs border-transparent bg-transparent hover:border-input focus:border-input"
                              />
                            </TableCell>
                            <TableCell className="p-1">
                              <Input
                                value={line.manufacturer_pn}
                                onChange={(e) => updateLine(index, { manufacturer_pn: e.target.value })}
                                placeholder="MPN"
                                className="h-7 text-xs border-transparent bg-transparent hover:border-input focus:border-input"
                              />
                            </TableCell>
                            <TableCell className="p-1">
                              <Input
                                type="number"
                                min="1"
                                value={line.quantity_ordered}
                                onChange={(e) => updateLine(index, { quantity_ordered: Number(e.target.value) || 1 })}
                                className="h-7 text-xs text-right border-transparent bg-transparent hover:border-input focus:border-input"
                              />
                            </TableCell>
                            <TableCell className="p-1">
                              <Input
                                type="number"
                                min="0"
                                step="any"
                                value={line.unit_cost ?? ""}
                                onChange={(e) => updateLine(index, { unit_cost: e.target.value ? Number(e.target.value) : null })}
                                placeholder="0.00"
                                className="h-7 text-xs text-right border-transparent bg-transparent hover:border-input focus:border-input"
                              />
                            </TableCell>
                            <TableCell className="p-1">
                              <div className="flex items-center gap-0.5">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 opacity-0 group-hover:opacity-100"
                                  title="Add comment"
                                  onClick={() => setActiveNoteIndex(activeNoteIndex === index ? null : index)}
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-destructive opacity-0 group-hover:opacity-100"
                                  onClick={() => handleRemoveLine(index)}
                                  disabled={lines.length <= 1}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                          {activeNoteIndex === index && (
                            <TableRow key={`note-${index}`}>
                              <TableCell></TableCell>
                              <TableCell colSpan={10} className="py-1 px-1">
                                <Input
                                  value={line.notes}
                                  onChange={(e) => updateLine(index, { notes: e.target.value })}
                                  placeholder="Comment for this line..."
                                  className="h-7 text-xs"
                                  autoFocus
                                />
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
              <div className="flex items-center justify-between mt-2">
                <Button type="button" variant="outline" size="sm" onClick={handleAddLine}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Line
                </Button>
                {totalAmount > 0 && (
                  <span className="text-sm">
                    <span className="text-muted-foreground">Total: </span>
                    <span className="font-medium">{currency} {totalAmount.toFixed(2)}</span>
                  </span>
                )}
              </div>
            </div>
          )}
        </form>

        {/* Paste from DigiKey modal */}
        {showPasteModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
            <div className="bg-background rounded-lg border shadow-lg w-[600px] max-h-[80vh] flex flex-col">
              <div className="px-4 py-3 border-b flex items-center justify-between">
                <h3 className="font-semibold">Paste from DigiKey</h3>
                <Button variant="ghost" size="icon" className="h-7 w-7"
                  onClick={() => { setShowPasteModal(false); setPasteText("") }}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="p-4 flex-1 overflow-auto space-y-3">
                <p className="text-sm text-muted-foreground">
                  Copy your DigiKey cart/order table and paste it below. The &quot;Customer Reference&quot; column will be matched to your IPNs.
                </p>
                <Textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder="Paste tab-separated data from DigiKey here..."
                  rows={12}
                  className="font-mono text-xs"
                  autoFocus
                />
              </div>
              <div className="px-4 py-3 border-t flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setShowPasteModal(false); setPasteText("") }}>
                  Cancel
                </Button>
                <Button onClick={handlePasteImport} disabled={!pasteText.trim()}>
                  Import Lines
                </Button>
              </div>
            </div>
          </div>
        )}
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
                    <TableHead>Mfg / MPN</TableHead>
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
                          <p className="text-xs text-muted-foreground">
                            {line.material?.customer?.name || "-"} | {line.material?.resource_type || "-"}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <p>{line.manufacturer || "-"}</p>
                          <p className="text-xs text-muted-foreground">{line.manufacturer_pn || "-"}</p>
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
                        {line.unit_cost ? `${po.currency} ${parseFloat(String(line.unit_cost)).toFixed(2)}` : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {line.unit_cost
                          ? `${po.currency} ${(parseFloat(String(line.unit_cost)) * parseFloat(String(line.quantity_ordered))).toFixed(2)}`
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
      defaultWidth: 120,
      cell: (po) => <span className="font-medium">{po.po_number}</span>,
    },
    {
      key: "supplier",
      header: "Supplier",
      defaultWidth: 180,
      cell: (po) => po.supplier?.name || "-",
    },
    {
      key: "status",
      header: "Status",
      defaultWidth: 130,
      cell: (po) => (
        <Badge variant={statusConfig[po.status].variant}>{statusConfig[po.status].label}</Badge>
      ),
    },
    {
      key: "order_date",
      header: "Order Date",
      defaultWidth: 120,
      cell: (po) => new Date(po.order_date).toLocaleDateString(),
    },
    {
      key: "expected_date",
      header: "Expected",
      defaultWidth: 120,
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
      defaultWidth: 120,
      className: "text-right",
      cell: (po) =>
        po.total_amount ? `${po.currency} ${parseFloat(String(po.total_amount)).toFixed(2)}` : "-",
    },
    {
      key: "actions",
      header: "",
      defaultWidth: 100,
      resizable: false,
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

      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">Active POs</TabsTrigger>
          <TabsTrigger value="history">
            <History className="h-4 w-4 mr-1" />
            History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-4">
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
            storageKey="purchase-orders"
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

  const columns: Column<PoHistory>[] = [
    {
      key: "po_number",
      header: "PO #",
      defaultWidth: 120,
      cell: (item) => <span className="font-mono font-medium">{item.po_number}</span>,
      sortable: true,
    },
    {
      key: "order_date",
      header: "Date",
      defaultWidth: 100,
      cell: (item) => item.order_date ? new Date(item.order_date).toLocaleDateString() : "-",
      sortable: true,
      sortAccessor: (item) => item.order_date ?? "",
    },
    {
      key: "supplier",
      header: "Supplier",
      defaultWidth: 130,
      cell: (item) => item.supplier ?? "-",
      sortable: true,
      sortAccessor: (item) => item.supplier ?? "",
    },
    {
      key: "ipn",
      header: "IPN (AT&A#)",
      defaultWidth: 120,
      cell: (item) => <span className="font-mono text-sm">{item.ipn ?? "-"}</span>,
      sortable: true,
      sortAccessor: (item) => item.ipn ?? "",
    },
    {
      key: "manufacturer",
      header: "MFR",
      defaultWidth: 130,
      cell: (item) => item.manufacturer ?? "-",
      sortable: true,
      sortAccessor: (item) => item.manufacturer ?? "",
    },
    {
      key: "mpn",
      header: "MPN",
      defaultWidth: 150,
      cell: (item) => <span className="font-mono text-sm">{item.mpn ?? "-"}</span>,
      sortable: true,
      sortAccessor: (item) => item.mpn ?? "",
    },
    {
      key: "description",
      header: "Description",
      defaultWidth: 200,
      cell: (item) => (
        <span className="text-sm truncate max-w-[200px] block">{item.description ?? "-"}</span>
      ),
    },
    {
      key: "quantity",
      header: "Qty",
      defaultWidth: 80,
      className: "text-right",
      cell: (item) => item.quantity != null ? parseFloat(String(item.quantity)).toLocaleString() : "-",
      sortable: true,
      sortAccessor: (item) => item.quantity ?? 0,
    },
    {
      key: "mounting_type",
      header: "Mount",
      defaultWidth: 70,
      cell: (item) => item.mounting_type ? <Badge variant="outline">{item.mounting_type}</Badge> : "-",
    },
    {
      key: "customer",
      header: "Customer",
      defaultWidth: 100,
      cell: (item) => item.customer ?? "-",
      sortable: true,
      sortAccessor: (item) => item.customer ?? "",
    },
    {
      key: "unit_price",
      header: "Unit Price",
      defaultWidth: 100,
      className: "text-right",
      cell: (item) => {
        if (item.unit_price == null) return "-"
        return `${item.currency ?? ""} ${parseFloat(String(item.unit_price)).toFixed(4)}`
      },
      sortable: true,
      sortAccessor: (item) => item.unit_price ?? 0,
    },
    {
      key: "comments",
      header: "Comments",
      defaultWidth: 120,
      cell: (item) => (
        <span className="text-sm truncate max-w-[120px] block">{item.comments ?? "-"}</span>
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
        <DataTable
          data={history ?? []}
          columns={columns}
          isLoading={isLoading}
          searchFilter={(item, query) => {
            const q = query.toLowerCase()
            return (
              (item.po_number ?? "").toLowerCase().includes(q) ||
              (item.supplier ?? "").toLowerCase().includes(q) ||
              (item.ipn ?? "").toLowerCase().includes(q) ||
              (item.mpn ?? "").toLowerCase().includes(q) ||
              (item.description ?? "").toLowerCase().includes(q) ||
              (item.manufacturer ?? "").toLowerCase().includes(q) ||
              (item.customer ?? "").toLowerCase().includes(q) ||
              (item.comments ?? "").toLowerCase().includes(q)
            )
          }}
          searchPlaceholder="Search by PO#, supplier, IPN, MPN, customer..."
          emptyMessage="No records match your search."
          storageKey="po-history"
        />
      )}
    </div>
  )
}
