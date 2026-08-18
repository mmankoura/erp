"use client"

import { useState, useRef, useCallback } from "react"
import { useApi } from "@/hooks/use-api"
import { api, type PackageType } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { AlertCircle, Loader2, Pencil, Trash2, X } from "lucide-react"
import { toast } from "sonner"
import { VirtualGrid, type VirtualGridColumn } from "@/components/virtual-grid"
import { useAuth } from "@/contexts/auth-context"

/**
 * Manual Stock Entry.
 *
 * A standalone ledger of stock keyed in by hand off the warehouse shelf.
 * Nothing here is validated against materials, AML or open POs, and nothing
 * here moves inventory — it is only this table.
 */

interface ManualStockEntry {
  id: string
  uid: string | null
  ipn: string
  description: string | null
  mpn: string | null
  manufacturer: string | null
  // Postgres decimal arrives as a string
  quantity: string | number
  package_type: PackageType
  location: string | null
  date_code: string | null
  lot_code: string | null
  reference: string | null
  notes: string | null
  entered_by: string
  entered_at: string
}

const PACKAGE_TYPES: PackageType[] = ["REEL", "TUBE", "TRAY", "BAG", "BOX", "BULK", "TR", "OTHER"]

const EMPTY_FORM = {
  uid: "",
  ipn: "",
  description: "",
  mpn: "",
  manufacturer: "",
  quantity: "",
  package_type: "REEL" as PackageType,
  location: "",
  date_code: "",
  lot_code: "",
  reference: "",
  notes: "",
}

type FormState = typeof EMPTY_FORM

const dash = (v: string | null) => v && v.trim() ? v : "—"

function buildColumns(
  onEdit: (row: ManualStockEntry) => void,
  onDelete: (row: ManualStockEntry) => void,
): VirtualGridColumn<ManualStockEntry>[] {
  return [
    { id: "uid", header: "UID", size: 150, accessorFn: (r) => r.uid ?? "", cell: (r) => <span className="font-mono text-xs">{dash(r.uid)}</span> },
    { id: "ipn", header: "IPN", size: 140, accessorFn: (r) => r.ipn, cell: (r) => <span className="font-medium">{r.ipn}</span> },
    { id: "description", header: "Description", size: 220, accessorFn: (r) => r.description ?? "", cell: (r) => <span className="text-muted-foreground truncate block">{dash(r.description)}</span> },
    { id: "mpn", header: "MPN", size: 150, accessorFn: (r) => r.mpn ?? "", cell: (r) => <span className="font-mono text-xs">{dash(r.mpn)}</span> },
    { id: "manufacturer", header: "Manufacturer", size: 150, accessorFn: (r) => r.manufacturer ?? "", cell: (r) => <span>{dash(r.manufacturer)}</span> },
    { id: "quantity", header: "Qty", size: 90, align: "right", accessorFn: (r) => Number(r.quantity), cell: (r) => <span className="font-mono tabular-nums">{Number(r.quantity).toLocaleString()}</span> },
    { id: "package_type", header: "Package", size: 90, accessorFn: (r) => r.package_type, cell: (r) => <span>{r.package_type}</span> },
    { id: "location", header: "Location", size: 110, accessorFn: (r) => r.location ?? "", cell: (r) => <span className="font-mono text-xs">{dash(r.location)}</span> },
    { id: "date_code", header: "Date Code", size: 100, accessorFn: (r) => r.date_code ?? "", cell: (r) => <span className="font-mono text-xs">{dash(r.date_code)}</span> },
    { id: "lot_code", header: "Lot Code", size: 120, accessorFn: (r) => r.lot_code ?? "", cell: (r) => <span className="font-mono text-xs">{dash(r.lot_code)}</span> },
    { id: "reference", header: "Reference", size: 150, accessorFn: (r) => r.reference ?? "", cell: (r) => <span>{dash(r.reference)}</span> },
    { id: "notes", header: "Notes", size: 200, accessorFn: (r) => r.notes ?? "", cell: (r) => <span className="text-muted-foreground truncate block">{dash(r.notes)}</span> },
    { id: "entered_by", header: "Entered By", size: 120, accessorFn: (r) => r.entered_by, cell: (r) => <span>{r.entered_by}</span> },
    { id: "entered_at", header: "Entered", size: 150, accessorFn: (r) => r.entered_at, cell: (r) => <span className="text-muted-foreground text-xs">{new Date(r.entered_at).toLocaleString()}</span> },
    {
      id: "actions",
      header: "",
      size: 80,
      sortable: false,
      filterable: false,
      accessorFn: () => "",
      cell: (r) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit entry" onClick={() => onEdit(r)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" title="Delete entry" onClick={() => onDelete(r)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ]
}

export default function ManualStockPage() {
  const { user } = useAuth()
  const { data: entries, isLoading, refetch } = useApi<ManualStockEntry[]>("/manual-stock")

  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const uidRef = useRef<HTMLInputElement>(null)

  const setField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }, [])

  const resetForm = useCallback(() => {
    setForm(EMPTY_FORM)
    setEditingId(null)
    setError(null)
    setTimeout(() => uidRef.current?.focus(), 50)
  }, [])

  const handleSubmit = async () => {
    setError(null)

    if (!form.ipn.trim()) { setError("IPN is required"); return }
    if (!form.quantity || parseFloat(form.quantity) <= 0) { setError("Quantity must be greater than 0"); return }

    // Blank optional fields are omitted rather than sent as "" — the backend
    // stores them as NULL, and the grid renders NULL as an em dash.
    const optional = (v: string) => v.trim() || undefined
    const payload = {
      uid: optional(form.uid),
      ipn: form.ipn.trim(),
      description: optional(form.description),
      mpn: optional(form.mpn),
      manufacturer: optional(form.manufacturer),
      quantity: parseFloat(form.quantity),
      package_type: form.package_type,
      location: optional(form.location),
      date_code: optional(form.date_code),
      lot_code: optional(form.lot_code),
      reference: optional(form.reference),
      notes: optional(form.notes),
    }

    setSubmitting(true)
    try {
      if (editingId) {
        await api.patch(`/manual-stock/${editingId}`, payload)
        toast.success(`Updated ${payload.ipn}`)
      } else {
        await api.post("/manual-stock", {
          ...payload,
          entered_by: user?.username ?? "operator",
        })
        toast.success(`Added ${payload.ipn} × ${payload.quantity.toLocaleString()}`)
      }
      await refetch()
      resetForm()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save entry")
    } finally {
      setSubmitting(false)
    }
  }

  const handleEdit = useCallback((row: ManualStockEntry) => {
    setEditingId(row.id)
    setError(null)
    setForm({
      uid: row.uid ?? "",
      ipn: row.ipn,
      description: row.description ?? "",
      mpn: row.mpn ?? "",
      manufacturer: row.manufacturer ?? "",
      quantity: String(Number(row.quantity)),
      package_type: row.package_type,
      location: row.location ?? "",
      date_code: row.date_code ?? "",
      lot_code: row.lot_code ?? "",
      reference: row.reference ?? "",
      notes: row.notes ?? "",
    })
    window.scrollTo({ top: 0, behavior: "smooth" })
  }, [])

  const handleDelete = useCallback(async (row: ManualStockEntry) => {
    if (!confirm(`Delete manual entry for ${row.ipn} (${Number(row.quantity).toLocaleString()} pcs)?`)) return
    try {
      await api.delete(`/manual-stock/${row.id}`)
      setEditingId((current) => (current === row.id ? null : current))
      await refetch()
      toast.success(`Deleted ${row.ipn}`)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete entry")
    }
  }, [refetch])

  const columns = buildColumns(handleEdit, handleDelete)

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && e.ctrlKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const textField = (
    key: keyof FormState,
    label: string,
    placeholder: string,
    ref?: React.Ref<HTMLInputElement>,
  ) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        ref={ref}
        value={form[key] as string}
        onChange={(e) => setField(key, e.target.value as FormState[typeof key])}
        placeholder={placeholder}
      />
    </div>
  )

  return (
    <div className="space-y-6" onKeyDown={handleKeyDown}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Manual Stock Entry</h1>
          <p className="text-sm text-muted-foreground">
            Hand-keyed warehouse stock. Not validated against materials, and not added to inventory.
          </p>
        </div>
        {entries && entries.length > 0 && (
          <Badge variant="outline" className="text-base px-3 py-1">
            {entries.length} entr{entries.length !== 1 ? "ies" : "y"}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: entry form */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-4 flex-row items-center justify-between space-y-0">
            <CardTitle className="text-lg">{editingId ? "Edit Entry" : "New Entry"}</CardTitle>
            {editingId && (
              <Button variant="ghost" size="sm" onClick={resetForm}>
                <X className="h-3.5 w-3.5 mr-1" />
                Cancel
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {textField("uid", "UID", "Scan or type UID (optional)", uidRef)}
            {textField("ipn", "IPN", "Internal part number")}
            {textField("description", "Description", "e.g. RES 1K 0402 1%")}
            {textField("mpn", "MFG PN", "Manufacturer part number")}
            {textField("manufacturer", "Manufacturer", "Manufacturer name")}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Quantity</Label>
                <Input
                  type="number"
                  value={form.quantity}
                  onChange={(e) => setField("quantity", e.target.value)}
                  placeholder="0"
                  min="0"
                  step="any"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Package</Label>
                <Select
                  value={form.package_type}
                  onValueChange={(v) => setField("package_type", v as PackageType)}
                >
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

            <div className="grid grid-cols-2 gap-3">
              {textField("location", "Location", "e.g. A-12-3")}
              {textField("date_code", "Date Code", "e.g. 2413")}
            </div>

            {textField("lot_code", "Lot Code", "Supplier lot / batch")}
            {textField("reference", "Reference", "e.g. PO-4471, DigiKey order")}

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setField("notes", e.target.value)}
                placeholder="Anything worth recording"
                rows={2}
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-md p-2">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <Button onClick={handleSubmit} disabled={submitting} className="w-full" size="lg">
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                editingId ? "Save Changes (Ctrl+Enter)" : "Add Entry (Ctrl+Enter)"
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Right: the table */}
        <div className="lg:col-span-2">
          <VirtualGrid
            data={entries}
            columns={columns}
            title="Manual Stock"
            isLoading={isLoading}
            searchPlaceholder="Search UID, IPN, MPN, manufacturer, location..."
            searchFn={(r, q) =>
              [r.uid, r.ipn, r.description, r.mpn, r.manufacturer, r.location, r.lot_code, r.reference]
                .some((v) => (v ?? "").toLowerCase().includes(q))
            }
            height={640}
            spreadsheet
            storageKey="manual-stock"
            getRowId={(r) => r.id}
            emptyMessage="No manual stock entries yet."
          />
        </div>
      </div>
    </div>
  )
}
