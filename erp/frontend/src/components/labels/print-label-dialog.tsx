"use client"

import { useCallback, useEffect, useState } from "react"
import { api, type LotLabelData } from "@/lib/api"
import { useDymo } from "@/hooks/use-dymo"
import { printLotLabels, DymoUnavailableError } from "@/lib/dymo/print"
import { labelFieldPreview } from "@/lib/dymo/labelset"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { AlertCircle, Loader2, Printer, RefreshCw } from "lucide-react"
import { toast } from "sonner"

interface PrintLabelDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * Lots to print. Pass ids and the dialog fetches the label data itself, so
   * every caller gets the same fields and the same null rules without
   * assembling them from whatever it happened to have on hand.
   */
  lotIds?: string[]
  /**
   * Reprint by scanned UID instead. Resolved through
   * GET /labels/lot/by-uid/:uid so the scan path shares this one dialog rather
   * than growing a second printer picker of its own.
   */
  uid?: string
  /** Shown in the header, e.g. the UID for a single-lot reprint. */
  subject?: string
}

export function PrintLabelDialog({
  open,
  onOpenChange,
  lotIds = [],
  uid,
  subject,
}: PrintLabelDialogProps) {
  const { available, printers, printer, setPrinter, refresh } = useDymo()
  const [labels, setLabels] = useState<LotLabelData[] | null>(null)
  const [copies, setCopies] = useState("1")
  const [loading, setLoading] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Callers pass array literals, so depend on a stable key rather than the
  // array identity — otherwise every parent render refetches.
  const lotKey = uid ?? lotIds.join(",")

  useEffect(() => {
    if (!open || (!uid && lotIds.length === 0)) return

    let cancelled = false
    setLoading(true)
    setError(null)
    // Drop the previous result so a reopened dialog cannot show the last lot's
    // fields while the new fetch is still in flight.
    setLabels(null)
    ;(async () => {
      try {
        const data = uid
          ? [
              await api.get<LotLabelData>(
                `/labels/lot/by-uid/${encodeURIComponent(uid)}`,
              ),
            ]
          : lotIds.length === 1
            ? [await api.get<LotLabelData>(`/labels/lot/${lotIds[0]}`)]
            : await api.post<LotLabelData[]>("/labels/lots", { lot_ids: lotIds })
        if (!cancelled) setLabels(data)
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load label data")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lotKey])

  const handlePrint = useCallback(async () => {
    if (!labels?.length) return
    setPrinting(true)
    try {
      const { printed } = await printLotLabels(printer, labels, {
        copies: parseInt(copies, 10) || 1,
      })
      toast.success(`Sent ${printed} label${printed === 1 ? "" : "s"} to ${printer}`)
      onOpenChange(false)
    } catch (err: unknown) {
      const message =
        err instanceof DymoUnavailableError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to print"
      toast.error(message)
    } finally {
      setPrinting(false)
    }
  }, [labels, printer, copies, onOpenChange])

  const unavailable = available === false
  const count = labels?.length ?? (uid ? 1 : lotIds.length)
  // A batch is the same template repeated, so previewing the first record is
  // representative.
  const preview = labels?.[0] ? labelFieldPreview(labels[0]) : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Print {count === 1 ? "Label" : `${count} Labels`}
          </DialogTitle>
          <DialogDescription>
            {subject ??
              (uid ? `UID ${uid}` : `${count} lot${count === 1 ? "" : "s"} selected`)}
          </DialogDescription>
        </DialogHeader>

        {unavailable ? (
          <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div className="space-y-1">
              <p className="font-medium">Label printing is unavailable</p>
              <p className="text-muted-foreground">
                DYMO Connect must be installed and running on this workstation.
                Receiving works normally without it.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="label-printer">Printer</Label>
                <div className="flex gap-2">
                  <Select value={printer} onValueChange={setPrinter}>
                    <SelectTrigger id="label-printer" className="flex-1">
                      <SelectValue placeholder="Select a printer" />
                    </SelectTrigger>
                    <SelectContent>
                      {printers.map((p) => (
                        <SelectItem key={p.name} value={p.name}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="icon"
                    title="Rescan for printers"
                    onClick={() => void refresh()}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="label-copies">Copies</Label>
                <Input
                  id="label-copies"
                  type="number"
                  min={1}
                  value={copies}
                  onChange={(e) => setCopies(e.target.value)}
                />
              </div>
            </div>

            {/* The values that will be merged into the .dymo template. DYMO
                Connect's web service has no working RenderLabel, so this is
                what stands in for a visual preview. */}
            <div className="rounded-md border">
              <div className="border-b bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground">
                Label contents{count > 1 ? " (first of " + count + ")" : ""}
              </div>
              <div className="max-h-56 overflow-y-auto p-3">
                {loading ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : error ? (
                  <p className="text-sm text-destructive">{error}</p>
                ) : preview ? (
                  <dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1 text-sm">
                    {preview.map((row) => (
                      <div key={row.column} className="contents">
                        <dt className="truncate text-muted-foreground">{row.column}</dt>
                        <dd className="truncate font-mono text-xs">
                          {row.value || <span className="text-muted-foreground">—</span>}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handlePrint}
            disabled={unavailable || printing || loading || !printer || !labels?.length}
          >
            {printing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Printer className="mr-2 h-4 w-4" />
            )}
            Print
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
