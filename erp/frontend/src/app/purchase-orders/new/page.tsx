"use client"

import React, { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { useApi, useMutation } from "@/hooks/use-api"
import {
  api,
  type PurchaseOrder,
  type Supplier,
  type Material,
  type CreatePurchaseOrderDto,
  type CreatePurchaseOrderLineDto,
} from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ArrowLeft, Plus, Pencil, Upload, X } from "lucide-react"

interface LineItemForm {
  material_id: string
  ipn_search: string
  quantity_ordered: number
  unit_cost: number | null
  manufacturer: string
  manufacturer_pn: string
  notes: string
  customer_name: string
  description: string
  resource_type: string
}

function createEmptyLine(): LineItemForm {
  return {
    material_id: "",
    ipn_search: "",
    quantity_ordered: 1,
    unit_cost: null,
    manufacturer: "",
    manufacturer_pn: "",
    notes: "",
    customer_name: "",
    description: "",
    resource_type: "",
  }
}

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

export default function NewPurchaseOrderPage() {
  const router = useRouter()

  const [poNumber, setPoNumber] = useState("")
  const [supplierId, setSupplierId] = useState("")
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split("T")[0])
  const [expectedDate, setExpectedDate] = useState(
    addBusinessDays(new Date(), 2).toISOString().split("T")[0],
  )
  const [currency, setCurrency] = useState("USD")
  const [notes, setNotes] = useState("")
  const [lines, setLines] = useState<LineItemForm[]>([createEmptyLine()])
  const [activeNoteIndex, setActiveNoteIndex] = useState<number | null>(null)
  const [showPasteModal, setShowPasteModal] = useState(false)
  const [pasteText, setPasteText] = useState("")

  const { data: suppliers } = useApi<Supplier[]>("/suppliers")
  const { data: materials } = useApi<Material[]>("/materials")

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

  const handleRemoveLine = (index: number) => {
    if (lines.length <= 1) return
    setLines((prev) => prev.filter((_, i) => i !== index))
    if (activeNoteIndex === index) setActiveNoteIndex(null)
  }

  const handlePasteImport = () => {
    if (!pasteText.trim()) return
    const rows = pasteText.trim().split("\n")
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

    const usedColumns = new Set<number>()
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
      const hasOnlyEmpty = lines.length === 1 && !lines[0].material_id && !lines[0].ipn_search
      setLines(hasOnlyEmpty ? newLines : [...lines, ...newLines])
      toast.success(`Imported ${newLines.length} line(s)`)
    } else {
      toast.error("Could not parse any lines from pasted data")
    }

    setPasteText("")
    setShowPasteModal(false)
  }

  const createMutation = useMutation(
    (data: CreatePurchaseOrderDto) => api.post<PurchaseOrder>("/purchase-orders", data),
    {
      onSuccess: (po) => {
        toast.success("Purchase order created successfully")
        router.push(`/purchase-orders/${po.id}`)
      },
      onError: (error) => toast.error(error.message || "Failed to create purchase order"),
    },
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

    createMutation.mutate({
      po_number: poNumber.trim() || undefined,
      supplier_id: supplierId,
      order_date: orderDate,
      expected_date: expectedDate || undefined,
      currency,
      notes: notes || undefined,
      lines: lineItems.length > 0 ? lineItems : undefined,
    })
  }

  const isLoading = createMutation.isLoading
  const totalAmount = lines.reduce(
    (sum, l) => sum + (l.unit_cost || 0) * l.quantity_ordered,
    0,
  )

  return (
    <div className="space-y-4">
      <Link href="/purchase-orders">
        <Button variant="ghost" size="sm">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to POs
        </Button>
      </Link>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">New Purchase Order</h1>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={() => setShowPasteModal(true)}>
              <Upload className="h-4 w-4 mr-1" />
              Paste from DigiKey
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/purchase-orders")}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !supplierId}>
              {isLoading ? "Saving..." : "Create PO"}
            </Button>
          </div>
        </div>

        <div className="rounded-md border bg-muted/30 px-4 py-3">
          <div className="grid grid-cols-6 gap-4">
            <div className="space-y-1">
              <Label className="text-xs">PO #</Label>
              <Input
                value={poNumber}
                onChange={(e) => setPoNumber(e.target.value)}
                placeholder="Auto-generated"
                className="h-8 font-mono"
              />
            </div>
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
              <Input
                type="date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
                className="h-8"
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Expected Date</Label>
              <Input
                type="date"
                value={expectedDate}
                onChange={(e) => setExpectedDate(e.target.value)}
                className="h-8"
              />
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
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes..."
                className="h-8"
              />
            </div>
          </div>
        </div>

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
                const filtered =
                  line.ipn_search && !line.material_id
                    ? materials?.filter((m) =>
                        m.internal_part_number
                          .toLowerCase()
                          .includes(line.ipn_search.toLowerCase()),
                      ) || []
                    : []

                return (
                  <React.Fragment key={index}>
                    <TableRow className="group">
                      <TableCell className="text-center text-muted-foreground text-xs">
                        {index + 1}
                      </TableCell>
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
                                  <span className="text-muted-foreground ml-1">
                                    — {m.description}
                                  </span>
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
                          <Badge variant="outline" className="text-[10px] px-1 py-0">
                            {line.resource_type}
                          </Badge>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="p-1">
                        <Input
                          value={line.manufacturer}
                          onChange={(e) =>
                            updateLine(index, { manufacturer: e.target.value })
                          }
                          placeholder="Manufacturer"
                          className="h-7 text-xs border-transparent bg-transparent hover:border-input focus:border-input"
                        />
                      </TableCell>
                      <TableCell className="p-1">
                        <Input
                          value={line.manufacturer_pn}
                          onChange={(e) =>
                            updateLine(index, { manufacturer_pn: e.target.value })
                          }
                          placeholder="MPN"
                          className="h-7 text-xs border-transparent bg-transparent hover:border-input focus:border-input"
                        />
                      </TableCell>
                      <TableCell className="p-1">
                        <Input
                          type="number"
                          min="1"
                          value={line.quantity_ordered}
                          onChange={(e) =>
                            updateLine(index, {
                              quantity_ordered: Number(e.target.value) || 1,
                            })
                          }
                          className="h-7 text-xs text-right border-transparent bg-transparent hover:border-input focus:border-input"
                        />
                      </TableCell>
                      <TableCell className="p-1">
                        <Input
                          type="number"
                          min="0"
                          step="any"
                          value={line.unit_cost ?? ""}
                          onChange={(e) =>
                            updateLine(index, {
                              unit_cost: e.target.value ? Number(e.target.value) : null,
                            })
                          }
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
                            onClick={() =>
                              setActiveNoteIndex(activeNoteIndex === index ? null : index)
                            }
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

        <div className="flex items-center justify-between">
          <Button type="button" variant="outline" size="sm" onClick={handleAddLine}>
            <Plus className="h-4 w-4 mr-1" />
            Add Line
          </Button>
          {totalAmount > 0 && (
            <span className="text-sm">
              <span className="text-muted-foreground">Total: </span>
              <span className="font-medium">
                {currency} {totalAmount.toFixed(2)}
              </span>
            </span>
          )}
        </div>
      </form>

      {showPasteModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-lg border shadow-lg w-[600px] max-h-[80vh] flex flex-col">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <h3 className="font-semibold">Paste from DigiKey</h3>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => {
                  setShowPasteModal(false)
                  setPasteText("")
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-4 flex-1 overflow-auto space-y-3">
              <p className="text-sm text-muted-foreground">
                Copy your DigiKey cart/order table and paste it below. The &quot;Customer
                Reference&quot; column will be matched to your IPNs.
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
              <Button
                variant="outline"
                onClick={() => {
                  setShowPasteModal(false)
                  setPasteText("")
                }}
              >
                Cancel
              </Button>
              <Button onClick={handlePasteImport} disabled={!pasteText.trim()}>
                Import Lines
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
