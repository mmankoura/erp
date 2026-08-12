"use client"

import { useState, useMemo } from "react"
import { useApi } from "@/hooks/use-api"
import { VirtualGrid, type VirtualGridColumn } from "@/components/virtual-grid"
import { partCols, dateCol, monoCol, textCol, numCol } from "@/components/grid/columns"
import { Chip, type ChipTone } from "@/components/grid/chip"

interface TransactionRow {
  id: string
  material_id: string
  material: {
    internal_part_number: string
    description: string | null
    customer?: { name: string } | null
  } | null
  transaction_type: string
  quantity: number
  reference_type: string
  reason: string | null
  created_by: string | null
  lot_id: string | null
  lot: { uid: string } | null
  owner_type: string
  owner?: { name: string } | null
  created_at: string
}

interface GridResponse {
  data: TransactionRow[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

/** The endpoint sorts on its own column names, not on the grid's column ids. */
const SORT_COLUMN: Record<string, string> = {
  created_at: "date",
  customer: "customer",
  ipn: "material",
  transaction_type: "type",
  quantity: "quantity",
  created_by: "by",
}

const TYPE_TONE: Record<string, ChipTone> = {
  RECEIPT: "success",
  CONSUMPTION: "danger",
  ADJUSTMENT: "info",
  SCRAP: "warning",
  TRANSFER: "muted",
  ISSUE_TO_WO: "warning",
  RETURN_FROM_WO: "info",
}

/**
 * Recent inventory activity.
 *
 * Sorting and the search box run on the server — the endpoint returns a window
 * of the newest 10,000 rows, so a client-side search would only ever find what
 * happened to be in that window. Column filters and the filter row stay local,
 * over the loaded rows; the footer says how much of the table that is.
 */
export function RecentTransactionsGrid() {
  const [sort, setSort] = useState<{ columnId: string; desc: boolean } | null>({
    columnId: "created_at",
    desc: true,
  })
  const [search, setSearch] = useState("")

  const query = new URLSearchParams({
    page: "1",
    pageSize: "10000",
    sortColumn: SORT_COLUMN[sort?.columnId ?? "created_at"] ?? "date",
    sortDirection: sort?.desc === false ? "ASC" : "DESC",
  })
  if (search) query.set("search", search)

  const { data: response, isLoading } = useApi<GridResponse>(
    `/inventory/transactions/grid?${query.toString()}`
  )
  const rows = useMemo(() => response?.data ?? null, [response])

  const columns: VirtualGridColumn<TransactionRow>[] = useMemo(
    () => [
      dateCol("created_at", "Date", (t) => t.created_at, { time: true, size: 150 }),
      monoCol("uid", "UID", (t) => t.lot?.uid, { size: 150, sortable: false }),
      textCol("customer", "Customer", (t) => t.material?.customer?.name ?? t.owner?.name, {
        size: 140,
      }),
      ...partCols<TransactionRow>({
        ipn: (t) => t.material?.internal_part_number,
        description: (t) => t.material?.description,
        ipnSize: 150,
      }),
      {
        ...textCol<TransactionRow>("transaction_type", "Type", (t) => t.transaction_type, {
          size: 130,
        }),
        cell: (t) => (
          <Chip tone={TYPE_TONE[t.transaction_type] ?? "neutral"}>
            {t.transaction_type.replace(/_/g, " ")}
          </Chip>
        ),
      },
      {
        ...numCol<TransactionRow>("quantity", "Quantity", (t) => t.quantity),
        cell: (t) => (
          <span
            className={
              t.quantity > 0
                ? "font-mono tabular-nums text-emerald-600"
                : t.quantity < 0
                  ? "font-mono tabular-nums text-red-600"
                  : "font-mono tabular-nums"
            }
          >
            {t.quantity > 0 ? "+" : ""}
            {t.quantity.toLocaleString()}
          </span>
        ),
      },
      textCol("created_by", "By", (t) => t.created_by, { size: 120 }),
    ],
    []
  )

  return (
    <VirtualGrid
      data={rows}
      columns={columns}
      title="Recent Activity"
      isLoading={isLoading}
      searchPlaceholder="Search UID, IPN, customer, type, reason..."
      emptyMessage="No transactions found"
      spreadsheet
      storageKey="inventory-recent-activity"
      getRowId={(t) => t.id}
      server={{
        sort,
        onSortChange: setSort,
        onSearchChange: setSearch,
        totalRows: response?.total,
      }}
    />
  )
}
