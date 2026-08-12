"use client"

import { useState, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useApi } from "@/hooks/use-api"
import { api, type Customer, type PackageType } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Chip } from "@/components/grid/chip"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { CheckCircle, AlertCircle, Loader2, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { VirtualGrid, type VirtualGridColumn } from "@/components/virtual-grid"
import { useAuth } from "@/contexts/auth-context"

type ReceiptType = "PO" | "CUSTOMER_SUPPLIED" | "STOCK"

interface ReceivedItem {
  id: string
  lot_id: string
  uid: string
  ipn: string
  description: string | null
  qty: number
  package_type: string
  receipt_type: ReceiptType
  po_number?: string
  customer_name?: string
  po_line_updated: boolean
  timestamp: Date
  undone?: boolean
}

// Column builder — delete handler passed in at component level
function buildReceiptLogColumns(onUndo: (item: ReceivedItem) => void): VirtualGridColumn<ReceivedItem>[] {
  return [
    { id: "uid", header: "UID", size: 160, sortable: true, filterable: true, filterAccessor: (r) => r.uid, accessorFn: (r) => r.uid, cell: (r) => <span className={`font-mono text-xs ${r.undone ? "line-through text-muted-foreground" : ""}`}>{r.uid}</span> },
    { id: "ipn", header: "IPN", size: 140, sortable: true, filterable: true, filterAccessor: (r) => r.ipn, accessorFn: (r) => r.ipn, cell: (r) => <span className={`font-medium ${r.undone ? "line-through text-muted-foreground" : ""}`}>{r.ipn}</span> },
    { id: "description", header: "Description", size: 200, accessorFn: (r) => r.description ?? "", cell: (r) => <span className="text-muted-foreground truncate block">{r.description ?? "\u2014"}</span> },
    { id: "qty", header: "Qty", size: 80, align: "right", sortable: true, accessorFn: (r) => r.qty, cell: (r) => <span className={`font-mono tabular-nums ${r.undone ? "line-through text-muted-foreground" : ""}`}>{r.qty.toLocaleString()}</span> },
    { id: "package", header: "Package", size: 90, sortable: true, filterable: true, filterAccessor: (r) => r.package_type, accessorFn: (r) => r.package_type, cell: (r) => <span>{r.package_type}</span> },
    { id: "type", header: "Type", size: 140, sortable: true, filterable: true, filterAccessor: (r) => r.receipt_type === "PO" ? `PO ${r.po_number ?? ""}` : r.receipt_type === "CUSTOMER_SUPPLIED" ? r.customer_name ?? "Customer" : "Stock", accessorFn: (r) => r.receipt_type, cell: (r) => <Chip>{r.receipt_type === "PO" ? `PO ${r.po_number ?? ""}` : r.receipt_type === "CUSTOMER_SUPPLIED" ? r.customer_name ?? "Customer" : "Stock"}</Chip> },
    { id: "status", header: "Status", size: 100, accessorFn: (r) => r.undone ? "Undone" : r.po_line_updated ? "Received" : "In Stock", cell: (r) => r.undone ? <Chip tone="muted">Undone</Chip> : <span className="text-emerald-600">{r.po_line_updated ? "Received" : "In Stock"}</span> },
    { id: "actions", header: "", size: 60, accessorFn: () => "", cell: (r) => r.undone ? null : <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" title="Undo receive" onClick={() => onUndo(r)}><Trash2 className="h-3.5 w-3.5" /></Button> },
  ]
}

const PACKAGE_TYPES: PackageType[] = ["REEL", "TUBE", "TRAY", "BAG", "BOX", "BULK", "TR", "OTHER"]

export default function QuickReceivePage() {
  const { user } = useAuth()
  const router = useRouter()

  // Receipt type
  const [receiptType, setReceiptType] = useState<ReceiptType>("PO")

  // Common fields
  const [uid, setUid] = useState("")
  const [ipn, setIpn] = useState("")
  const [qty, setQty] = useState("")
  const [packageType, setPackageType] = useState<PackageType>("REEL")

  // PO mode
  const [poNumber, setPoNumber] = useState("")

  // Customer mode
  const [selectedCustomerId, setSelectedCustomerId] = useState("")

  // Stock mode
  const [mpn, setMpn] = useState("")
  const [manufacturer, setManufacturer] = useState("")
  const [poReference, setPoReference] = useState("")

  // State
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [receivedItems, setReceivedItems] = useState<ReceivedItem[]>([])

  const uidRef = useRef<HTMLInputElement>(null)

  // Fetch customers
  const { data: customers } = useApi<Customer[]>("/customers")

  const resetForm = useCallback(() => {
    setUid("")
    setIpn("")
    setQty("")
    setMpn("")
    setManufacturer("")
    setPoReference("")
    setError(null)
    setTimeout(() => uidRef.current?.focus(), 50)
  }, [])

  const handleReceive = async () => {
    setError(null)

    if (!uid.trim()) { setError("UID is required"); return }
    if (!ipn.trim()) { setError("IPN is required"); return }
    if (!qty || parseFloat(qty) <= 0) { setError("Quantity must be greater than 0"); return }
    if (receiptType === "PO" && !poNumber.trim()) { setError("Enter a PO number"); return }
    if (receiptType === "CUSTOMER_SUPPLIED" && !selectedCustomerId) { setError("Select a Customer"); return }

    setSubmitting(true)
    try {
      const payload: Record<string, unknown> = {
        receipt_type: receiptType,
        uid: uid.trim(),
        received_ipn: ipn.trim(),
        quantity_received: parseFloat(qty),
        package_type: packageType,
        received_by: user?.username ?? "operator",
      }

      if (receiptType === "PO") {
        payload.po_number = poNumber.trim()
      } else if (receiptType === "CUSTOMER_SUPPLIED") {
        payload.customer_id = selectedCustomerId
        if (poReference.trim()) payload.po_reference = poReference.trim()
      } else {
        if (mpn.trim()) payload.received_mpn = mpn.trim()
        if (manufacturer.trim()) payload.received_manufacturer = manufacturer.trim()
        if (poReference.trim()) payload.po_reference = poReference.trim()
      }

      const result = await api.post<{
        lot: { id: string; uid: string }
        material: { internal_part_number: string; description: string | null }
        po_line_updated: boolean
      }>("/receiving/quick-receive", payload)

      const selectedCustomer = customers?.find((c) => c.id === selectedCustomerId)

      setReceivedItems((prev) => [
        {
          id: `${result.lot.uid}-${Date.now()}`,
          lot_id: result.lot.id,
          uid: result.lot.uid,
          ipn: result.material.internal_part_number,
          description: result.material.description,
          qty: parseFloat(qty),
          package_type: packageType,
          receipt_type: receiptType,
          po_number: poNumber || undefined,
          customer_name: selectedCustomer?.name,
          po_line_updated: result.po_line_updated,
          timestamp: new Date(),
        },
        ...prev,
      ])

      resetForm()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to receive item"
      setError(message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleUndo = async (item: ReceivedItem) => {
    if (!confirm(`Undo receive for ${item.uid} (${item.ipn}, ${item.qty} pcs)? This will delete the lot and reverse the inventory transaction.`)) return
    try {
      await api.post(`/receiving/undo-receive/${item.lot_id}`, { undone_by: user?.username })
      setReceivedItems((prev) =>
        prev.map((r) => r.id === item.id ? { ...r, undone: true } : r)
      )
      toast.success(`Undone: ${item.uid} (${item.ipn})`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to undo"
      toast.error(message)
    }
  }

  const receiptLogColumns = buildReceiptLogColumns(handleUndo)

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && e.ctrlKey) {
      e.preventDefault()
      handleReceive()
    }
  }

  return (
    <div className="space-y-6" onKeyDown={handleKeyDown}>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Receive Materials</h1>
        <div className="flex items-center gap-3">
          {receivedItems.length > 0 && (
            <Badge variant="outline" className="text-base px-3 py-1">
              {receivedItems.length} item{receivedItems.length !== 1 ? "s" : ""} received
            </Badge>
          )}
          <Button
            variant="outline"
            onClick={() => router.push("/inventory")}
          >
            Complete Receiving
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Form */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Receipt Entry</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Receipt Type */}
            <div className="space-y-1.5">
              <Label>Receipt Type</Label>
              <Select value={receiptType} onValueChange={(v) => setReceiptType(v as ReceiptType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PO">Purchase Order</SelectItem>
                  <SelectItem value="CUSTOMER_SUPPLIED">Customer Supplied</SelectItem>
                  <SelectItem value="STOCK">Stock</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* PO Number */}
            {receiptType === "PO" && (
              <div className="space-y-1.5">
                <Label>PO Number</Label>
                <Input
                  value={poNumber}
                  onChange={(e) => setPoNumber(e.target.value)}
                  placeholder="Enter PO number"
                />
              </div>
            )}

            {/* Customer Selector */}
            {receiptType === "CUSTOMER_SUPPLIED" && (
              <>
                <div className="space-y-1.5">
                  <Label>Customer</Label>
                  <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select customer..." />
                    </SelectTrigger>
                    <SelectContent>
                      {customers?.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>PO # / Packing Slip #</Label>
                  <Input
                    value={poReference}
                    onChange={(e) => setPoReference(e.target.value)}
                    placeholder="Optional reference"
                  />
                </div>
              </>
            )}

            {/* Stock mode extra fields */}
            {receiptType === "STOCK" && (
              <>
                <div className="space-y-1.5">
                  <Label>MFG PN</Label>
                  <Input
                    value={mpn}
                    onChange={(e) => setMpn(e.target.value)}
                    placeholder="Manufacturer part number"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Manufacturer</Label>
                  <Input
                    value={manufacturer}
                    onChange={(e) => setManufacturer(e.target.value)}
                    placeholder="Manufacturer name"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>PO Reference</Label>
                  <Input
                    value={poReference}
                    onChange={(e) => setPoReference(e.target.value)}
                    placeholder="e.g., DigiKey order 12345"
                  />
                </div>
              </>
            )}

            <hr className="my-2" />

            {/* Common fields */}
            <div className="space-y-1.5">
              <Label>UID</Label>
              <Input
                ref={uidRef}
                value={uid}
                onChange={(e) => setUid(e.target.value)}
                placeholder="Scan UID barcode"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label>IPN</Label>
              <Input
                value={ipn}
                onChange={(e) => setIpn(e.target.value)}
                placeholder="Internal part number"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Quantity</Label>
                <Input
                  type="number"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  placeholder="0"
                  min="0"
                  step="any"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Package</Label>
                <Select value={packageType} onValueChange={(v) => setPackageType(v as PackageType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PACKAGE_TYPES.map((pt) => (
                      <SelectItem key={pt} value={pt}>{pt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-md p-2">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <Button
              onClick={handleReceive}
              disabled={submitting}
              className="w-full"
              size="lg"
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Receiving...
                </>
              ) : (
                "Receive (Ctrl+Enter)"
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Right: Receipt Log */}
        <div className="lg:col-span-2">
          <VirtualGrid
            data={receivedItems}
            columns={receiptLogColumns}
            title="Receipt Log"
            searchPlaceholder="Search by UID, IPN, package..."
            searchFn={(r, q) =>
              !!(r.uid.toLowerCase().includes(q) ||
              r.ipn.toLowerCase().includes(q) ||
              r.package_type.toLowerCase().includes(q) ||
              (r.description ?? "").toLowerCase().includes(q) ||
              (r.po_number ?? "").toLowerCase().includes(q) ||
              (r.customer_name ?? "").toLowerCase().includes(q))
            }
            height={500}
            spreadsheet
            storageKey="quick-receive-log"
            getRowId={(r) => r.uid}
          />
        </div>
      </div>
    </div>
  )
}
