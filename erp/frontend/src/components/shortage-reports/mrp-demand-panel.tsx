"use client"

import { useState, useMemo } from "react"
import { api, type MrpDemandLine, type MrpAdmittableOrder } from "@/lib/api"
import { useApi } from "@/hooks/use-api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { Plus, Check, EyeOff, Eye, Trash2, Search } from "lucide-react"
import { toast } from "sonner"

interface MrpDemandPanelProps {
  /** Re-run the reports after the demand set changes. */
  onDemandChanged: () => void
}

function formatDate(value: string | null): string {
  if (!value) return "—"
  return new Date(value).toLocaleDateString()
}

/**
 * The admitted jobs, and the button that adds to them.
 *
 * MRP used to infer its demand from order status, so the buyer had no say in
 * what it was planning for. This is that decision made explicit — the direct
 * equivalent of typing a quantity into a column of the spreadsheet, which is
 * what puts a job into the plan there.
 */
export function MrpDemandPanel({ onDemandChanged }: MrpDemandPanelProps) {
  const {
    data: lines,
    isLoading,
    refetch: refetchLines,
  } = useApi<MrpDemandLine[]>("/mrp/demand-lines")

  const {
    data: admittable,
    isLoading: admittableLoading,
    refetch: refetchAdmittable,
  } = useApi<MrpAdmittableOrder[]>("/mrp/admittable-orders")

  const [pickerOpen, setPickerOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [busyId, setBusyId] = useState<string | null>(null)

  const refreshAll = async () => {
    await Promise.all([refetchLines(), refetchAdmittable()])
    onDemandChanged()
  }

  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (admittable ?? []).filter((o) => {
      if (o.is_admitted) return false
      if (!q) return true
      return (
        o.order_number.toLowerCase().includes(q) ||
        o.product_part_number.toLowerCase().includes(q) ||
        o.product_name.toLowerCase().includes(q) ||
        o.customer_name.toLowerCase().includes(q)
      )
    })
  }, [admittable, search])

  const admit = async (order: MrpAdmittableOrder) => {
    setBusyId(order.order_id)
    try {
      await api.post("/mrp/demand-lines", { order_id: order.order_id })
      toast.success(`${order.order_number} added to the MRP run`)
      await refreshAll()
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Could not add that order to the run"
      )
    } finally {
      setBusyId(null)
    }
  }

  // Parking keeps the line and its notes; only the demand stops counting.
  const togglePark = async (line: MrpDemandLine) => {
    setBusyId(line.id)
    try {
      await api.patch(`/mrp/demand-lines/${line.id}`, {
        include_in_totals: !line.include_in_totals,
      })
      toast.success(
        line.include_in_totals
          ? `${line.label} parked — no longer counted`
          : `${line.label} is counted again`
      )
      await refreshAll()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update that job")
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (line: MrpDemandLine) => {
    setBusyId(line.id)
    try {
      await api.delete(`/mrp/demand-lines/${line.id}`)
      toast.success(`${line.label} removed from the run`)
      await refreshAll()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove that job")
    } finally {
      setBusyId(null)
    }
  }

  const counted = (lines ?? []).filter((l) => l.include_in_totals).length
  const parked = (lines ?? []).length - counted

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Jobs in this MRP run</CardTitle>
            <CardDescription>
              MRP plans for these jobs only. Adding or parking a job changes
              every shortage figure on this page.
            </CardDescription>
          </div>
          <Button onClick={() => setPickerOpen(true)} className="shrink-0">
            <Plus className="h-4 w-4 mr-2" />
            Add order to MRP
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (lines ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No jobs admitted yet. Until one is added, MRP falls back to planning
            for every order that is in production.
          </p>
        ) : (
          <>
            <div className="flex gap-2 text-xs text-muted-foreground">
              <span>{counted} counted</span>
              {parked > 0 && <span>· {parked} parked</span>}
            </div>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Job</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[110px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(lines ?? []).map((line) => (
                    <TableRow
                      key={line.id}
                      className={line.include_in_totals ? "" : "opacity-50"}
                    >
                      <TableCell className="font-medium">
                        {line.label}
                        {line.source === "SCRATCH" && (
                          <Badge
                            variant="outline"
                            className="ml-2 bg-purple-50 text-purple-700 border-purple-200"
                          >
                            What-if
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {line.order?.order_number ?? "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {line.quantity.toLocaleString()}
                      </TableCell>
                      <TableCell>{formatDate(line.due_date)}</TableCell>
                      <TableCell>
                        {line.priority ?? (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {line.status_note ?? "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busyId === line.id}
                            onClick={() => togglePark(line)}
                            title={
                              line.include_in_totals
                                ? "Stop counting this job, keeping it in the list"
                                : "Count this job again"
                            }
                          >
                            {line.include_in_totals ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busyId === line.id}
                            onClick={() => remove(line)}
                            title="Remove from the run"
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Add an order to the MRP run</DialogTitle>
            <DialogDescription>
              Only orders in production are listed. Anything already in the run
              is hidden.
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by order, part number or customer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>

          <div className="max-h-[420px] overflow-y-auto rounded-md border">
            {admittableLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : candidates.length === 0 ? (
              <p className="text-sm text-muted-foreground p-6 text-center">
                {search
                  ? "No orders match that search."
                  : "Every order in production is already in the run."}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Part</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead className="w-[90px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {candidates.map((o) => (
                    <TableRow key={o.order_id}>
                      <TableCell className="font-medium">
                        {o.order_number}
                      </TableCell>
                      <TableCell>
                        {o.product_part_number || o.product_name}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {o.customer_name}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {o.quantity.toLocaleString()}
                      </TableCell>
                      <TableCell>{formatDate(o.due_date)}</TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          disabled={busyId === o.order_id}
                          onClick={() => admit(o)}
                        >
                          {busyId === o.order_id ? (
                            "Adding..."
                          ) : (
                            <>
                              <Check className="h-4 w-4 mr-1" />
                              Add
                            </>
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
