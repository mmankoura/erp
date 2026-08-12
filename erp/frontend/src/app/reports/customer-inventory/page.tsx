"use client"

import { useState } from "react"
import { useApi } from "@/hooks/use-api"
import {
  type Customer,
  type CustomerInventoryReport,
  type CustomerInventorySummaryRow,
  type CustomerInventoryDetailRow,
} from "@/lib/api"
import { exportCustomerInventoryToExcel } from "@/lib/customer-inventory-excel"
import { generateCustomerInventoryPdf } from "@/lib/customer-inventory-pdf"
import { VirtualGrid, type VirtualGridColumn } from "@/components/virtual-grid"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { FileSpreadsheet, FileText } from "lucide-react"
import { toast } from "sonner"

type SummaryWithId = CustomerInventorySummaryRow & { id: string }
type DetailWithId = CustomerInventoryDetailRow & { id: string }

export default function CustomerInventoryReportPage() {
  const [customerId, setCustomerId] = useState<string>("")

  const { data: customers } = useApi<Customer[]>("/customers")
  const { data: report, isLoading } = useApi<CustomerInventoryReport>(
    `/inventory/customer-report/${customerId}`,
    { enabled: !!customerId },
  )

  const summaryRows: SummaryWithId[] =
    report?.summary.map((s) => ({ ...s, id: s.material_id })) ?? []
  const detailRows: DetailWithId[] =
    report?.detail.map((d) => ({ ...d, id: d.uid })) ?? []

  const summaryColumns: VirtualGridColumn<SummaryWithId>[] = [
    { id: "ipn", header: "IPN", size: 170, sortable: true, filterable: true, filterAccessor: (r) => r.ipn ?? "", accessorFn: (r) => r.ipn ?? "", cell: (r) => <span className="font-medium text-sm">{r.ipn ?? "—"}</span> },
    { id: "mfr", header: "MFR", size: 140, sortable: true, filterable: true, filterAccessor: (r) => r.mfr ?? "", accessorFn: (r) => r.mfr ?? "", cell: (r) => <span className="text-sm">{r.mfr ?? "—"}</span> },
    { id: "mpn", header: "MPN", size: 180, sortable: true, filterable: true, filterAccessor: (r) => r.mpn ?? "", accessorFn: (r) => r.mpn ?? "", cell: (r) => <span className="font-mono text-xs">{r.mpn ?? "—"}</span> },
    { id: "description", header: "Description", size: 260, sortable: true, filterable: true, filterAccessor: (r) => r.description ?? "", accessorFn: (r) => r.description ?? "", cell: (r) => <span className="text-sm text-muted-foreground truncate">{r.description ?? "—"}</span> },
    { id: "quantity", header: "Qty On Hand", size: 120, align: "right", sortable: true, accessorFn: (r) => r.quantity, cell: (r) => <span className="font-mono text-sm">{r.quantity.toLocaleString()}</span> },
    { id: "reels", header: "Reels", size: 80, align: "right", sortable: true, accessorFn: (r) => r.reel_count, cell: (r) => <span className="font-mono text-sm">{r.reel_count}</span> },
  ]

  const detailColumns: VirtualGridColumn<DetailWithId>[] = [
    { id: "uid", header: "UID", size: 150, sortable: true, filterable: true, filterAccessor: (r) => r.uid, accessorFn: (r) => r.uid, cell: (r) => <span className="font-mono font-medium text-sm">{r.uid}</span> },
    { id: "ipn", header: "IPN", size: 160, sortable: true, filterable: true, filterAccessor: (r) => r.ipn ?? "", accessorFn: (r) => r.ipn ?? "", cell: (r) => <span className="text-sm">{r.ipn ?? "—"}</span> },
    { id: "description", header: "Description", size: 240, sortable: true, filterable: true, filterAccessor: (r) => r.description ?? "", accessorFn: (r) => r.description ?? "", cell: (r) => <span className="text-sm text-muted-foreground truncate">{r.description ?? "—"}</span> },
    { id: "quantity", header: "Qty", size: 100, align: "right", sortable: true, accessorFn: (r) => r.quantity, cell: (r) => <span className="font-mono text-sm">{r.quantity.toLocaleString()}</span> },
    { id: "package", header: "Package", size: 90, sortable: true, filterable: true, filterAccessor: (r) => r.package_type, accessorFn: (r) => r.package_type, cell: (r) => <span className="text-sm">{r.package_type}</span> },
    { id: "bin", header: "BIN", size: 90, sortable: true, filterable: true, filterAccessor: (r) => r.bin ?? "", accessorFn: (r) => r.bin ?? "", cell: (r) => <span className="font-mono text-sm">{r.bin ?? "—"}</span> },
    { id: "po_ref", header: "PO Ref", size: 120, sortable: true, filterable: true, filterAccessor: (r) => r.po_reference ?? "", accessorFn: (r) => r.po_reference ?? "", cell: (r) => <span className="text-sm text-muted-foreground">{r.po_reference ?? "—"}</span> },
    { id: "received", header: "Received", size: 110, sortable: true, accessorFn: (r) => r.received_date ?? "", cell: (r) => <span className="text-xs text-muted-foreground">{r.received_date ? new Date(r.received_date).toLocaleDateString() : "—"}</span> },
  ]

  const exportExcel = () => {
    if (!report) return
    try {
      exportCustomerInventoryToExcel(report)
      toast.success("Excel exported")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed")
    }
  }

  const exportPdf = () => {
    if (!report) return
    try {
      generateCustomerInventoryPdf(report)
      toast.success("PDF generated")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "PDF failed")
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Customer Inventory</h1>
          <p className="text-muted-foreground">
            Stock currently held at AT&amp;A for a customer — for sending them an inventory status update
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={exportExcel} disabled={!report}>
            <FileSpreadsheet className="h-4 w-4 mr-1" /> Excel
          </Button>
          <Button variant="outline" onClick={exportPdf} disabled={!report}>
            <FileText className="h-4 w-4 mr-1" /> PDF
          </Button>
        </div>
      </div>

      <div className="w-72">
        <Select value={customerId} onValueChange={setCustomerId}>
          <SelectTrigger>
            <SelectValue placeholder="Select a customer" />
          </SelectTrigger>
          <SelectContent>
            {(customers ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name} ({c.code})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!customerId ? (
        <p className="text-muted-foreground text-sm">
          Pick a customer to see what we are holding for them.
        </p>
      ) : isLoading ? (
        <p className="text-muted-foreground text-sm">Loading...</p>
      ) : !report ? null : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Distinct parts</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{report.totals.distinct_parts.toLocaleString()}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Reels</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{report.totals.reels.toLocaleString()}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total quantity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{report.totals.total_quantity.toLocaleString()}</div>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="summary">
            <TabsList>
              <TabsTrigger value="summary">Summary by part ({report.summary.length})</TabsTrigger>
              <TabsTrigger value="detail">Reel detail ({report.detail.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="summary">
              <VirtualGrid
                data={summaryRows}
                columns={summaryColumns}
                title={`${report.customer.name} — summary by part`}
                searchPlaceholder="Search IPN, MFR, MPN, description..."
                searchFn={(r, q) =>
                  [r.ipn, r.mfr, r.mpn, r.description]
                    .filter(Boolean)
                    .some((v) => String(v).toLowerCase().includes(q.toLowerCase()))
                }
                spreadsheet
                storageKey="customer-inventory-summary"
                getRowId={(r) => r.id}
              />
            </TabsContent>
            <TabsContent value="detail">
              <VirtualGrid
                data={detailRows}
                columns={detailColumns}
                title={`${report.customer.name} — reel detail`}
                searchPlaceholder="Search UID, IPN, description, BIN..."
                searchFn={(r, q) =>
                  [r.uid, r.ipn, r.description, r.bin, r.po_reference]
                    .filter(Boolean)
                    .some((v) => String(v).toLowerCase().includes(q.toLowerCase()))
                }
                spreadsheet
                storageKey="customer-inventory-detail"
                getRowId={(r) => r.id}
              />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  )
}
