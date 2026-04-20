"use client"

import { useState, useRef, useMemo } from "react"
import { useApi, useMutation } from "@/hooks/use-api"
import { toast } from "sonner"
import {
  api,
  type KittingList,
  type KittingListStatus,
  type KittingStockResponse,
  type KittingItemWithStock,
  type Order,
} from "@/lib/api"
import { DataTable, type Column } from "@/components/data-table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { exportKittingList } from "@/lib/export-utils"
import {
  PackageCheck,
  Plus,
  Printer,
  ScanBarcode,
  CheckCircle,
  AlertTriangle,
  ArrowLeft,
  Download,
  Loader2,
  X,
} from "lucide-react"

const statusConfig: Record<KittingListStatus, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  DRAFT: { label: "Draft", variant: "outline" },
  PRINTED: { label: "Printed", variant: "secondary" },
  IN_PROGRESS: { label: "In Progress", variant: "default" },
  COMPLETED: { label: "Completed", variant: "default" },
  CANCELLED: { label: "Cancelled", variant: "destructive" },
}

function StatusBadge({ status }: { status: KittingListStatus }) {
  const config = statusConfig[status]
  return <Badge variant={config.variant}>{config.label}</Badge>
}

// ==================== Main Page ====================

export default function KittingPage() {
  const [selectedListId, setSelectedListId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  if (showCreate) {
    return (
      <CreateKittingListView
        onBack={() => setShowCreate(false)}
        onCreated={(id) => {
          setShowCreate(false)
          setSelectedListId(id)
        }}
      />
    )
  }

  if (selectedListId) {
    return (
      <KittingDetail
        kittingListId={selectedListId}
        onBack={() => setSelectedListId(null)}
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Kitting</h1>
          <p className="text-muted-foreground">
            Create kitting lists, print pick sheets, and verify scanned UIDs
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Kitting List
        </Button>
      </div>

      <KittingListTable onSelect={setSelectedListId} />
    </div>
  )
}

// ==================== Kitting List Table ====================

function KittingListTable({ onSelect }: { onSelect: (id: string) => void }) {
  const { data: kittingLists, isLoading } = useApi<KittingList[]>("/kitting")

  const columns: Column<KittingList>[] = [
    {
      key: "list_number",
      header: "List #",
      cell: (item) => (
        <span className="font-mono font-medium">{item.list_number}</span>
      ),
      sortable: true,
    },
    {
      key: "status",
      header: "Status",
      cell: (item) => <StatusBadge status={item.status} />,
      sortable: true,
      sortAccessor: (item) => item.status,
    },
    {
      key: "orders",
      header: "Orders",
      cell: (item) => (
        <div className="space-y-0.5">
          {item.orders?.map((o) => (
            <div key={o.id} className="text-sm">
              {o.order?.order_number} - {o.order?.product?.name} ({o.order_quantity} pcs)
            </div>
          ))}
        </div>
      ),
    },
    {
      key: "item_count",
      header: "Items",
      cell: (item) => item.items?.length ?? 0,
      sortable: true,
      sortAccessor: (item) => item.items?.length ?? 0,
    },
    {
      key: "created_by",
      header: "Created By",
      cell: (item) => item.created_by ?? "-",
    },
    {
      key: "created_at",
      header: "Created",
      cell: (item) => new Date(item.created_at).toLocaleDateString(),
      sortable: true,
      sortAccessor: (item) => item.created_at,
    },
  ]

  return (
    <DataTable
      data={kittingLists ?? []}
      columns={columns}
      isLoading={isLoading}
      onRowClick={(item) => onSelect(item.id)}
      searchKey="list_number"
      searchPlaceholder="Search kitting lists..."
      storageKey="kitting-lists"
    />
  )
}

// ==================== Create Kitting List (Full Screen) ====================

function CreateKittingListView({
  onBack,
  onCreated,
}: {
  onBack: () => void
  onCreated: (id: string) => void
}) {
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([])
  const [notes, setNotes] = useState("")
  const { data: orders, isLoading } = useApi<Order[]>("/orders")

  // Filter to ENTERED and KITTING orders only
  const eligibleOrders = useMemo(
    () => (orders ?? []).filter((o) => o.status === "ENTERED" || o.status === "KITTING"),
    [orders],
  )

  const selectedOrders = useMemo(
    () => eligibleOrders.filter((o) => selectedOrderIds.includes(o.id)),
    [eligibleOrders, selectedOrderIds],
  )

  const createMutation = useMutation<KittingList, { order_ids: string[]; notes?: string }>(
    (vars) => api.post("/kitting", vars),
    {
      onSuccess: (data) => {
        toast.success(`Kitting list ${data.list_number} created`)
        onCreated(data.id)
      },
      onError: (err) => toast.error(err.message),
    },
  )

  const toggleOrder = (orderId: string) => {
    setSelectedOrderIds((prev) =>
      prev.includes(orderId) ? prev.filter((id) => id !== orderId) : [...prev, orderId],
    )
  }

  const handleCreate = () => {
    if (selectedOrderIds.length === 0) {
      toast.error("Select at least one order")
      return
    }
    createMutation.mutate({ order_ids: selectedOrderIds, notes: notes || undefined })
  }

  const orderColumns: Column<Order>[] = [
    {
      key: "select",
      header: "",
      cell: (item) => (
        <Checkbox
          checked={selectedOrderIds.includes(item.id)}
          onCheckedChange={() => toggleOrder(item.id)}
          onClick={(e) => e.stopPropagation()}
        />
      ),
      defaultWidth: 40,
    },
    {
      key: "order_number",
      header: "Order #",
      cell: (item) => <span className="font-mono">{item.order_number}</span>,
      sortable: true,
    },
    {
      key: "customer",
      header: "Customer",
      cell: (item) => item.customer?.name ?? "-",
      sortable: true,
      sortAccessor: (item) => item.customer?.name ?? "",
    },
    {
      key: "product",
      header: "Product",
      cell: (item) => item.product?.name ?? "-",
      sortable: true,
      sortAccessor: (item) => item.product?.name ?? "",
    },
    {
      key: "quantity",
      header: "Qty",
      cell: (item) => item.quantity.toLocaleString(),
      sortable: true,
    },
    {
      key: "status",
      header: "Status",
      cell: (item) => <Badge variant="outline">{item.status}</Badge>,
    },
    {
      key: "due_date",
      header: "Due Date",
      cell: (item) => new Date(item.due_date).toLocaleDateString(),
      sortable: true,
      sortAccessor: (item) => item.due_date,
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">New Kitting List</h1>
            <p className="text-sm text-muted-foreground">
              Select one or more orders to kit together. Material requirements will be aggregated across all selected orders.
            </p>
          </div>
        </div>
        <Button
          onClick={handleCreate}
          disabled={selectedOrderIds.length === 0 || createMutation.isLoading}
        >
          {createMutation.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Create Kitting List ({selectedOrderIds.length} orders)
        </Button>
      </div>

      {/* Selected orders summary */}
      {selectedOrders.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">
              Selected Orders ({selectedOrders.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {selectedOrders.map((o) => (
                <div
                  key={o.id}
                  className="flex items-center justify-between rounded-md border border-primary/30 bg-primary/5 p-3"
                >
                  <div>
                    <div className="font-mono text-sm font-medium">{o.order_number}</div>
                    <div className="text-xs text-muted-foreground">
                      {o.customer?.name} - {o.product?.name}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{o.quantity} pcs</Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => toggleOrder(o.id)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Orders table */}
      <div>
        <Label className="text-base font-medium mb-2 block">
          Available Orders (ENTERED / KITTING)
        </Label>
        <DataTable
          data={eligibleOrders}
          columns={orderColumns}
          isLoading={isLoading}
          onRowClick={(item) => toggleOrder(item.id)}
          searchKey="order_number"
          searchPlaceholder="Search orders..."
          storageKey="kitting-create-orders"
        />
      </div>

      {/* Notes */}
      <div>
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Any notes about this kitting list..."
          rows={2}
        />
      </div>
    </div>
  )
}

// ==================== Kitting Detail / Verify ====================

function KittingDetail({
  kittingListId,
  onBack,
}: {
  kittingListId: string
  onBack: () => void
}) {
  const { data: stockData, isLoading, refetch } = useApi<KittingStockResponse>(
    `/kitting/${kittingListId}/stock`,
  )
  const [scanInput, setScanInput] = useState("")
  const [showPrintView, setShowPrintView] = useState(false)
  const scanInputRef = useRef<HTMLInputElement>(null)

  const kittingList = stockData?.kitting_list

  const printMutation = useMutation<KittingList, void>(
    () => api.post(`/kitting/${kittingListId}/print`, {}),
    {
      onSuccess: () => {
        toast.success("Marked as printed")
        refetch()
      },
      onError: (err) => toast.error(err.message),
    },
  )

  const scanMutation = useMutation<{ scan: unknown; item: unknown }, { uid: string }>(
    (vars) => api.post(`/kitting/${kittingListId}/scan`, vars),
    {
      onSuccess: () => {
        toast.success("UID scanned successfully")
        setScanInput("")
        scanInputRef.current?.focus()
        refetch()
      },
      onError: (err) => {
        toast.error(err.message)
        setScanInput("")
        scanInputRef.current?.focus()
      },
    },
  )

  const completeMutation = useMutation<KittingList, void>(
    () => api.post(`/kitting/${kittingListId}/complete`, {}),
    {
      onSuccess: () => {
        toast.success("Kitting list completed")
        refetch()
      },
      onError: (err) => toast.error(err.message),
    },
  )

  const cancelMutation = useMutation<KittingList, void>(
    () => api.delete(`/kitting/${kittingListId}`),
    {
      onSuccess: () => {
        toast.success("Kitting list cancelled")
        onBack()
      },
      onError: (err) => toast.error(err.message),
    },
  )

  const handleScan = () => {
    if (!scanInput.trim()) return
    scanMutation.mutate({ uid: scanInput.trim() })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault()
      handleScan()
    }
  }

  if (showPrintView && stockData) {
    return (
      <KittingPrintView
        stockData={stockData}
        onClose={() => setShowPrintView(false)}
      />
    )
  }

  if (isLoading || !kittingList) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const canScan = kittingList.status === "PRINTED" || kittingList.status === "IN_PROGRESS"
  const canComplete = kittingList.status === "PRINTED" || kittingList.status === "IN_PROGRESS"
  const canPrint = kittingList.status === "DRAFT" || kittingList.status === "PRINTED"
  const canCancel = kittingList.status === "DRAFT" || kittingList.status === "PRINTED"

  // Shortage summary
  const allItems = [
    ...(stockData?.smt_items ?? []),
    ...(stockData?.th_items ?? []),
    ...(stockData?.other_items ?? []),
  ]
  const shortItems = allItems.filter((i) => i.is_short)
  const totalVerified = allItems.reduce((sum, i) => sum + (parseFloat(String(i.qty_verified)) > 0 ? 1 : 0), 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold font-mono">{kittingList.list_number}</h1>
              <StatusBadge status={kittingList.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              {kittingList.orders.length} order(s) | {allItems.length} material lines | {totalVerified} verified
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {canCancel && (
            <Button variant="outline" size="sm" onClick={() => cancelMutation.mutate()}>
              <X className="mr-1 h-4 w-4" />
              Cancel
            </Button>
          )}
          {stockData && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportKittingList(stockData)}
            >
              <Download className="mr-1 h-4 w-4" />
              Export Excel
            </Button>
          )}
          {canPrint && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (kittingList.status === "DRAFT") {
                  printMutation.mutate()
                }
                setShowPrintView(true)
              }}
            >
              <Printer className="mr-1 h-4 w-4" />
              Print
            </Button>
          )}
          {canComplete && (
            <Button size="sm" onClick={() => completeMutation.mutate()}>
              <CheckCircle className="mr-1 h-4 w-4" />
              Complete
            </Button>
          )}
        </div>
      </div>

      {/* Orders summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Orders in this Kit</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {kittingList.orders.map((o) => (
              <div key={o.id} className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <div className="font-mono text-sm font-medium">{o.order?.order_number}</div>
                  <div className="text-xs text-muted-foreground">
                    {o.order?.customer?.name} - {o.order?.product?.name}
                  </div>
                </div>
                <Badge variant="outline">{o.order_quantity} pcs</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Scan input */}
      {canScan && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ScanBarcode className="h-4 w-4" />
              Scan UID
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                ref={scanInputRef}
                value={scanInput}
                onChange={(e) => setScanInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Scan or enter UID..."
                className="font-mono"
                autoFocus
                disabled={scanMutation.isLoading}
              />
              <Button onClick={handleScan} disabled={!scanInput.trim() || scanMutation.isLoading}>
                {scanMutation.isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Verify"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Shortage summary (only when completed) */}
      {kittingList.status === "COMPLETED" && shortItems.length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-amber-800">
              <AlertTriangle className="h-4 w-4" />
              Shortages Detected ({shortItems.length} items)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {shortItems.map((item) => (
                <div key={item.id} className="flex justify-between text-sm text-amber-800">
                  <span className="font-mono">{item.material?.internal_part_number}</span>
                  <span>Short {parseFloat(String(item.shortage_qty)).toLocaleString()} pcs</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Material items by resource type */}
      <Tabs defaultValue="smt">
        <TabsList>
          <TabsTrigger value="smt">SMT ({stockData?.smt_items?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="th">TH ({stockData?.th_items?.length ?? 0})</TabsTrigger>
          {(stockData?.other_items?.length ?? 0) > 0 && (
            <TabsTrigger value="other">Other ({stockData?.other_items?.length ?? 0})</TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="smt">
          <KittingItemsTable items={stockData?.smt_items ?? []} />
        </TabsContent>
        <TabsContent value="th">
          <KittingItemsTable items={stockData?.th_items ?? []} />
        </TabsContent>
        {(stockData?.other_items?.length ?? 0) > 0 && (
          <TabsContent value="other">
            <KittingItemsTable items={stockData?.other_items ?? []} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}

// ==================== Kitting Items Table ====================

function KittingItemsTable({ items }: { items: KittingItemWithStock[] }) {
  const columns: Column<KittingItemWithStock>[] = [
    {
      key: "ipn",
      header: "IPN",
      cell: (item) => (
        <span className="font-mono text-sm">{item.material?.internal_part_number}</span>
      ),
      sortable: true,
      sortAccessor: (item) => item.material?.internal_part_number ?? "",
    },
    {
      key: "mpn",
      header: "MPN",
      cell: (item) => (
        <span className="font-mono text-sm">{item.material?.manufacturer_pn ?? "-"}</span>
      ),
      sortable: true,
      sortAccessor: (item) => item.material?.manufacturer_pn ?? "",
    },
    {
      key: "description",
      header: "Description",
      cell: (item) => (
        <span className="text-sm truncate max-w-[200px] block">
          {item.material?.description ?? "-"}
        </span>
      ),
    },
    {
      key: "qty_required",
      header: "Qty Required",
      cell: (item) => (
        <span className="font-medium">
          {parseFloat(String(item.total_qty_required)).toLocaleString()}
        </span>
      ),
      sortable: true,
      sortAccessor: (item) => parseFloat(String(item.total_qty_required)),
    },
    {
      key: "qty_on_hand",
      header: "On Hand",
      cell: (item) => parseFloat(String(item.quantity_on_hand)).toLocaleString(),
      sortable: true,
      sortAccessor: (item) => item.quantity_on_hand,
    },
    {
      key: "location",
      header: "Location",
      cell: (item) => (
        <div className="text-xs space-y-0.5">
          {item.uid_locations?.slice(0, 3).map((u, i) => (
            <div key={i} className="font-mono">
              {u.location} ({parseFloat(String(u.quantity)).toLocaleString()})
            </div>
          ))}
          {(item.uid_locations?.length ?? 0) > 3 && (
            <div className="text-muted-foreground">+{item.uid_locations.length - 3} more</div>
          )}
        </div>
      ),
    },
    {
      key: "qty_verified",
      header: "Verified",
      cell: (item) => {
        const verified = parseFloat(String(item.qty_verified))
        const required = parseFloat(String(item.total_qty_required))
        const isFull = verified >= required
        return (
          <span className={isFull ? "text-green-600 font-medium" : ""}>
            {verified.toLocaleString()}
          </span>
        )
      },
      sortable: true,
      sortAccessor: (item) => parseFloat(String(item.qty_verified)),
    },
    {
      key: "status",
      header: "Status",
      cell: (item) => {
        const verified = parseFloat(String(item.qty_verified))
        const required = parseFloat(String(item.total_qty_required))
        if (verified === 0) return <Badge variant="outline">Pending</Badge>
        if (verified >= required) return <Badge className="bg-green-100 text-green-800 border-0">OK</Badge>
        if (item.is_short) return <Badge className="bg-amber-100 text-amber-800 border-0">Short</Badge>
        return <Badge className="bg-blue-100 text-blue-800 border-0">Partial</Badge>
      },
    },
    {
      key: "scans",
      header: "Scanned UIDs",
      cell: (item) => (
        <div className="text-xs space-y-0.5">
          {item.scans?.map((s) => (
            <div key={s.id} className="font-mono">
              {s.uid_code} ({parseFloat(String(s.quantity)).toLocaleString()})
            </div>
          ))}
        </div>
      ),
    },
  ]

  return (
    <DataTable
      data={items}
      columns={columns}
      searchPlaceholder="Search materials..."
      storageKey="kitting-items"
      searchFilter={(item, query) => {
        const q = query.toLowerCase()
        return (
          (item.material?.internal_part_number ?? "").toLowerCase().includes(q) ||
          (item.material?.manufacturer_pn ?? "").toLowerCase().includes(q) ||
          (item.material?.description ?? "").toLowerCase().includes(q)
        )
      }}
    />
  )
}

// ==================== Print View ====================

function KittingPrintView({
  stockData,
  onClose,
}: {
  stockData: KittingStockResponse
  onClose: () => void
}) {
  const kittingList = stockData.kitting_list

  const handlePrint = () => {
    window.print()
  }

  return (
    <div>
      {/* Screen-only controls */}
      <div className="flex gap-2 mb-4 print:hidden">
        <Button variant="outline" size="sm" onClick={onClose}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back
        </Button>
        <Button size="sm" onClick={handlePrint}>
          <Printer className="mr-1 h-4 w-4" />
          Print
        </Button>
      </div>

      {/* Printable content */}
      <div className="print:p-0 space-y-6">
        {/* Header */}
        <div className="border-b pb-4">
          <h1 className="text-xl font-bold">Kitting List: {kittingList.list_number}</h1>
          <div className="grid grid-cols-2 gap-2 mt-2 text-sm">
            <div>
              <strong>Date:</strong>{" "}
              {new Date(kittingList.created_at).toLocaleDateString()}
            </div>
            <div>
              <strong>Created By:</strong> {kittingList.created_by ?? "-"}
            </div>
            <div className="col-span-2">
              <strong>Orders:</strong>{" "}
              {kittingList.orders
                .map(
                  (o) =>
                    `${o.order?.order_number} (${o.order?.customer?.name} - ${o.order?.product?.name}, ${o.order_quantity} pcs)`,
                )
                .join(" | ")}
            </div>
            {kittingList.notes && (
              <div className="col-span-2">
                <strong>Notes:</strong> {kittingList.notes}
              </div>
            )}
          </div>
        </div>

        {/* SMT Section */}
        {stockData.smt_items.length > 0 && (
          <PrintSection title="SMT Components" items={stockData.smt_items} />
        )}

        {/* TH Section */}
        {stockData.th_items.length > 0 && (
          <PrintSection title="Through-Hole Components" items={stockData.th_items} />
        )}

        {/* Other Section */}
        {stockData.other_items.length > 0 && (
          <PrintSection title="Other Components" items={stockData.other_items} />
        )}
      </div>
    </div>
  )
}

function PrintSection({
  title,
  items,
}: {
  title: string
  items: KittingItemWithStock[]
}) {
  return (
    <div>
      <h2 className="text-lg font-bold border-b-2 border-black pb-1 mb-2">{title}</h2>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b">
            <th className="text-left py-1 pr-2 w-8">#</th>
            <th className="text-left py-1 pr-2">IPN</th>
            <th className="text-left py-1 pr-2">MPN</th>
            <th className="text-left py-1 pr-2">Description</th>
            <th className="text-right py-1 pr-2">Qty Required</th>
            <th className="text-right py-1 pr-2">On Hand</th>
            <th className="text-left py-1 pr-2">Location</th>
            <th className="text-center py-1 w-12">Picked</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={item.id} className="border-b border-gray-200">
              <td className="py-1 pr-2 text-gray-500">{idx + 1}</td>
              <td className="py-1 pr-2 font-mono">{item.material?.internal_part_number}</td>
              <td className="py-1 pr-2 font-mono text-xs">{item.material?.manufacturer_pn ?? "-"}</td>
              <td className="py-1 pr-2 text-xs truncate max-w-[200px]">
                {item.material?.description ?? "-"}
              </td>
              <td className="py-1 pr-2 text-right font-medium">
                {parseFloat(String(item.total_qty_required)).toLocaleString()}
              </td>
              <td className="py-1 pr-2 text-right">
                {parseFloat(String(item.quantity_on_hand)).toLocaleString()}
              </td>
              <td className="py-1 pr-2 text-xs font-mono">
                {item.uid_locations
                  ?.slice(0, 2)
                  .map((u) => u.location)
                  .join(", ") ?? "-"}
              </td>
              <td className="py-1 text-center">
                <span className="inline-block w-4 h-4 border border-gray-400" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
