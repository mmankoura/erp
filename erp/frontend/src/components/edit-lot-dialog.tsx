"use client"

import { useState, useEffect, type ReactNode } from "react"
import { useMutation } from "@/hooks/use-api"
import { api, type InventoryLot, type PackageType } from "@/lib/api"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"

const packageTypeOptions: PackageType[] = [
  "TR",
  "REEL",
  "TUBE",
  "TRAY",
  "BAG",
  "BOX",
  "BULK",
  "OTHER",
]

interface UpdateLotResponse {
  lot: InventoryLot
  affected_kitting_lists: string[]
}

interface EditLotDialogProps {
  lot: InventoryLot
  onSaved: () => void
  trigger: ReactNode
}

export function EditLotDialog({ lot, onSaved, trigger }: EditLotDialogProps) {
  const [open, setOpen] = useState(false)
  const [quantity, setQuantity] = useState("")
  const [packageType, setPackageType] = useState<PackageType>(lot.package_type)
  const [poReference, setPoReference] = useState("")
  const [bin, setBin] = useState("")
  const [reason, setReason] = useState("")

  const currentQty = parseFloat(String(lot.quantity))

  // Reseed from the lot each time the dialog opens — the grid row may have
  // been refetched since it was last closed.
  useEffect(() => {
    if (!open) return
    setQuantity(String(currentQty))
    setPackageType(lot.package_type)
    setPoReference(lot.po_reference ?? "")
    setBin(lot.bin ?? "")
    setReason("")
  }, [open, lot, currentQty])

  const parsedQty = quantity.trim() === "" ? null : Number(quantity)
  const qtyInvalid =
    parsedQty === null || !Number.isFinite(parsedQty) || parsedQty < 0
  const delta = qtyInvalid ? 0 : parsedQty - currentQty
  const qtyChanged = delta !== 0

  const mutation = useMutation<UpdateLotResponse, Record<string, unknown>>(
    (payload) => api.patch<UpdateLotResponse>(`/inventory/lots/${lot.id}`, payload),
    {
      onSuccess: (data) => {
        const kits = data.affected_kitting_lists
        toast.success(
          kits.length > 0
            ? `Lot ${lot.uid} updated · also updated kit ${kits.join(", ")}`
            : `Lot ${lot.uid} updated`,
        )
        setOpen(false)
        onSaved()
      },
      onError: (err) => {
        toast.error(err instanceof Error ? err.message : "Failed to update lot")
      },
    },
  )

  const save = () => {
    if (qtyInvalid) {
      toast.error("Quantity must be a number of 0 or more")
      return
    }

    // Send only what changed. The API rejects unknown keys outright, and a
    // narrow payload keeps the audit diff meaningful.
    const payload: Record<string, unknown> = {}
    if (qtyChanged) payload.quantity = parsedQty
    if (packageType !== lot.package_type) payload.package_type = packageType
    if ((poReference.trim() || null) !== lot.po_reference) {
      payload.po_reference = poReference.trim() || null
    }
    if ((bin.trim() || null) !== lot.bin) payload.bin = bin.trim() || null
    if (qtyChanged && reason.trim()) payload.reason = reason.trim()

    if (Object.keys(payload).length === 0) {
      setOpen(false)
      return
    }
    mutation.mutate(payload)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        className="sm:max-w-[480px]"
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle className="font-mono">{lot.uid}</DialogTitle>
          <DialogDescription>
            {lot.material?.internal_part_number ?? "—"}
            {lot.material?.customer?.name ? ` · ${lot.material.customer.name}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="default">{lot.status}</Badge>
            <span>Received {parseFloat(String(lot.initial_quantity)).toLocaleString()}</span>
          </div>

          <div className="space-y-2">
            <Label htmlFor="lot-qty">Quantity</Label>
            <Input
              id="lot-qty"
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className={qtyInvalid ? "border-destructive" : ""}
            />
            {qtyInvalid ? (
              <p className="text-xs text-destructive">
                Enter a quantity of 0 or more.
              </p>
            ) : qtyChanged ? (
              <p className="text-xs">
                <span className="text-muted-foreground">
                  {currentQty.toLocaleString()} &rarr; {parsedQty.toLocaleString()}{" "}
                </span>
                <span className={delta < 0 ? "text-destructive" : "text-green-600"}>
                  ({delta > 0 ? "+" : ""}
                  {delta.toLocaleString()})
                </span>
                <span className="text-muted-foreground">
                  {" "}
                  &middot; an ADJUSTMENT transaction will be recorded
                </span>
              </p>
            ) : null}
          </div>

          {qtyChanged && (
            <div className="space-y-2">
              <Label htmlFor="lot-reason">Reason (optional)</Label>
              <Input
                id="lot-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. recounted the reel"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="lot-package">Package</Label>
              <Select
                value={packageType}
                onValueChange={(v) => setPackageType(v as PackageType)}
              >
                <SelectTrigger id="lot-package">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {packageTypeOptions.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="lot-bin">BIN</Label>
              <Input
                id="lot-bin"
                value={bin}
                onChange={(e) => setBin(e.target.value)}
                maxLength={50}
                className="font-mono"
                placeholder="—"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="lot-po">PO Reference</Label>
            <Input
              id="lot-po"
              value={poReference}
              onChange={(e) => setPoReference(e.target.value)}
              maxLength={100}
              placeholder="—"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={mutation.isLoading || qtyInvalid}>
            {mutation.isLoading ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
