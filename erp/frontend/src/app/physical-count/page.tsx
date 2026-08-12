"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useApi } from "@/hooks/use-api"
import {
  type PhysicalCount,
  type PhysicalCountStatus,
} from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Chip } from "@/components/grid/chip"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { VirtualGrid, type VirtualGridColumn } from "@/components/virtual-grid"
import { Plus, ClipboardPen } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type PhysicalCountWithId = PhysicalCount & { id: string }

const statusVariant: Record<PhysicalCountStatus, "default" | "secondary" | "outline" | "destructive"> = {
  PLANNED: "outline",
  IN_PROGRESS: "default",
  PAUSED: "secondary",
  PENDING_REVIEW: "secondary",
  APPROVED: "default",
  CANCELLED: "destructive",
}

export default function PhysicalCountListPage() {
  const router = useRouter()
  const [statusFilter, setStatusFilter] = useState<string>("all")

  const endpoint = statusFilter === "all"
    ? "/physical-counts"
    : `/physical-counts?status=${statusFilter}`

  const { data: counts, isLoading } = useApi<PhysicalCountWithId[]>(endpoint)

  const columns: VirtualGridColumn<PhysicalCountWithId>[] = [
    {
      id: "count_number",
      header: "Count #",
      size: 160,
      sortable: true,
      filterable: true,
      accessorFn: (c) => c.count_number,
      cell: (c) => <span className="font-mono font-medium">{c.count_number}</span>,
    },
    {
      id: "customer",
      header: "Customer",
      size: 200,
      sortable: true,
      filterable: true,
      accessorFn: (c) => c.customer?.name || "",
      filterAccessor: (c) => c.customer?.name || "—",
      cell: (c) => <span>{c.customer?.name ?? "—"}</span>,
    },
    {
      id: "status",
      header: "Status",
      size: 120,
      sortable: true,
      filterable: true,
      accessorFn: (c) => c.status,
      filterAccessor: (c) => c.status,
      cell: (c) => <Chip>{c.status}</Chip>,
    },
    {
      id: "scope",
      header: "Scope",
      size: 200,
      sortable: false,
      accessorFn: () => "",
      cell: (c) => (
        <span className="text-xs text-muted-foreground">
          {c.bin_filter ? `bin: ${c.bin_filter}` : ""}
          {c.bin_filter && c.category_filter ? " · " : ""}
          {c.category_filter ? `cat: ${c.category_filter}` : ""}
          {!c.bin_filter && !c.category_filter ? "all" : ""}
        </span>
      ),
    },
    {
      id: "totals",
      header: "Totals",
      size: 220,
      sortable: false,
      accessorFn: () => "",
      cell: (c) => (
        <span className="text-xs">
          {c.total_expected_lots} expected · {c.shortage_count + c.overage_count + c.not_scanned_count + c.orphan_count} discrepancies
        </span>
      ),
    },
    {
      id: "started",
      header: "Started",
      size: 130,
      sortable: true,
      accessorFn: (c) => c.started_at || "",
      cell: (c) => (
        <span className="text-xs text-muted-foreground">
          {c.started_at ? new Date(c.started_at).toLocaleString() : "—"}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      size: 100,
      sortable: false,
      filterable: false,
      accessorFn: () => "",
      cell: (c) => (
        <Button variant="ghost" size="icon" className="h-5 w-5" title="Open count" onClick={() => router.push(`/physical-count/${c.id}`)}>
          Open
        </Button>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <ClipboardPen className="h-7 w-7" />
            Physical Count
          </h1>
          <p className="text-muted-foreground">
            UID-scan inventory verification by customer.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="PLANNED">Planned</SelectItem>
              <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
              <SelectItem value="PENDING_REVIEW">Pending Review</SelectItem>
              <SelectItem value="APPROVED">Approved</SelectItem>
              <SelectItem value="CANCELLED">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Link href="/physical-count/new">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Count
            </Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Counts</CardTitle>
          <CardDescription>Newest first.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <VirtualGrid
            data={counts ?? null}
            columns={columns}
            isLoading={isLoading}
            searchPlaceholder="Search by count #, customer, or status..."
            searchFn={(c, q) =>
              c.count_number.toLowerCase().includes(q) ||
              (c.customer?.name?.toLowerCase().includes(q) ?? false) ||
              c.status.toLowerCase().includes(q)
            }
            spreadsheet
            bare
            storageKey="physical-counts"
            getRowId={(c) => c.id}
          />
        </CardContent>
      </Card>
    </div>
  )
}
