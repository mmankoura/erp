"use client"

import { useRouter } from "next/navigation"
import { useApi, useMutation } from "@/hooks/use-api"
import { RecentTransactionsGrid } from "@/components/recent-transactions-grid"
import { VirtualGrid, type VirtualGridColumn } from "@/components/virtual-grid"
import type { CellEdit, CellCommitResult } from "@/components/grid/types"
import {
  api,
  type InventoryStock,
  type InventoryTransaction,
  type InventoryLot,
  type InventoryAllocation,
  type Material,
} from "@/lib/api"
import type { FilterGroup } from "@/components/relational-filter-builder"
import { InventoryImportWizard } from "@/components/inventory-import-wizard"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Plus,
  History,
  AlertTriangle,
  Package,
  Upload,
  Trash2,
  MapPin,
  Pencil,
  Lock,
  LockOpen,
} from "lucide-react"
import { useState, useMemo, useEffect, useRef } from "react"
import { toast } from "sonner"
import { useAuth, UserRole } from "@/contexts/auth-context"
import { EditLotDialog } from "@/components/edit-lot-dialog"

// Transaction type colors
const transactionTypeConfig: Record<string, { label: string; color: string }> = {
  RECEIPT: { label: "Receipt", color: "text-green-600" },
  CONSUMPTION: { label: "Consumption", color: "text-red-600" },
  ADJUSTMENT: { label: "Adjustment", color: "text-blue-600" },
  SCRAP: { label: "Scrap", color: "text-orange-600" },
  TRANSFER: { label: "Transfer", color: "text-purple-600" },
  ISSUE_TO_WO: { label: "Issue to WO", color: "text-yellow-600" },
  RETURN_FROM_WO: { label: "Return from WO", color: "text-teal-600" },
}


// Transaction History Dialog
function TransactionHistoryDialog({
  stock,
  trigger,
}: {
  stock: InventoryStock
  trigger: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const { data: transactions, isLoading } = useApi<InventoryTransaction[]>(
    `/inventory/${stock.material_id}/transactions?limit=50`,
    { enabled: open }
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-[700px] max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Transaction History</DialogTitle>
          <DialogDescription>
            {stock.material?.internal_part_number} - Recent transactions
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-auto max-h-[400px]">
          {isLoading ? (
            <p className="text-center text-muted-foreground py-8">Loading...</p>
          ) : transactions && transactions.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((tx) => {
                  const config = transactionTypeConfig[tx.transaction_type] || {
                    label: tx.transaction_type,
                    color: "",
                  }
                  return (
                    <TableRow key={tx.id}>
                      <TableCell className="text-sm">
                        {new Date(tx.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <span className={config.color}>{config.label}</span>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        <span
                          className={
                            tx.quantity > 0
                              ? "text-green-600"
                              : tx.quantity < 0
                                ? "text-red-600"
                                : ""
                          }
                        >
                          {tx.quantity > 0 ? "+" : ""}
                          {tx.quantity}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[150px] truncate">
                        {tx.reason || "-"}
                      </TableCell>
                      <TableCell className="text-sm">{tx.created_by || "-"}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          ) : (
            <p className="text-center text-muted-foreground py-8">No transactions found</p>
          )}
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

// Add Receive Dialog
function ReceiveStockDialog({
  onSuccess,
  trigger,
}: {
  onSuccess: () => void
  trigger: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [materialId, setMaterialId] = useState("")
  const [quantity, setQuantity] = useState("")
  const [unitCost, setUnitCost] = useState("")
  const [reason, setReason] = useState("")

  const { data: materials } = useApi<Material[]>("/materials")

  const receiveMutation = useMutation(
    (data: { material_id: string; quantity: number; transaction_type: string; unit_cost?: number; reason?: string }) =>
      api.post("/inventory/transaction", data),
    {
      onSuccess: () => {
        toast.success("Stock received successfully")
        setOpen(false)
        setMaterialId("")
        setQuantity("")
        setUnitCost("")
        setReason("")
        onSuccess()
      },
      onError: (error) => {
        toast.error(error.message || "Failed to receive stock")
      },
    }
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const qty = parseFloat(quantity)
    if (isNaN(qty) || !materialId) return

    receiveMutation.mutate({
      material_id: materialId,
      quantity: qty,
      transaction_type: "RECEIPT",
      unit_cost: unitCost ? parseFloat(unitCost) : undefined,
      reason: reason || undefined,
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Receive Stock</DialogTitle>
            <DialogDescription>Record a new inventory receipt</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Material *</Label>
              <Select value={materialId} onValueChange={setMaterialId} required>
                <SelectTrigger>
                  <SelectValue placeholder="Select material" />
                </SelectTrigger>
                <SelectContent>
                  {materials?.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.internal_part_number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="quantity">Quantity *</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="0"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="unitCost">Unit Cost</Label>
                <Input
                  id="unitCost"
                  type="number"
                  min="0"
                  step="0.01"
                  value={unitCost}
                  onChange={(e) => setUnitCost(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="reason">Notes</Label>
              <Textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="PO reference, supplier, etc."
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={receiveMutation.isLoading || !materialId || !quantity}>
              {receiveMutation.isLoading ? "Saving..." : "Receive"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// Allocation Popover - shows allocation breakdown when clicking allocated qty
function AllocationPopover({ materialId, quantity }: { materialId: string; quantity: number }) {
  const [open, setOpen] = useState(false)
  const { data: allocations, isLoading } = useApi<InventoryAllocation[]>(
    `/inventory/${materialId}/allocations`,
    { enabled: open }
  )

  if (quantity <= 0) {
    return <span className="font-mono">0</span>
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="font-mono text-yellow-600 underline decoration-dotted underline-offset-2 cursor-pointer hover:text-yellow-700"
          onClick={(e) => e.stopPropagation()}
        >
          {quantity.toLocaleString()}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start" onClick={(e) => e.stopPropagation()}>
        <div className="p-3 border-b">
          <p className="text-sm font-medium">Allocation Breakdown</p>
        </div>
        <div className="max-h-[300px] overflow-auto">
          {isLoading ? (
            <p className="text-center text-muted-foreground py-4 text-sm">Loading...</p>
          ) : allocations && allocations.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Order</TableHead>
                  <TableHead className="text-xs text-right">Qty</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allocations.map((alloc) => (
                  <TableRow key={alloc.id}>
                    <TableCell className="text-xs font-medium">
                      {alloc.order?.order_number || "-"}
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono">
                      {alloc.quantity}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={alloc.status === "ACTIVE" ? "default" : "secondary"}
                        className="text-[10px]"
                      >
                        {alloc.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(alloc.created_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-center text-muted-foreground py-4 text-sm">No allocations</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// Extended type with id for DataTable
type InventoryStockWithId = InventoryStock & { id: string }

// Extended type for lots DataTable
type InventoryLotWithId = InventoryLot & { id: string }

function BinCell({ lot, onSaved }: { lot: InventoryLotWithId; onSaved: () => void }) {
  const [value, setValue] = useState<string>(lot.bin ?? "")
  const [saving, setSaving] = useState(false)
  useEffect(() => { setValue(lot.bin ?? "") }, [lot.bin])

  const commit = async () => {
    const trimmed = value.trim()
    const original = lot.bin ?? ""
    if (trimmed === original) return
    setSaving(true)
    try {
      await api.patch(`/inventory/lots/${lot.id}/bin`, { bin: trimmed || null })
      onSaved()
    } catch (err) {
      setValue(original)
      toast.error(err instanceof Error ? err.message : "Failed to update bin")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur()
        if (e.key === "Escape") { setValue(lot.bin ?? ""); (e.target as HTMLInputElement).blur() }
      }}
      placeholder="—"
      disabled={saving}
      className="h-7 text-xs font-mono"
    />
  )
}

interface AssignStockLocationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

function AssignStockLocationDialog({ open, onOpenChange, onSuccess }: AssignStockLocationDialogProps) {
  const [uid, setUid] = useState("")
  const [bin, setBin] = useState("")
  const [saving, setSaving] = useState(false)
  const [history, setHistory] = useState<Array<{ uid: string; bin: string; ipn: string }>>([])
  const uidRef = useRef<HTMLInputElement | null>(null)
  const binRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (open) {
      setUid("")
      setBin("")
      setHistory([])
      setTimeout(() => uidRef.current?.focus(), 50)
    }
  }, [open])

  const submit = async () => {
    const trimmedUid = uid.trim()
    const trimmedBin = bin.trim()
    if (!trimmedUid || !trimmedBin) {
      toast.error("UID and BIN are both required")
      return
    }
    setSaving(true)
    try {
      const lot = await api.get<InventoryLot & { id: string }>(`/inventory/lots/by-uid/${encodeURIComponent(trimmedUid)}`)
      await api.patch(`/inventory/lots/${lot.id}/bin`, { bin: trimmedBin })
      toast.success(`${trimmedUid} → ${trimmedBin}`)
      setHistory((prev) => [
        { uid: trimmedUid, bin: trimmedBin, ipn: lot.material?.internal_part_number ?? "" },
        ...prev,
      ].slice(0, 10))
      setUid("")
      setBin("")
      onSuccess()
      setTimeout(() => uidRef.current?.focus(), 50)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to assign location"
      toast.error(msg.includes("404") ? `UID "${trimmedUid}" not found` : msg)
      setTimeout(() => uidRef.current?.focus(), 50)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Assign Stock Location
          </DialogTitle>
          <DialogDescription>
            Scan the UID, then scan or type the BIN. Press Enter to advance and submit.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label htmlFor="asl-uid">UID</Label>
            <Input
              id="asl-uid"
              ref={uidRef}
              value={uid}
              onChange={(e) => setUid(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  binRef.current?.focus()
                }
              }}
              placeholder="Scan or type UID..."
              className="font-mono"
              disabled={saving}
              autoComplete="off"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="asl-bin">BIN / Stock Location</Label>
            <Input
              id="asl-bin"
              ref={binRef}
              value={bin}
              onChange={(e) => setBin(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  submit()
                }
              }}
              placeholder="Scan or type BIN..."
              className="font-mono"
              disabled={saving}
              autoComplete="off"
            />
          </div>
        </div>
        {history.length > 0 && (
          <div className="border-t pt-3 space-y-1">
            <div className="text-xs font-medium text-muted-foreground">This session</div>
            <div className="max-h-40 overflow-auto space-y-0.5 text-xs font-mono">
              {history.map((h, i) => (
                <div key={i} className="flex justify-between gap-2">
                  <span className="font-medium truncate">{h.uid}</span>
                  <span className="text-muted-foreground truncate">{h.ipn}</span>
                  <span className="text-primary">→ {h.bin}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
          <Button onClick={submit} disabled={saving || !uid.trim() || !bin.trim()}>
            {saving ? "Assigning..." : "Assign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function InventoryPage() {
  const router = useRouter()
  const { data: inventoryRaw, isLoading, refetch } = useApi<InventoryStock[]>("/inventory")
  const { data: lowStock } = useApi<InventoryStock[]>("/inventory/low-stock?threshold=10")
  const { data: recentTransactions } = useApi<InventoryTransaction[]>(
    "/inventory/transactions/recent?limit=20"
  )
  const { data: lotsRaw, isLoading: lotsLoading, refetch: refetchLots } = useApi<InventoryLot[]>("/inventory/lots")
  const { hasRole } = useAuth()
  // Matches the @Roles on PATCH /inventory/lots/:id
  const canEditLots = hasRole(UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE_CLERK)
  // The Lots/Reels sheet is read-only until this is turned on, so a stray
  // keystroke can't move stock.
  const [editUnlocked, setEditUnlocked] = useState(false)
  // A quantity edit moves material on-hand, so the stock tab and summary cards
  // have to refresh alongside the lot list.
  const onLotSaved = () => { refetchLots(); refetch() }
  const [importWizardOpen, setImportWizardOpen] = useState(false)
  const [assignLocationOpen, setAssignLocationOpen] = useState(false)

  // Relational filter state
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  const [relationalFilterIds, setRelationalFilterIds] = useState<Set<string> | null>(null)
  const [activeRelationalFilterCount, setActiveRelationalFilterCount] = useState(0)

  const handleRelationalApply = async (filters: FilterGroup[], logic: "AND" | "OR") => {
    try {
      const result = await api.post<InventoryStock[]>("/inventory/filter", { filters, logic })
      const ids = new Set(result.map((s) => s.material_id))
      setRelationalFilterIds(ids)
      setActiveRelationalFilterCount(filters.length)
    } catch {
      setRelationalFilterIds(null)
      setActiveRelationalFilterCount(0)
    }
  }

  const handleRelationalClear = () => {
    setRelationalFilterIds(null)
    setActiveRelationalFilterCount(0)
  }

  const deleteLotMutation = useMutation(
    (id: string) => api.delete(`/inventory/lots/${id}`),
    {
      onSuccess: () => {
        toast.success("Lot deleted successfully")
        refetchLots()
        refetch()
      },
      onError: (error) => {
        toast.error(error.message || "Failed to delete lot")
      },
    }
  )

  const bulkDeleteLotsMutation = useMutation(
    (ids: string[]) => api.post<{ deleted: number }>("/inventory/lots/bulk-delete", { ids }),
    {
      onSuccess: (result) => {
        toast.success(`Deleted ${result.deleted} lots`)
        refetchLots()
        refetch()
      },
      onError: (error) => {
        toast.error(error.message || "Failed to delete lots")
      },
    }
  )

  // Transform lots for DataTable
  const lots: InventoryLotWithId[] | null = lotsRaw || null

  // Transform to add id field for DataTable compatibility
  const inventory: InventoryStockWithId[] | null = inventoryRaw
    ? inventoryRaw.map((item) => ({ ...item, id: item.material_id }))
    : null

  // Apply relational filter to inventory
  const filteredInventory = relationalFilterIds !== null && inventory
    ? inventory.filter((item) => relationalFilterIds.has(item.material_id))
    : inventory

  // Calculate summary stats
  const totalItems = inventory?.length || 0
  const totalOnHand = inventory?.reduce((sum, item) => sum + item.quantity_on_hand, 0) || 0
  const totalAllocated = inventory?.reduce((sum, item) => sum + item.quantity_allocated, 0) || 0
  const lowStockCount = lowStock?.length || 0

  // VirtualGrid columns for Stock Levels
  const stockVgColumns: VirtualGridColumn<InventoryStockWithId>[] = [
    { id: "customer", header: "Customer", size: 140, sortable: true, filterable: true, filterAccessor: (s) => s.material?.customer?.name || "-", accessorFn: (s) => s.material?.customer?.name || "", cell: (s) => <span className="text-sm">{s.material?.customer?.name || "\u2014"}</span> },
    { id: "material", header: "Material", size: 220, sortable: true, filterable: true, filterAccessor: (s) => s.material?.internal_part_number || "", accessorFn: (s) => s.material?.internal_part_number || "", cell: (s) => (<div><span className="font-medium text-sm">{s.material?.internal_part_number}</span>{s.material?.description && <p className="text-xs text-muted-foreground truncate">{s.material.description}</p>}</div>) },
    { id: "resource_type", header: "Type", size: 80, sortable: true, filterable: true, filterAccessor: (s) => s.material?.resource_type || "-", accessorFn: (s) => s.material?.resource_type || "", cell: (s) => s.material?.resource_type ? <Badge variant="outline">{s.material.resource_type}</Badge> : <span className="text-muted-foreground">{"\u2014"}</span> },
    { id: "on_hand", header: "On Hand", size: 100, align: "right", sortable: true, accessorFn: (s) => s.quantity_on_hand, cell: (s) => <span className="font-mono text-sm">{s.quantity_on_hand.toLocaleString()}</span> },
    { id: "required", header: "Required", size: 100, align: "right", sortable: true, accessorFn: (s) => s.quantity_required, cell: (s) => <span className={`font-mono text-sm ${s.quantity_required > 0 ? "text-purple-600" : ""}`}>{s.quantity_required.toLocaleString()}</span> },
    { id: "allocated", header: "Allocated", size: 100, align: "right", sortable: true, accessorFn: (s) => s.quantity_allocated, cell: (s) => <AllocationPopover materialId={s.material_id} quantity={s.quantity_allocated} /> },
    { id: "available", header: "Available", size: 100, align: "right", sortable: true, accessorFn: (s) => s.quantity_available, cell: (s) => <span className={`font-mono text-sm font-medium ${s.quantity_available <= 0 ? "text-red-600" : s.quantity_available < 10 ? "text-yellow-600" : "text-green-600"}`}>{s.quantity_available.toLocaleString()}</span> },
    { id: "on_order", header: "On Order", size: 100, align: "right", sortable: true, accessorFn: (s) => s.quantity_on_order, cell: (s) => <span className={`font-mono text-sm ${s.quantity_on_order > 0 ? "text-blue-600" : ""}`}>{s.quantity_on_order.toLocaleString()}</span> },
    { id: "actions", header: "", size: 120, sortable: false, filterable: false, accessorFn: () => "", cell: (s) => (<div className="flex items-center gap-1"><TransactionHistoryDialog stock={s} trigger={<Button variant="ghost" size="icon" className="h-8 w-8"><History className="h-4 w-4" /></Button>} /></div>) },
  ]

  const PACKAGE_TYPES = ["TR", "REEL", "TUBE", "TRAY", "BAG", "BOX", "BULK", "OTHER"] as const

  /** Every editable field on a lot is gated the same way the API gates it. */
  const lotIsEditable = (l: InventoryLotWithId): true | string =>
    l.status === "ACTIVE" ? true : `Only ACTIVE lots can be edited (this one is ${l.status})`

  /**
   * Persist grid edits. Grouped by lot because PATCH /inventory/lots/:id takes
   * all four editable fields at once — two cells on one row is one request, not
   * two. A failure is reported against every cell in that row's group, which is
   * how the open-physical-count refusal lands on the quantity cell naming the
   * count rather than as an anonymous toast.
   */
  const commitLotEdits = async (
    edits: CellEdit<InventoryLotWithId>[]
  ): Promise<CellCommitResult[]> => {
    const byLot = new Map<string, CellEdit<InventoryLotWithId>[]>()
    for (const edit of edits) {
      const group = byLot.get(edit.rowId) ?? []
      group.push(edit)
      byLot.set(edit.rowId, group)
    }

    const saveLot = async ([lotId, group]: [string, CellEdit<InventoryLotWithId>[]]): Promise<CellCommitResult[]> => {
      // Only whitelisted fields — the API's validation pipe rejects the rest.
      const payload: Record<string, unknown> = {}
      for (const edit of group) payload[edit.field] = edit.value
      if ("quantity" in payload) payload.reason = "Edited in the inventory sheet"

      try {
        await api.patch(`/inventory/lots/${lotId}`, payload)
        return group.map((e) => ({ rowId: lotId, columnId: e.columnId, ok: true as const }))
      } catch (err) {
        const error = err instanceof Error ? err.message : "Save failed"
        return group.map((e) => ({ rowId: lotId, columnId: e.columnId, ok: false as const, error }))
      }
    }

    // Four at a time. The endpoint takes a pessimistic_write lock per lot and
    // reconciles open kitting lists inside the same transaction, so a wide
    // paste firing every request at once would just fight for the pool.
    const queue = Array.from(byLot.entries())
    const results: CellCommitResult[] = []
    let cursor = 0
    const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
      while (cursor < queue.length) {
        const entry = queue[cursor++]
        results.push(...(await saveLot(entry)))
      }
    })
    await Promise.all(workers)
    return results
  }

  // VirtualGrid columns for Lots/Reels.
  // This grid runs in spreadsheet mode: 26px rows, so cells carry no font size
  // of their own (the grid sets text-xs) and no badges — a badge doesn't fit the
  // row, and it reads as a web table rather than a sheet.
  const lotsVgColumns: VirtualGridColumn<InventoryLotWithId>[] = [
    { id: "uid", header: "UID", size: 160, sortable: true, filterable: true, filterAccessor: (l) => l.uid, accessorFn: (l) => l.uid, cell: (l) => <span className="font-mono font-medium">{l.uid}</span> },
    { id: "customer", header: "Customer", size: 140, sortable: true, filterable: true, filterAccessor: (l) => l.material?.customer?.name || "-", accessorFn: (l) => l.material?.customer?.name || "", cell: (l) => <span>{l.material?.customer?.name || "\u2014"}</span> },
    { id: "ipn", header: "IPN", size: 160, sortable: true, filterable: true, filterAccessor: (l) => l.material?.internal_part_number || "", accessorFn: (l) => l.material?.internal_part_number || "", cell: (l) => <span className="font-medium">{l.material?.internal_part_number}</span> },
    // Bounds mirror UpdateLotDto's numeric(12,4) constraints, so a bad value is
    // refused inline instead of coming back as a 400.
    { id: "quantity", header: "Quantity", size: 100, align: "right", sortable: true, accessorFn: (l) => parseFloat(String(l.quantity)), cell: (l) => <span className="font-mono tabular-nums">{parseFloat(String(l.quantity)).toLocaleString()}</span>,
      // A pasted quantity moves on-hand stock, writes an ADJUSTMENT
      // transaction and silently adjusts open kitting lists, with no undo —
      // so it always asks first, however small the paste.
      edit: { field: "quantity", getValue: (l) => parseFloat(String(l.quantity)), isEditable: lotIsEditable, confirmOnPaste: true, editor: { kind: "number", min: 0, max: 99999999.9999, decimals: 4 } } },
    // package_type is an enum — a pasted "reel" has to be upper-cased or it 400s.
    { id: "package", header: "Package", size: 90, sortable: true, filterable: true, filterAccessor: (l) => l.package_type, accessorFn: (l) => l.package_type, cell: (l) => l.package_type,
      edit: { field: "package_type", getValue: (l) => l.package_type, isEditable: lotIsEditable, editor: { kind: "select", options: PACKAGE_TYPES, normalize: (raw) => raw.trim().toUpperCase() } } },
    { id: "po_ref", header: "PO Ref", size: 120, sortable: true, filterable: true, filterAccessor: (l) => l.po_reference || "-", accessorFn: (l) => l.po_reference || "", cell: (l) => <span className="text-muted-foreground">{l.po_reference || "\u2014"}</span>,
      edit: { field: "po_reference", getValue: (l) => l.po_reference, isEditable: lotIsEditable, editor: { kind: "text", maxLength: 100 } } },
    // BIN is now edited in place like any other cell, so the always-on input
    // BinCell used to render here is gone. It stays on the Receiving Log tab,
    // which is still a classic grid.
    { id: "bin", header: "BIN", size: 110, sortable: true, filterable: true, filterAccessor: (l) => l.bin || "-", accessorFn: (l) => l.bin || "", cell: (l) => <span className="font-mono">{l.bin || "\u2014"}</span>,
      edit: { field: "bin", getValue: (l) => l.bin, isEditable: lotIsEditable, editor: { kind: "text", maxLength: 50 } } },
    { id: "status", header: "Status", size: 100, sortable: true, filterable: true, filterAccessor: (l) => l.status, accessorFn: (l) => l.status, cell: (l) => <span className={l.status === "ACTIVE" ? "" : "text-muted-foreground"}>{l.status}</span> },
    // The accessor is an ISO timestamp, which is no use in Excel — copy the
    // displayed date instead.
    { id: "received", header: "Received", size: 110, sortable: true, accessorFn: (l) => l.received_date || "", copyValue: (l) => l.received_date ? new Date(l.received_date).toLocaleDateString() : "", cell: (l) => <span className="text-muted-foreground tabular-nums">{l.received_date ? new Date(l.received_date).toLocaleDateString() : "\u2014"}</span> },
    {
      id: "actions", header: "", size: 70, sortable: false, filterable: false, accessorFn: () => "",
      // Icon buttons are shrunk to fit the 26px spreadsheet row.
      cell: (l) => (
        <div className="flex items-center gap-0.5">
          {/* Only ACTIVE lots are editable — the API rejects the rest. */}
          {canEditLots && l.status === "ACTIVE" && (
            <EditLotDialog
              lot={l}
              onSaved={onLotSaved}
              trigger={
                <Button variant="ghost" size="icon" className="h-5 w-5" title="Edit lot">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              }
            />
          )}
          <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive hover:text-destructive" onClick={() => { if (confirm(`Delete lot ${l.uid}?`)) deleteLotMutation.mutate(l.id) }}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      ),
    },
  ]

  // Receiving Log: lots sorted by created_at desc
  const receivingLogData = useMemo(() => {
    if (!lotsRaw) return null
    return [...lotsRaw].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }, [lotsRaw])

  const receivingLogColumns: VirtualGridColumn<InventoryLotWithId>[] = [
    { id: "date", header: "Date", size: 140, sortable: true, accessorFn: (l) => l.created_at, cell: (l) => <span className="text-sm tabular-nums">{new Date(l.created_at).toLocaleDateString()} {new Date(l.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span> },
    { id: "uid", header: "UID", size: 160, sortable: true, filterable: true, filterAccessor: (l) => l.uid, accessorFn: (l) => l.uid, cell: (l) => <span className="font-mono text-xs">{l.uid}</span> },
    { id: "customer", header: "Customer", size: 130, sortable: true, filterable: true, filterAccessor: (l) => l.material?.customer?.name || "-", accessorFn: (l) => l.material?.customer?.name || "", cell: (l) => <span className="text-sm">{l.material?.customer?.name || "\u2014"}</span> },
    { id: "ipn", header: "IPN", size: 150, sortable: true, filterable: true, filterAccessor: (l) => l.material?.internal_part_number || "", accessorFn: (l) => l.material?.internal_part_number || "", cell: (l) => (<div><span className="font-medium text-sm">{l.material?.internal_part_number}</span>{l.material?.description && <p className="text-xs text-muted-foreground truncate">{l.material.description}</p>}</div>) },
    { id: "qty", header: "Qty", size: 80, align: "right", sortable: true, accessorFn: (l) => parseFloat(String(l.quantity)), cell: (l) => <span className="font-mono text-sm">{parseFloat(String(l.quantity)).toLocaleString()}</span> },
    { id: "package", header: "Package", size: 90, sortable: true, filterable: true, filterAccessor: (l) => l.package_type, accessorFn: (l) => l.package_type, cell: (l) => <Badge variant="outline" className="text-xs">{l.package_type}</Badge> },
    { id: "po_ref", header: "PO Ref", size: 120, sortable: true, filterable: true, filterAccessor: (l) => l.po_reference || "-", accessorFn: (l) => l.po_reference || "", cell: (l) => <span className="text-sm text-muted-foreground">{l.po_reference || "\u2014"}</span> },
    { id: "bin", header: "BIN", size: 110, sortable: true, filterable: true, filterAccessor: (l) => l.bin || "-", accessorFn: (l) => l.bin || "", cell: (l) => <BinCell lot={l} onSaved={refetchLots} /> },
    { id: "status", header: "Status", size: 100, sortable: true, filterable: true, filterAccessor: (l) => l.status, accessorFn: (l) => l.status, cell: (l) => <Badge variant={l.status === "ACTIVE" ? "default" : l.status === "CONSUMED" ? "secondary" : "destructive"} className="text-xs">{l.status}</Badge> },
    { id: "location", header: "Stage", size: 90, sortable: true, filterable: true, filterAccessor: (l) => l.location, accessorFn: (l) => l.location, cell: (l) => <span className="text-xs">{l.location}</span> },
    {
      id: "actions", header: "", size: 60, sortable: false, filterable: false, accessorFn: () => "",
      cell: (l) => (
        canEditLots && l.status === "ACTIVE" ? (
          <EditLotDialog
            lot={l}
            onSaved={onLotSaved}
            trigger={
              <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit lot">
                <Pencil className="h-4 w-4" />
              </Button>
            }
          />
        ) : null
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Inventory</h1>
          <p className="text-muted-foreground">Track stock levels and transactions</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setImportWizardOpen(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Import Inventory
          </Button>
          <Button variant="outline" onClick={() => setAssignLocationOpen(true)}>
            <MapPin className="h-4 w-4 mr-2" />
            Assign Stock Location
          </Button>
          <Button variant="outline" onClick={() => router.push("/customer-supplied")}>
            Customer Supplied
          </Button>
          <Button variant="outline" onClick={() => router.push("/return-to-stock")}>
            Return to Stock
          </Button>
          <Button variant="outline" onClick={() => router.push("/kitting")}>
            Kitting
          </Button>
          <Button onClick={() => router.push("/receiving/new")}>
            <Plus className="h-4 w-4 mr-2" />
            Receive Stock
          </Button>
        </div>
      </div>

      <InventoryImportWizard
        open={importWizardOpen}
        onOpenChange={setImportWizardOpen}
        onSuccess={() => {
          refetch()
          refetchLots()
        }}
      />

      <AssignStockLocationDialog
        open={assignLocationOpen}
        onOpenChange={setAssignLocationOpen}
        onSuccess={() => {
          refetchLots()
        }}
      />

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Items</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalItems}</div>
            <p className="text-xs text-muted-foreground">unique materials</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">On Hand</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalOnHand.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">total quantity</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Allocated</CardTitle>
            <Package className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalAllocated.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">reserved for orders</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Low Stock</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{lowStockCount}</div>
            <p className="text-xs text-muted-foreground">items below threshold</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="stock" className="space-y-4">
        <TabsList>
          <TabsTrigger value="stock">Stock Levels</TabsTrigger>
          <TabsTrigger value="lots">Lots/Reels</TabsTrigger>
          <TabsTrigger value="receiving">Receiving Log</TabsTrigger>
          <TabsTrigger value="recent">Recent Activity</TabsTrigger>
          <TabsTrigger value="low-stock">Low Stock</TabsTrigger>
        </TabsList>

        <TabsContent value="stock" className="space-y-4">
          <VirtualGrid
            data={filteredInventory}
            columns={stockVgColumns}
            title="Stock Levels"
            isLoading={isLoading}
            searchPlaceholder="Search by IPN, description, customer, or quantity..."
            searchFn={(stock, q) =>
              !!(stock.material?.internal_part_number?.toLowerCase().includes(q) ||
              stock.material?.description?.toLowerCase().includes(q) ||
              stock.material?.customer?.name?.toLowerCase().includes(q) ||
              stock.quantity_on_hand.toString().includes(q) ||
              stock.quantity_available.toString().includes(q) ||
              stock.quantity_on_order.toString().includes(q))
            }
          />
        </TabsContent>

        <TabsContent value="lots" className="space-y-4">
          <VirtualGrid
            data={lots}
            columns={lotsVgColumns}
            title="Lots / Reels"
            isLoading={lotsLoading}
            spreadsheet
            spreadsheetOptions={{
              storageKey: "inventory-lots",
              editable: canEditLots && editUnlocked,
              onCommit: commitLotEdits,
              onAfterCommit: onLotSaved,
            }}
            getRowId={(l) => l.id}
            height={620}
            headerActions={
              canEditLots ? (
                <Button
                  variant={editUnlocked ? "secondary" : "outline"}
                  size="sm"
                  className="h-8"
                  onClick={() => setEditUnlocked((on) => !on)}
                  title={
                    editUnlocked
                      ? "Lock the sheet — cells become read-only"
                      : "Unlock the sheet — type into quantity, package, PO ref and BIN"
                  }
                >
                  {editUnlocked ? <LockOpen className="h-4 w-4 mr-1" /> : <Lock className="h-4 w-4 mr-1" />}
                  {editUnlocked ? "Editing" : "Locked"}
                </Button>
              ) : undefined
            }
            searchPlaceholder="Search by UID, IPN, customer, PO ref, or status..."
            searchFn={(lot, q) =>
              !!(lot.uid.toLowerCase().includes(q) ||
              lot.material?.internal_part_number?.toLowerCase().includes(q) ||
              lot.material?.customer?.name?.toLowerCase().includes(q) ||
              lot.package_type.toLowerCase().includes(q) ||
              lot.po_reference?.toLowerCase().includes(q) ||
              lot.status.toLowerCase().includes(q))
            }
          />
        </TabsContent>

        <TabsContent value="receiving" className="space-y-4">
          <VirtualGrid
            data={receivingLogData}
            columns={receivingLogColumns}
            title="Receiving Log"
            isLoading={lotsLoading}
            searchPlaceholder="Search by UID, IPN, customer, PO ref, status..."
            searchFn={(l, q) =>
              !!(l.uid.toLowerCase().includes(q) ||
              (l.material?.internal_part_number ?? "").toLowerCase().includes(q) ||
              (l.material?.description ?? "").toLowerCase().includes(q) ||
              (l.material?.customer?.name ?? "").toLowerCase().includes(q) ||
              (l.po_reference ?? "").toLowerCase().includes(q) ||
              l.status.toLowerCase().includes(q) ||
              l.package_type.toLowerCase().includes(q) ||
              l.location.toLowerCase().includes(q))
            }
          />
        </TabsContent>

        <TabsContent value="recent" className="space-y-4">
          <RecentTransactionsGrid />
        </TabsContent>

        <TabsContent value="low-stock" className="space-y-4">
          <VirtualGrid
            data={lowStock?.map((s) => ({ ...s, id: s.material_id })) ?? null}
            columns={stockVgColumns}
            title="Low Stock Items"
            isLoading={false}
            searchPlaceholder="Search by IPN, description, customer..."
            searchFn={(stock, q) =>
              !!(stock.material?.internal_part_number?.toLowerCase().includes(q) ||
              stock.material?.description?.toLowerCase().includes(q) ||
              stock.material?.customer?.name?.toLowerCase().includes(q))
            }
            height={400}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
