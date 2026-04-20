"use client"

import { useApi } from "@/hooks/use-api"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { DataTable, type Column } from "@/components/data-table"
import { useMemo } from "react"
import { Package } from "lucide-react"

interface CustomerSuppliedItem {
  order_id: string
  order_number: string
  customer_name: string
  customer_id: string
  product_name: string
  due_date: string
  material_id: string
  ipn: string
  description: string | null
  qty_required: number
}

interface InventoryLot {
  id: string
  uid: string
  material_id: string
  quantity: number
  owner_type: string
  owner_id: string | null
  status: string
}

interface ItemWithReceiving extends CustomerSuppliedItem {
  id: string
  _id: string
  qty_received: number
  uids: string[]
  status: "Complete" | "Partial" | "Pending"
}

export default function CustomerSuppliedPage() {
  const { data: items, isLoading } = useApi<CustomerSuppliedItem[]>(
    "/orders/customer-supplied/items"
  )

  const { data: lots } = useApi<InventoryLot[]>("/inventory/lots?owner_type=CUSTOMER")

  // Build received qty map: material_id+customer_id → { qty, uids }
  const receivedMap = useMemo(() => {
    const map = new Map<string, { qty: number; uids: string[] }>()
    if (!lots) return map
    for (const lot of lots) {
      if (lot.owner_type !== "CUSTOMER" || !lot.owner_id) continue
      const key = `${lot.material_id}:${lot.owner_id}`
      const existing = map.get(key) ?? { qty: 0, uids: [] }
      existing.qty += parseFloat(String(lot.quantity))
      existing.uids.push(lot.uid)
      map.set(key, existing)
    }
    return map
  }, [lots])

  const enrichedItems: ItemWithReceiving[] = useMemo(() => {
    if (!items) return []
    return items.map((item, idx) => {
      const received = receivedMap.get(`${item.material_id}:${item.customer_id}`)
      const qtyReceived = received?.qty ?? 0
      const uids = received?.uids ?? []
      const qtyRequired = Math.ceil(item.qty_required)
      const isComplete = qtyReceived >= qtyRequired
      const isPartial = qtyReceived > 0 && !isComplete
      return {
        ...item,
        id: `${item.order_id}-${item.material_id}-${idx}`,
        _id: `${item.order_id}-${item.material_id}-${idx}`,
        qty_received: qtyReceived,
        uids,
        status: isComplete ? "Complete" as const : isPartial ? "Partial" as const : "Pending" as const,
      }
    })
  }, [items, receivedMap])

  // Summary counts
  const pendingCount = enrichedItems.filter((i) => i.status === "Pending").length
  const partialCount = enrichedItems.filter((i) => i.status === "Partial").length
  const completeCount = enrichedItems.filter((i) => i.status === "Complete").length

  const columns: Column<ItemWithReceiving>[] = [
    {
      key: "customer_name",
      header: "Customer",
      defaultWidth: 150,
      sortable: true,
      filterable: true,
      sortAccessor: (item) => item.customer_name,
      filterAccessor: (item) => item.customer_name,
      cell: (item) => <span className="font-medium">{item.customer_name}</span>,
    },
    {
      key: "order_number",
      header: "Order",
      defaultWidth: 180,
      sortable: true,
      filterable: true,
      sortAccessor: (item) => item.order_number,
      filterAccessor: (item) => item.order_number,
      cell: (item) => <span className="font-mono text-sm">{item.order_number}</span>,
    },
    {
      key: "product_name",
      header: "Product",
      defaultWidth: 160,
      sortable: true,
      filterable: true,
      sortAccessor: (item) => item.product_name,
      filterAccessor: (item) => item.product_name,
      cell: (item) => item.product_name,
    },
    {
      key: "due_date",
      header: "Due Date",
      defaultWidth: 110,
      sortable: true,
      filterable: true,
      sortAccessor: (item) => new Date(item.due_date).getTime(),
      filterAccessor: (item) => new Date(item.due_date).toLocaleDateString(),
      cell: (item) => (
        <span className="text-sm">{new Date(item.due_date).toLocaleDateString()}</span>
      ),
    },
    {
      key: "ipn",
      header: "IPN",
      defaultWidth: 180,
      sortable: true,
      filterable: true,
      sortAccessor: (item) => item.ipn,
      filterAccessor: (item) => item.ipn,
      cell: (item) => (
        <div>
          <span className="font-medium">{item.ipn}</span>
          {item.description && (
            <p className="text-xs text-muted-foreground truncate max-w-[160px]">
              {item.description}
            </p>
          )}
        </div>
      ),
    },
    {
      key: "qty_required",
      header: "Qty Expected",
      defaultWidth: 110,
      className: "text-right",
      sortable: true,
      filterable: true,
      sortAccessor: (item) => Math.ceil(item.qty_required),
      filterAccessor: (item) => Math.ceil(item.qty_required).toLocaleString(),
      cell: (item) => (
        <span className="font-mono">{Math.ceil(item.qty_required).toLocaleString()}</span>
      ),
    },
    {
      key: "qty_received",
      header: "Qty Received",
      defaultWidth: 110,
      className: "text-right",
      sortable: true,
      sortAccessor: (item) => item.qty_received,
      cell: (item) => (
        <span className="font-mono">
          {item.qty_received > 0 ? item.qty_received.toLocaleString() : "\u2014"}
        </span>
      ),
    },
    {
      key: "uids",
      header: "UIDs",
      defaultWidth: 200,
      cell: (item) => (
        <span
          className="text-xs font-mono max-w-[180px] truncate block"
          title={item.uids.join(", ")}
        >
          {item.uids.length > 0 ? item.uids.join(", ") : "\u2014"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      defaultWidth: 100,
      sortable: true,
      filterable: true,
      sortAccessor: (item) => item.status,
      filterAccessor: (item) => item.status,
      cell: (item) => (
        <Badge
          className={
            item.status === "Complete"
              ? "bg-green-100 text-green-800 border-green-200"
              : item.status === "Partial"
                ? "bg-yellow-100 text-yellow-800 border-yellow-200"
                : "bg-red-100 text-red-800 border-red-200"
          }
        >
          {item.status}
        </Badge>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Package className="h-6 w-6" />
          Customer Supplied Items
        </h1>
        <p className="text-muted-foreground mt-1">
          Track materials expected from customers across all open orders
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-muted-foreground">Pending</p>
            <p className="text-2xl font-bold text-red-600">{pendingCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-muted-foreground">Partial</p>
            <p className="text-2xl font-bold text-yellow-600">{partialCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-muted-foreground">Complete</p>
            <p className="text-2xl font-bold text-green-600">{completeCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* DataTable with sorting, filtering, search */}
      <DataTable
        data={enrichedItems}
        columns={columns}
        searchFilter={(item, search) => {
          const s = search.toLowerCase()
          return (
            item.ipn.toLowerCase().includes(s) ||
            item.order_number.toLowerCase().includes(s) ||
            item.customer_name.toLowerCase().includes(s) ||
            item.product_name.toLowerCase().includes(s) ||
            (item.description ?? "").toLowerCase().includes(s)
          )
        }}
        searchPlaceholder="Search by IPN, order, customer, product..."
        pageSize={50}
        isLoading={isLoading}
        emptyMessage="No customer-supplied items found"
      />
    </div>
  )
}
