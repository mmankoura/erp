"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useApi, useMutation } from "@/hooks/use-api"
import { api } from "@/lib/api"
import { VirtualGrid, type VirtualGridColumn } from "@/components/virtual-grid"
import { Button } from "@/components/ui/button"
import { Chip, type ChipTone } from "@/components/grid/chip"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Plus,
  Trash2,
  CheckCircle,
  ClipboardList,
  Pencil,
  Undo2,
  FileDown,
  FileSpreadsheet,
  Eye,
  MoreHorizontal,
  Lock,
  Unlock,
} from "lucide-react"
import { toast } from "sonner"
import { useAuth, UserRole } from "@/contexts/auth-context"

export interface ConsumableOrderLine {
  id: string
  ata_part_number: string | null
  description: string
  manufacturer: string | null
  manufacturer_pn: string | null
  quantity: number
  unit_cost: number | null
  customer: string | null
  line_number: number | null
  notes: string | null
}

export type ConsumableOrderStatus = "ORDERED" | "RECEIVED"

export interface ConsumableOrder {
  id: string
  order_number: string
  supplier: string
  status: ConsumableOrderStatus
  order_date: string
  expected_date: string | null
  currency: string
  notes: string | null
  created_by: string | null
  lines: ConsumableOrderLine[]
  created_at: string
}

export interface NewLine {
  ata_part_number: string
  description: string
  manufacturer: string
  manufacturer_pn: string
  quantity: string
  unit_cost: string
  customer: string
  notes: string
}

export const emptyLine: NewLine = {
  ata_part_number: "",
  description: "",
  manufacturer: "",
  manufacturer_pn: "",
  quantity: "1",
  unit_cost: "",
  customer: "",
  notes: "",
}

// Status marks the gutter rather than washing the whole row: in a sheet the
// cell background belongs to the selection, and a left border on the row would
// sit under the sticky gutter and disappear when scrolled sideways.
const statusStripe: Record<ConsumableOrderStatus, string> = {
  ORDERED: "bg-blue-500",
  RECEIVED: "bg-emerald-500",
}

const statusTone: Record<ConsumableOrderStatus, ChipTone> = {
  ORDERED: "info",
  RECEIVED: "success",
}

type CoLineRow = {
  order: ConsumableOrder
  line: ConsumableOrderLine | null
  rowKey: string
}

function InlineStatusCell({
  order,
  onSaved,
  disabled,
}: {
  order: ConsumableOrder
  onSaved: () => void
  disabled?: boolean
}) {
  const [pending, setPending] = useState<string | null>(null)

  const run = async (endpoint: "receive" | "undo-receive") => {
    setPending(endpoint)
    try {
      await api.post(`/consumable-orders/${order.id}/${endpoint}`, {})
      toast.success(`Order ${order.order_number} → ${endpoint === "receive" ? "RECEIVED" : "ORDERED"}`)
      onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed to ${endpoint}`)
    } finally {
      setPending(null)
    }
  }

  if (disabled) {
    return <Chip tone={statusTone[order.status]}>{order.status}</Chip>
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={pending !== null}
          className="inline-flex items-center hover:opacity-80 transition-opacity cursor-pointer disabled:opacity-50"
          title="Change status"
        >
          <Chip tone={statusTone[order.status]}>{pending ? "..." : order.status}</Chip>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {order.status === "ORDERED" && (
          <DropdownMenuItem onClick={() => run("receive")}>
            Mark Received
          </DropdownMenuItem>
        )}
        {order.status === "RECEIVED" && (
          <DropdownMenuItem onClick={() => run("undo-receive")}>
            Undo Receive
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default function ConsumableOrdersPage() {
  const { hasRole } = useAuth()
  const canEditTable = hasRole(UserRole.ADMIN, UserRole.MANAGER)
  const [editUnlocked, setEditUnlocked] = useState(false)
  const [filterStatus, setFilterStatus] = useState<string>("")

  const { data: orders, isLoading, refetch } = useApi<ConsumableOrder[]>(
    filterStatus ? `/consumable-orders?status=${filterStatus}` : "/consumable-orders",
  )

  const deleteMutation = useMutation(
    (id: string) => api.delete(`/consumable-orders/${id}`),
    {
      onSuccess: () => {
        toast.success("Order deleted")
        refetch()
      },
      onError: (error) => toast.error(error.message || "Failed to delete order"),
    },
  )

  // Flatten orders into per-line rows; orders with no lines get a placeholder row.
  const flatLines = useMemo<CoLineRow[] | null>(() => {
    if (!orders) return null
    const rows: CoLineRow[] = []
    for (const o of orders) {
      if (!o.lines || o.lines.length === 0) {
        rows.push({ order: o, line: null, rowKey: `o-${o.id}` })
      } else {
        for (const line of o.lines) {
          rows.push({ order: o, line, rowKey: `l-${line.id}` })
        }
      }
    }
    return rows
  }, [orders])

  const columns: VirtualGridColumn<CoLineRow>[] = [
    {
      id: "order_number",
      header: "Order #",
      size: 170,
      sortable: true,
      filterable: true,
      accessorFn: (r) => r.order.order_number,
      filterAccessor: (r) => r.order.order_number,
      cell: (r) => (
        <Link
          href={`/consumable-orders/${r.order.id}`}
          className="font-mono font-medium italic hover:underline"
          title="Open order details"
        >
          {r.order.order_number}
        </Link>
      ),
    },
    {
      id: "supplier",
      header: "Supplier",
      size: 160,
      sortable: true,
      filterable: true,
      accessorFn: (r) => r.order.supplier,
      filterAccessor: (r) => r.order.supplier,
      cell: (r) => <span className="italic text-muted-foreground">{r.order.supplier}</span>,
    },
    {
      id: "line_number",
      header: "Line",
      size: 60,
      align: "right",
      sortable: false,
      filterable: false,
      accessorFn: (r) => r.line?.line_number ?? 0,
      cell: (r) => <span className="text-muted-foreground">{r.line?.line_number ?? "—"}</span>,
    },
    {
      id: "ata_pn",
      header: "AT&A P/N",
      size: 130,
      sortable: true,
      filterable: true,
      accessorFn: (r) => r.line?.ata_part_number ?? "",
      filterAccessor: (r) => r.line?.ata_part_number ?? "—",
      cell: (r) => <span className="font-mono">{r.line?.ata_part_number || "—"}</span>,
    },
    {
      id: "description",
      header: "Description",
      size: 240,
      sortable: true,
      filterable: true,
      accessorFn: (r) => r.line?.description ?? "",
      filterAccessor: (r) => r.line?.description ?? "—",
      cell: (r) => <span className="truncate">{r.line?.description || "—"}</span>,
    },
    {
      id: "mfr",
      header: "MFR",
      size: 120,
      sortable: true,
      filterable: true,
      accessorFn: (r) => r.line?.manufacturer ?? "",
      filterAccessor: (r) => r.line?.manufacturer ?? "—",
      cell: (r) => <span>{r.line?.manufacturer || "—"}</span>,
    },
    {
      id: "mpn",
      header: "MFR P/N",
      size: 140,
      sortable: true,
      filterable: true,
      accessorFn: (r) => r.line?.manufacturer_pn ?? "",
      filterAccessor: (r) => r.line?.manufacturer_pn ?? "—",
      cell: (r) => <span className="font-mono">{r.line?.manufacturer_pn || "—"}</span>,
    },
    {
      id: "qty",
      header: "Qty",
      size: 70,
      align: "right",
      sortable: true,
      filterable: false,
      accessorFn: (r) => parseFloat(String(r.line?.quantity ?? 0)),
      cell: (r) => (
        <span className="font-mono">
          {r.line ? parseFloat(String(r.line.quantity)) : "—"}
        </span>
      ),
    },
    {
      id: "unit_cost",
      header: "Unit Cost",
      size: 110,
      align: "right",
      sortable: true,
      filterable: false,
      accessorFn: (r) => parseFloat(String(r.line?.unit_cost ?? 0)),
      cell: (r) => {
        const cost = r.line?.unit_cost != null ? parseFloat(String(r.line.unit_cost)) : null
        return (
          <span className="font-mono">
            {cost != null ? `${r.order.currency} ${cost.toFixed(2)}` : "—"}
          </span>
        )
      },
    },
    {
      id: "customer",
      header: "Customer",
      size: 130,
      sortable: true,
      filterable: true,
      accessorFn: (r) => r.line?.customer ?? "",
      filterAccessor: (r) => r.line?.customer ?? "—",
      cell: (r) => <span className="text-muted-foreground">{r.line?.customer || "—"}</span>,
    },
    {
      id: "order_date",
      header: "Order Date",
      size: 110,
      sortable: true,
      filterable: false,
      accessorFn: (r) => new Date(r.order.order_date).getTime(),
      cell: (r) => new Date(r.order.order_date).toLocaleDateString(),
    },
    {
      id: "status",
      header: "Status",
      size: 110,
      sortable: true,
      filterable: true,
      accessorFn: (r) => r.order.status,
      filterAccessor: (r) => r.order.status,
      cell: (r) => (
        <InlineStatusCell
          order={r.order}
          onSaved={refetch}
          disabled={!canEditTable || !editUnlocked}
        />
      ),
    },
    {
      id: "actions",
      header: "",
      size: 130,
      sortable: false,
      filterable: false,
      accessorFn: () => "",
      cell: (r) => (
        <div className="flex items-center gap-1">
          <Link href={`/consumable-orders/${r.order.id}`}>
            <Button variant="ghost" size="icon" className="h-5 w-5" title="Open order details">
              <Eye className="h-4 w-4" />
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            title="Download PDF"
            onClick={async () => {
              const { generateConsumablePoPdf } = await import("@/lib/consumable-po-pdf")
              await generateConsumablePoPdf(r.order)
            }}
          >
            <FileDown className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            title="Download Excel"
            onClick={async () => {
              const { exportConsumableOrderToExcel } = await import("@/lib/consumable-po-excel")
              exportConsumableOrderToExcel(r.order)
            }}
          >
            <FileSpreadsheet className="h-4 w-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-5 w-5">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <Link href={`/consumable-orders/${r.order.id}`}>
                <DropdownMenuItem>
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit
                </DropdownMenuItem>
              </Link>
              {r.order.status === "ORDERED" && (
                <DropdownMenuItem
                  onClick={async () => {
                    try {
                      await api.post(`/consumable-orders/${r.order.id}/receive`, {})
                      toast.success("Order marked as received")
                      refetch()
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Failed")
                    }
                  }}
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Mark Received
                </DropdownMenuItem>
              )}
              {r.order.status === "RECEIVED" && (
                <DropdownMenuItem
                  onClick={async () => {
                    try {
                      await api.post(`/consumable-orders/${r.order.id}/undo-receive`, {})
                      toast.success("Receiving undone")
                      refetch()
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Failed")
                    }
                  }}
                >
                  <Undo2 className="h-4 w-4 mr-2" />
                  Undo Receive
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => {
                  if (confirm(`Delete order ${r.order.order_number}?`)) {
                    deleteMutation.mutate(r.order.id)
                  }
                }}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardList className="h-6 w-6" />
            Consumable Orders
          </h1>
          <p className="text-muted-foreground mt-1">
            Track orders for production consumables (solder paste, stencils, etc.)
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/consumable-orders/new">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Order
            </Button>
          </Link>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Label htmlFor="co-status-filter" className="text-sm font-medium">Status:</Label>
          <Select
            value={filterStatus || "__all__"}
            onValueChange={(v) => setFilterStatus(v === "__all__" ? "" : v)}
          >
            <SelectTrigger className="w-[180px]" id="co-status-filter">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Statuses</SelectItem>
              <SelectItem value="ORDERED">Ordered</SelectItem>
              <SelectItem value="RECEIVED">Received</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {canEditTable && (
          <Button
            variant={editUnlocked ? "default" : "outline"}
            size="sm"
            onClick={() => setEditUnlocked((v) => !v)}
          >
            {editUnlocked ? (
              <>
                <Unlock className="h-4 w-4 mr-1" />
                Edit unlocked
              </>
            ) : (
              <>
                <Lock className="h-4 w-4 mr-1" />
                Edit locked
              </>
            )}
          </Button>
        )}
      </div>

      <VirtualGrid
        data={flatLines}
        columns={columns}
        isLoading={isLoading}
        searchPlaceholder="Search by order #, supplier, description, P/N, MFR, customer..."
        searchFn={(r, q) =>
          r.order.order_number.toLowerCase().includes(q) ||
          r.order.supplier.toLowerCase().includes(q) ||
          (r.line?.description ?? "").toLowerCase().includes(q) ||
          (r.line?.ata_part_number ?? "").toLowerCase().includes(q) ||
          (r.line?.manufacturer ?? "").toLowerCase().includes(q) ||
          (r.line?.manufacturer_pn ?? "").toLowerCase().includes(q) ||
          (r.line?.customer ?? "").toLowerCase().includes(q)
        }
        rowStripe={(r) => ({ color: statusStripe[r.order.status], label: r.order.status })}
        spreadsheet
        storageKey="consumable-orders"
        getRowId={(r) => `${r.order.id}:${r.line?.id ?? "none"}`}
      />
    </div>
  )
}
