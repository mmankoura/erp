"use client"

import { useState, useMemo, useEffect, useRef, type KeyboardEvent } from "react"
import { useApi, useMutation } from "@/hooks/use-api"
import { api, type InventoryLot, type Customer } from "@/lib/api"
import { useAuth, UserRole } from "@/contexts/auth-context"
import { VirtualGrid, type VirtualGridColumn } from "@/components/virtual-grid"
import { textCol, monoCol, numCol, dateCol } from "@/components/grid/columns"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { Search, X } from "lucide-react"

type LotWithId = InventoryLot & { id: string }

function AssignCustomerCell({
  lot,
  customers,
  onSaved,
}: {
  lot: LotWithId
  customers: Customer[]
  onSaved: () => void
}) {
  const [value, setValue] = useState<string>("")
  const [saving, setSaving] = useState(false)
  useEffect(() => { setValue("") }, [lot.id])

  const handleChange = async (customerId: string) => {
    if (!customerId || saving) return
    setSaving(true)
    setValue(customerId)
    try {
      await api.patch(`/inventory/lots/${lot.id}/owner`, {
        owner_type: "CUSTOMER",
        owner_id: customerId,
      })
      const name = customers.find((c) => c.id === customerId)?.name ?? "customer"
      toast.success(`Assigned to ${name}`)
      onSaved()
    } catch (err) {
      setValue("")
      toast.error(err instanceof Error ? err.message : "Failed to assign customer")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Select value={value} onValueChange={handleChange} disabled={saving}>
      {/* Sized to sit inside the 26px spreadsheet row. */}
      <SelectTrigger className="h-6 text-xs">
        <SelectValue placeholder="Select customer..." />
      </SelectTrigger>
      <SelectContent>
        {customers.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.name} ({c.code})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export default function AssignCustomerPage() {
  const { hasRole } = useAuth()
  const canEdit = hasRole(UserRole.ADMIN, UserRole.MANAGER)

  const { data: lots, isLoading: lotsLoading, refetch } = useApi<InventoryLot[]>(
    "/inventory/lots?owner_type=COMPANY"
  )
  const { data: customers } = useApi<Customer[]>("/customers")

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkCustomerId, setBulkCustomerId] = useState<string>("")
  const [search, setSearch] = useState("")
  const [anchorId, setAnchorId] = useState<string | null>(null)
  const [focusedIndex, setFocusedIndex] = useState<number>(-1)
  const [orderedLots, setOrderedLots] = useState<LotWithId[]>([])
  const shiftHeldRef = useRef(false)
  const tableAreaRef = useRef<HTMLDivElement>(null)

  const unassignedLots = useMemo<LotWithId[]>(() => {
    if (!lots) return []
    return lots.filter((l) => l.owner_type === "COMPANY" || !l.owner_id) as LotWithId[]
  }, [lots])

  // Page-level search filter so "select all visible" matches what the user sees.
  const visibleLots = useMemo<LotWithId[]>(() => {
    if (!search.trim()) return unassignedLots
    const q = search.toLowerCase()
    return unassignedLots.filter((l) =>
      l.uid.toLowerCase().includes(q) ||
      (l.material?.internal_part_number?.toLowerCase().includes(q) ?? false) ||
      (l.material?.manufacturer?.toLowerCase().includes(q) ?? false) ||
      (l.material?.manufacturer_pn?.toLowerCase().includes(q) ?? false) ||
      (l.bin?.toLowerCase().includes(q) ?? false)
    )
  }, [unassignedLots, search])

  // The on-screen order, reported by VirtualGrid after its sort. Selection
  // (shift-range, select-all anchor, keyboard nav) must follow what the user
  // sees, not the unsorted `visibleLots`. Fall back to visibleLots until the
  // grid has reported its order (and whenever the two are out of sync).
  const order = useMemo<LotWithId[]>(
    () => (orderedLots.length === visibleLots.length ? orderedLots : visibleLots),
    [orderedLots, visibleLots],
  )

  // Prune stale selections after the dataset changes.
  useEffect(() => {
    if (selectedIds.size === 0) return
    const live = new Set(unassignedLots.map((l) => l.id))
    let changed = false
    const next = new Set<string>()
    for (const id of selectedIds) {
      if (live.has(id)) next.add(id)
      else changed = true
    }
    if (changed) setSelectedIds(next)
  }, [unassignedLots, selectedIds])

  const toggleSelected = (id: string, checked: boolean) => {
    const shiftHeld = shiftHeldRef.current
    shiftHeldRef.current = false

    setSelectedIds((prev) => {
      const next = new Set(prev)
      // Shift-click range: (de)select every visible row between the anchor and this one
      if (shiftHeld && anchorId && anchorId !== id) {
        const ids = order.map((l) => l.id)
        const ai = ids.indexOf(anchorId)
        const ci = ids.indexOf(id)
        if (ai !== -1 && ci !== -1) {
          const [lo, hi] = ai < ci ? [ai, ci] : [ci, ai]
          for (let i = lo; i <= hi; i++) {
            if (checked) next.add(ids[i]); else next.delete(ids[i])
          }
          return next
        }
      }
      if (checked) next.add(id); else next.delete(id)
      return next
    })
    setAnchorId(id)
    const idx = order.findIndex((l) => l.id === id)
    if (idx !== -1) setFocusedIndex(idx)
  }

  const selectAllVisible = () => {
    setSelectedIds(new Set(order.map((l) => l.id)))
    setAnchorId(order[0]?.id ?? null)
    setFocusedIndex(0)
  }

  const clearSelection = () => {
    setSelectedIds(new Set())
    setBulkCustomerId("")
    setAnchorId(null)
  }

  // Scroll the focused row into view if it's rendered by the virtualizer.
  const scrollFocusedIntoView = (idx: number) => {
    requestAnimationFrame(() => {
      const el = tableAreaRef.current?.querySelector(`[data-index="${idx}"]`) as HTMLElement | null
      el?.scrollIntoView({ block: "nearest" })
    })
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    // Don't capture keys while typing in form controls
    const tag = target.tagName
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.getAttribute("role") === "combobox") {
      return
    }
    const max = order.length - 1
    if (max < 0) return
    const ids = order.map((l) => l.id)

    const extendSelectionTo = (newIndex: number) => {
      const anchorIdx = anchorId ? ids.indexOf(anchorId) : (focusedIndex < 0 ? newIndex : focusedIndex)
      const [lo, hi] = anchorIdx < newIndex ? [anchorIdx, newIndex] : [newIndex, anchorIdx]
      const next = new Set<string>()
      for (let i = lo; i <= hi; i++) next.add(ids[i])
      setSelectedIds(next)
      if (!anchorId) setAnchorId(ids[anchorIdx])
    }

    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault()
      const delta = e.key === "ArrowDown" ? 1 : -1
      const start = focusedIndex < 0 ? 0 : focusedIndex
      const newIndex = Math.max(0, Math.min(max, start + delta))
      if (e.shiftKey) {
        extendSelectionTo(newIndex)
      } else {
        setAnchorId(ids[newIndex])
      }
      setFocusedIndex(newIndex)
      scrollFocusedIntoView(newIndex)
    } else if (e.key === "Home") {
      e.preventDefault()
      if (e.shiftKey) extendSelectionTo(0); else setAnchorId(ids[0])
      setFocusedIndex(0)
      scrollFocusedIntoView(0)
    } else if (e.key === "End") {
      e.preventDefault()
      if (e.shiftKey) extendSelectionTo(max); else setAnchorId(ids[max])
      setFocusedIndex(max)
      scrollFocusedIntoView(max)
    } else if (e.key === " ") {
      if (focusedIndex < 0) return
      e.preventDefault()
      const id = ids[focusedIndex]
      setSelectedIds((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id); else next.add(id)
        return next
      })
      setAnchorId(id)
    } else if (e.key === "Escape") {
      e.preventDefault()
      clearSelection()
      setFocusedIndex(-1)
    }
  }

  const focusedId = focusedIndex >= 0 && focusedIndex < order.length ? order[focusedIndex].id : null

  const bulkMutation = useMutation<{ assigned: number }, void>(
    () =>
      api.post("/inventory/lots/bulk-assign-owner", {
        lot_ids: Array.from(selectedIds),
        owner_type: "CUSTOMER",
        owner_id: bulkCustomerId,
      }),
    {
      onSuccess: (res) => {
        const name = customers?.find((c) => c.id === bulkCustomerId)?.name ?? "customer"
        toast.success(`Assigned ${res.assigned} lot${res.assigned === 1 ? "" : "s"} to ${name}`)
        clearSelection()
        refetch()
      },
      onError: (err) => toast.error(err.message || "Bulk assign failed"),
    }
  )

  const columns: VirtualGridColumn<LotWithId>[] = [
    {
      id: "select",
      header: "",
      size: 44,
      sortable: false,
      filterable: false,
      accessorFn: () => "",
      // A tick box has no text form; copying a block that spans it should not
      // emit "false" into Excel.
      copyValue: () => "",
      cell: (l) => (
        <span
          onMouseDown={(e) => { shiftHeldRef.current = e.shiftKey }}
          onClick={(e) => { shiftHeldRef.current = e.shiftKey }}
          className={
            "inline-flex items-center gap-1 pl-1 -ml-1 border-l-2 " +
            (focusedId === l.id ? "border-primary" : "border-transparent")
          }
        >
          <Checkbox
            checked={selectedIds.has(l.id)}
            onCheckedChange={(checked) => toggleSelected(l.id, !!checked)}
            aria-label={`Select lot ${l.uid}`}
          />
        </span>
      ),
    },
    monoCol("uid", "UID", (l) => l.uid, {
      size: 160,
      cell: (l) => <span className="font-mono font-medium">{l.uid}</span>,
    }),
    monoCol("ipn", "IPN", (l) => l.material?.internal_part_number, {
      size: 160,
      cell: (l) =>
        l.material?.internal_part_number ? (
          <span className="font-medium">{l.material.internal_part_number}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    }),
    textCol("manufacturer", "Manufacturer", (l) => l.material?.manufacturer, { size: 140 }),
    textCol("mpn", "MPN", (l) => l.material?.manufacturer_pn, { size: 160 }),
    numCol("quantity", "Qty", (l) => parseFloat(String(l.quantity)), { size: 90 }),
    monoCol("bin", "BIN", (l) => l.bin, { size: 110 }),
    dateCol("received", "Received", (l) => l.received_date, { size: 110 }),
    {
      id: "assign",
      header: "Quick assign",
      size: 220,
      sortable: false,
      filterable: false,
      accessorFn: () => "",
      // Nothing to put on the clipboard — the cell is a control, not a value.
      copyValue: () => "",
      cell: (l) => (
        <AssignCustomerCell lot={l} customers={customers ?? []} onSaved={refetch} />
      ),
    },
  ]

  if (!canEdit) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Assign Customers</h1>
        <Card>
          <CardContent className="py-12">
            <p className="text-center text-muted-foreground">
              You do not have permission to assign customers to lots. Manager or admin access required.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Assign Customers</h1>
          <p className="text-muted-foreground">
            Assign a customer to every lot before running a Physical Count.
          </p>
        </div>
        <Badge variant="outline" className="text-sm">
          {unassignedLots.length} unassigned
        </Badge>
      </div>

      {selectedIds.size > 0 && (
        <Card className="border-primary">
          <CardContent className="flex flex-wrap items-center gap-3 py-3">
            <span className="text-sm font-medium">
              {selectedIds.size} selected
            </span>
            <Button variant="ghost" size="sm" onClick={clearSelection}>
              <X className="h-4 w-4 mr-1" /> Clear
            </Button>
            <Button variant="outline" size="sm" onClick={selectAllVisible}>
              Select all visible ({order.length})
            </Button>
            <div className="flex-1" />
            <Select value={bulkCustomerId} onValueChange={setBulkCustomerId}>
              <SelectTrigger className="w-[260px] h-9">
                <SelectValue placeholder="Assign to customer..." />
              </SelectTrigger>
              <SelectContent>
                {(customers ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} ({c.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              disabled={!bulkCustomerId || bulkMutation.isLoading}
              onClick={() => bulkMutation.mutate(undefined)}
            >
              {bulkMutation.isLoading ? "Assigning..." : `Assign ${selectedIds.size}`}
            </Button>
          </CardContent>
        </Card>
      )}

      <div
        ref={tableAreaRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className="outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-md"
      >
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>Unassigned Lots</CardTitle>
              <CardDescription>
                Lots currently owned by AT&amp;A (no customer set). Pick a customer to assign each lot to.
                Tip: click a row, then <kbd className="rounded bg-muted px-1 text-xs">↑</kbd> /
                <kbd className="rounded bg-muted px-1 text-xs">↓</kbd> to move,
                <kbd className="rounded bg-muted px-1 text-xs">Shift</kbd>+arrows to extend,
                <kbd className="rounded bg-muted px-1 text-xs">Space</kbd> to toggle.
              </CardDescription>
            </div>
            <div className="relative w-[280px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by UID, IPN, MFR, MPN, or BIN..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <VirtualGrid
              data={visibleLots}
              columns={columns}
              isLoading={lotsLoading}
              onVisibleRowsChange={setOrderedLots}
              spreadsheet
              // This page owns the arrow keys: Up/Down move the row focus,
              // Shift extends the selection, Space ticks the focused row and
              // Escape clears — which is how fifty lots get selected for a bulk
              // assign without touching the mouse. The grid's cell cursor runs
              // on the same keystrokes and neither handler stops the other, so
              // it stays off; the sheet contributes its presentation and filter
              // row only.
              spreadsheetOptions={{ cellCursor: false }}
              bare
              storageKey="assign-customer-lots"
              getRowId={(l) => l.id}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
