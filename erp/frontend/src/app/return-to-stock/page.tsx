"use client"

import { useState, useRef, useCallback } from "react"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { RotateCcw, CheckCircle, AlertCircle, Loader2 } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"

interface ReturnedItem {
  uid: string
  ipn: string
  description: string | null
  qty: number
  newLotQty: number
  timestamp: Date
}

export default function ReturnToStockPage() {
  const { user } = useAuth()
  const [uid, setUid] = useState("")
  const [qty, setQty] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [returnedItems, setReturnedItems] = useState<ReturnedItem[]>([])

  const uidRef = useRef<HTMLInputElement>(null)

  const resetForm = useCallback(() => {
    setUid("")
    setQty("")
    setError(null)
    setTimeout(() => uidRef.current?.focus(), 50)
  }, [])

  const handleReturn = async () => {
    setError(null)

    if (!uid.trim()) { setError("UID is required"); return }
    if (qty === "" || qty === undefined) { setError("Quantity is required"); return }
    if (parseFloat(qty) < 0) { setError("Quantity cannot be negative"); return }

    setSubmitting(true)
    try {
      const result = await api.post<{
        transaction: { id: string }
        lot: {
          uid: string
          ipn: string
          description: string | null
          quantity: number
          location: string
          status: string
        }
      }>("/inventory/return-to-stock", {
        uid: uid.trim(),
        quantity: parseFloat(qty),
        returned_by: user?.username ?? "operator",
      })

      setReturnedItems((prev) => [
        {
          uid: result.lot.uid,
          ipn: result.lot.ipn,
          description: result.lot.description,
          qty: parseFloat(qty),
          newLotQty: result.lot.quantity,
          timestamp: new Date(),
        },
        ...prev,
      ])

      resetForm()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to return to stock"
      setError(message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && e.ctrlKey) {
      e.preventDefault()
      handleReturn()
    }
  }

  return (
    <div className="space-y-6" onKeyDown={handleKeyDown}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <RotateCcw className="h-6 w-6" />
            Return to Stock
          </h1>
          <p className="text-muted-foreground mt-1">
            Scan a UID and enter quantity to return material to stock
          </p>
        </div>
        {returnedItems.length > 0 && (
          <Badge variant="outline" className="text-base px-3 py-1">
            {returnedItems.length} item{returnedItems.length !== 1 ? "s" : ""} returned
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Form */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Return Entry</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
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

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-md p-2">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <Button
              onClick={handleReturn}
              disabled={submitting}
              className="w-full"
              size="lg"
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Returning...
                </>
              ) : (
                "Return to Stock (Ctrl+Enter)"
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Right: Return Log */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Return Log</CardTitle>
          </CardHeader>
          <CardContent>
            {returnedItems.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-8">
                No items returned yet. Scan a UID and enter quantity.
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
                      <TableHead className="text-right">Qty Returned</TableHead>
                      <TableHead className="text-right">New Lot Qty</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {returnedItems.map((item, idx) => (
                      <TableRow key={`${item.uid}-${idx}`}>
                        <TableCell className="text-muted-foreground">{returnedItems.length - idx}</TableCell>
                        <TableCell className="font-mono text-xs">{item.uid}</TableCell>
                        <TableCell className="font-medium">{item.ipn}</TableCell>
                        <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">
                          {item.description ?? "\u2014"}
                        </TableCell>
                        <TableCell className="text-right font-mono">{item.qty}</TableCell>
                        <TableCell className="text-right font-mono">{item.newLotQty}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-green-600">
                            <CheckCircle className="h-4 w-4" />
                            <span className="text-xs">Returned</span>
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
