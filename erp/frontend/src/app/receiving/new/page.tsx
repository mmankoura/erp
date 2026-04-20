"use client"

import { useState, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useApi } from "@/hooks/use-api"
import { api, type Customer, type PackageType } from "@/lib/api"
import { Button } from "@/components/ui/button"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { CheckCircle, AlertCircle, Loader2 } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"

type ReceiptType = "PO" | "CUSTOMER_SUPPLIED" | "STOCK"

interface ReceivedItem {
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
      } else {
        if (mpn.trim()) payload.received_mpn = mpn.trim()
        if (manufacturer.trim()) payload.received_manufacturer = manufacturer.trim()
        if (poReference.trim()) payload.po_reference = poReference.trim()
      }

      const result = await api.post<{
        lot: { uid: string }
        material: { internal_part_number: string; description: string | null }
        po_line_updated: boolean
      }>("/receiving/quick-receive", payload)

      const selectedCustomer = customers?.find((c) => c.id === selectedCustomerId)

      setReceivedItems((prev) => [
        {
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
            onClick={() => router.push("/receiving")}
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
        <Card className="lg:col-span-2">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Receipt Log</CardTitle>
          </CardHeader>
          <CardContent>
            {receivedItems.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-8">
                No items received yet. Fill in the form and click Receive.
              </p>
            ) : (
              <div className="overflow-auto max-h-[600px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">#</TableHead>
                      <TableHead>UID</TableHead>
                      <TableHead>IPN</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead>Package</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {receivedItems.map((item, idx) => (
                      <TableRow key={`${item.uid}-${idx}`}>
                        <TableCell className="text-muted-foreground">{receivedItems.length - idx}</TableCell>
                        <TableCell className="font-mono text-xs">{item.uid}</TableCell>
                        <TableCell className="font-medium">{item.ipn}</TableCell>
                        <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">
                          {item.description ?? "\u2014"}
                        </TableCell>
                        <TableCell className="text-right">{item.qty}</TableCell>
                        <TableCell>{item.package_type}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {item.receipt_type === "PO"
                              ? `PO ${item.po_number ?? ""}`
                              : item.receipt_type === "CUSTOMER_SUPPLIED"
                                ? item.customer_name ?? "Customer"
                                : "Stock"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-green-600">
                            <CheckCircle className="h-4 w-4" />
                            <span className="text-xs">
                              {item.po_line_updated ? "Received" : "In Stock"}
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
