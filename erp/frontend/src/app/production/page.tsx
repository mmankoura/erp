"use client"

import { useApi, useMutation } from "@/hooks/use-api"
import { toast } from "sonner"
import {
  api,
  type WipSummary,
  type StageSummary,
  type OrderWipDetails,
  type ProductionStage,
  type ProductionLog,
} from "@/lib/api"
import { VirtualGrid, type VirtualGridColumn } from "@/components/virtual-grid"
import { numCol, dateCol } from "@/components/grid/columns"
import { Chip } from "@/components/grid/chip"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Package,
  Layers,
  Cpu,
  CircuitBoard,
  CheckCircle,
  Truck,
  ArrowRight,
  Play,
  Clock,
  ChevronRight,
} from "lucide-react"
import { useState, useMemo } from "react"
import Link from "next/link"

const stageConfig: Record<ProductionStage, { label: string; icon: React.ElementType; color: string }> = {
  NOT_STARTED: { label: "Not Started", icon: Clock, color: "bg-gray-100 text-gray-800" },
  KITTING: { label: "Kitting", icon: Package, color: "bg-blue-100 text-blue-800" },
  SMT: { label: "SMT", icon: Cpu, color: "bg-purple-100 text-purple-800" },
  TH: { label: "Through-Hole", icon: CircuitBoard, color: "bg-indigo-100 text-indigo-800" },
  COMPLETED: { label: "Completed", icon: CheckCircle, color: "bg-green-100 text-green-800" },
  SHIPPED: { label: "Shipped", icon: Truck, color: "bg-emerald-100 text-emerald-800" },
}

const stageOrder: ProductionStage[] = ["NOT_STARTED", "KITTING", "SMT", "TH", "COMPLETED", "SHIPPED"]

/** Where each stage's quantity lives on a WIP row, so the stage columns can be generated from `stageOrder` rather than written out six times. */
const stageQuantity: Record<ProductionStage, (row: WipSummary) => number> = {
  NOT_STARTED: (row) => row.quantity_not_started,
  KITTING: (row) => row.quantity_in_kitting,
  SMT: (row) => row.quantity_in_smt,
  TH: (row) => row.quantity_in_th,
  COMPLETED: (row) => row.quantity_completed,
  SHIPPED: (row) => row.quantity_shipped,
}

function StageCard({ summary, onClick }: { summary: StageSummary; onClick: () => void }) {
  const config = stageConfig[summary.stage]
  const Icon = config.icon

  return (
    <Card className="cursor-pointer hover:border-primary transition-colors" onClick={onClick}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Icon className="h-4 w-4" />
            {config.label}
          </CardTitle>
          <Badge variant="secondary">{summary.order_count} orders</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{summary.total_units} units</div>
        <p className="text-xs text-muted-foreground mt-1">
          {summary.orders.length > 0 && `Next due: ${new Date(summary.orders[0].due_date).toLocaleDateString()}`}
        </p>
      </CardContent>
    </Card>
  )
}

export default function ProductionPage() {
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null)
  const [moveDialogOpen, setMoveDialogOpen] = useState(false)
  const [startDialogOpen, setStartDialogOpen] = useState(false)
  const [shipDialogOpen, setShipDialogOpen] = useState(false)
  const [selectedStage, setSelectedStage] = useState<ProductionStage | null>(null)

  // Form state
  const [moveFromStage, setMoveFromStage] = useState<ProductionStage>("KITTING")
  const [moveToStage, setMoveToStage] = useState<ProductionStage>("SMT")
  const [moveQuantity, setMoveQuantity] = useState("")
  const [moveNotes, setMoveNotes] = useState("")
  const [moveAutoConsume, setMoveAutoConsume] = useState(true)
  const [startQuantity, setStartQuantity] = useState("")
  const [shipQuantity, setShipQuantity] = useState("")

  // Data fetching
  const { data: wipData, isLoading: wipLoading, refetch: refreshWip } = useApi<WipSummary[]>("/production/wip")
  const { data: stageData, isLoading: stageLoading, refetch: refreshStages } = useApi<StageSummary[]>("/production/stages")
  const { data: orderDetails, isLoading: orderLoading, refetch: refreshOrder } = useApi<OrderWipDetails>(
    `/production/order/${selectedOrder}`,
    { enabled: !!selectedOrder }
  )

  // Mutations
  const startProduction = useMutation<{ order: unknown; log: unknown }, { quantity?: number; created_by?: string }>(
    (data) => api.post(`/production/order/${selectedOrder}/start`, data),
    {
      onSuccess: () => {
        toast.success("Production started")
        setStartDialogOpen(false)
        setStartQuantity("")
        refreshAll()
      },
      onError: (error) => toast.error(`Failed to start production: ${error.message}`),
    }
  )

  const moveUnits = useMutation<
    { order: unknown; log: unknown },
    { from_stage: ProductionStage; to_stage: ProductionStage; quantity: number; notes?: string; created_by?: string; auto_consume?: boolean }
  >(
    (data) => api.post(`/production/order/${selectedOrder}/move`, data),
    {
      onSuccess: () => {
        toast.success("Units moved successfully")
        setMoveDialogOpen(false)
        resetMoveForm()
        refreshAll()
      },
      onError: (error) => toast.error(`Failed to move units: ${error.message}`),
    }
  )

  const shipUnits = useMutation<{ order: unknown; log: unknown }, { quantity: number; created_by?: string }>(
    (data) => api.post(`/production/order/${selectedOrder}/ship`, data),
    {
      onSuccess: () => {
        toast.success("Units shipped")
        setShipDialogOpen(false)
        setShipQuantity("")
        refreshAll()
      },
      onError: (error) => toast.error(`Failed to ship units: ${error.message}`),
    }
  )

  const refreshAll = () => {
    refreshWip()
    refreshStages()
    if (selectedOrder) refreshOrder()
  }

  const resetMoveForm = () => {
    setMoveFromStage("KITTING")
    setMoveToStage("SMT")
    setMoveQuantity("")
    setMoveNotes("")
    setMoveAutoConsume(true)
  }

  // Get active WIP (exclude fully shipped)
  const activeWip = useMemo(() => {
    if (!wipData) return []
    return wipData.filter((w) => w.quantity_shipped < w.total_quantity)
  }, [wipData])

  // Counts for summary
  const notStartedCount = activeWip.filter((w) => w.quantity_not_started > 0 && w.quantity_not_started === w.total_quantity).length
  const inProductionCount = activeWip.filter((w) => w.quantity_in_kitting > 0 || w.quantity_in_smt > 0 || w.quantity_in_th > 0).length
  const completedCount = activeWip.filter((w) => w.quantity_completed > 0).length

  // Filter WIP by selected stage
  const filteredWip = useMemo(() => {
    if (!selectedStage || !activeWip) return activeWip
    return activeWip.filter((w) => {
      switch (selectedStage) {
        case "NOT_STARTED":
          return w.quantity_not_started > 0
        case "KITTING":
          return w.quantity_in_kitting > 0
        case "SMT":
          return w.quantity_in_smt > 0
        case "TH":
          return w.quantity_in_th > 0
        case "COMPLETED":
          return w.quantity_completed > 0
        case "SHIPPED":
          return w.quantity_shipped > 0
        default:
          return true
      }
    })
  }, [activeWip, selectedStage])

  const columns: VirtualGridColumn<WipSummary>[] = [
    {
      id: "order_number",
      header: "Order",
      size: 180,
      sortable: true,
      filterable: true,
      accessorFn: (row) => row.order_number,
      filterAccessor: (row) => row.order_number,
      cell: (row) => (
        <Link href={`/orders/${row.order_id}`} className="text-primary hover:underline font-medium">
          {row.order_number}
        </Link>
      ),
    },
    {
      id: "customer_name",
      header: "Customer",
      size: 140,
      sortable: true,
      filterable: true,
      accessorFn: (row) => row.customer_name,
      filterAccessor: (row) => row.customer_name,
      cell: (row) => row.customer_name,
    },
    {
      id: "product_name",
      header: "Product",
      size: 160,
      sortable: true,
      filterable: true,
      accessorFn: (row) => row.product_name,
      filterAccessor: (row) => row.product_name,
      cell: (row) => row.product_name,
    },
    numCol("total_quantity", "Total Qty", (row) => row.total_quantity, {
      size: 90,
      decimals: 0,
    }),
    {
      id: "status",
      header: "Status",
      size: 120,
      sortable: true,
      filterable: true,
      accessorFn: (row) => row.status,
      filterAccessor: (row) => row.status.replace("_", " "),
      copyValue: (row) => row.status.replace("_", " "),
      cell: (row) => <Chip>{row.status.replace("_", " ")}</Chip>,
    },
    // The six stages were one 300px cell of wrapping badges, which a fixed row
    // height clips. As six columns each one sorts, filters and copies on its
    // own — "which orders have anything in SMT" is a click rather than a read —
    // and Excel can sum a stage down the column. The grid remembers hidden
    // columns, so the stages you don't watch can be turned off once.
    ...stageOrder.map((stage) =>
      numCol<WipSummary>(stage.toLowerCase(), stageConfig[stage].label, stageQuantity[stage], {
        size: 90,
        decimals: 0,
        // Zero is the common case here; muting it keeps the occupied stages
        // legible while the number stays sortable and copyable.
        cell: (row) => {
          const quantity = stageQuantity[stage](row)
          return (
            <span className={`font-mono tabular-nums ${quantity === 0 ? "text-muted-foreground/40" : ""}`}>
              {quantity.toLocaleString()}
            </span>
          )
        },
      })
    ),
    {
      ...dateCol<WipSummary>("due_date", "Due Date", (row) => row.due_date, { size: 120 }),
      // Keeps a custom cell so overdue still reads at a glance.
      cell: (row) => {
        const dueDate = new Date(row.due_date)
        const isOverdue = dueDate < new Date()
        return (
          <span className={`tabular-nums ${isOverdue ? "text-red-600 font-medium" : ""}`}>
            {dueDate.toLocaleDateString()}
          </span>
        )
      },
    },
    {
      id: "actions",
      header: "",
      size: 100,
      sortable: false,
      filterable: false,
      accessorFn: () => "",
      copyValue: () => "",
      // Start / Move / Ship lose their text labels: three labelled buttons need
      // 240px and a 40px row. The icons were already there, and each keeps the
      // label as its tooltip.
      cell: (row) => (
        <div className="flex items-center gap-0.5">
          {row.quantity_not_started > 0 && (
            <Button
              size="icon"
              variant="ghost"
              className="h-5 w-5"
              title="Start production"
              onClick={(e) => {
                e.preventDefault()
                setSelectedOrder(row.order_id)
                setStartDialogOpen(true)
              }}
            >
              <Play className="h-3.5 w-3.5" />
            </Button>
          )}
          {(row.quantity_in_kitting > 0 || row.quantity_in_smt > 0 || row.quantity_in_th > 0) && (
            <Button
              size="icon"
              variant="ghost"
              className="h-5 w-5"
              title="Move to the next stage"
              onClick={(e) => {
                e.preventDefault()
                setSelectedOrder(row.order_id)
                setMoveDialogOpen(true)
              }}
            >
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          )}
          {row.quantity_completed > 0 && (
            <Button
              size="icon"
              variant="ghost"
              className="h-5 w-5"
              title="Ship"
              onClick={(e) => {
                e.preventDefault()
                setSelectedOrder(row.order_id)
                setShipDialogOpen(true)
              }}
            >
              <Truck className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="h-5 w-5"
            title="Open this order's WIP detail"
            onClick={(e) => {
              e.preventDefault()
              setSelectedOrder(row.order_id)
            }}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ]

  // Get max quantity for move operation based on from_stage
  const getMaxMoveQuantity = () => {
    if (!orderDetails) return 0
    const stageInfo = orderDetails.stages.find((s) => s.stage === moveFromStage)
    return stageInfo?.quantity || 0
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Production / WIP Tracking</h1>
          <p className="text-muted-foreground">Monitor work-in-progress across production stages</p>
        </div>
      </div>

      {/* Stage Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {stageOrder.map((stage) => {
          const summary = stageData?.find((s) => s.stage === stage) || {
            stage,
            order_count: 0,
            total_units: 0,
            orders: [],
          }
          return (
            <StageCard
              key={stage}
              summary={summary}
              onClick={() => setSelectedStage(selectedStage === stage ? null : stage)}
            />
          )
        })}
      </div>

      <Tabs defaultValue="wip" className="space-y-4">
        <TabsList>
          <TabsTrigger value="wip">WIP Overview</TabsTrigger>
          <TabsTrigger value="details" disabled={!selectedOrder}>
            Order Details {selectedOrder && orderDetails && `(${orderDetails.order.order_number})`}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="wip">
          {selectedStage && (
            <div className="mb-4 flex items-center gap-2">
              <Badge variant="secondary">
                Filtering by: {stageConfig[selectedStage].label}
              </Badge>
              <Button variant="ghost" size="sm" onClick={() => setSelectedStage(null)}>
                Clear filter
              </Button>
            </div>
          )}

          <VirtualGrid
            data={filteredWip}
            columns={columns}
            isLoading={wipLoading}
            searchPlaceholder="Search by order, customer, product, or status..."
            searchFn={(row, q) =>
              row.order_number.toLowerCase().includes(q) ||
              row.customer_name.toLowerCase().includes(q) ||
              row.product_name.toLowerCase().includes(q) ||
              row.status.toLowerCase().includes(q)
            }
            spreadsheet
            storageKey="production-wip"
            getRowId={(row) => row.order_id}
            onRowActivate={(row) => setSelectedOrder(row.order_id)}
          />
        </TabsContent>

        <TabsContent value="details">
          {orderDetails && (
            <div className="space-y-6">
              {/* Order Info */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Order: {orderDetails.order.order_number}</span>
                    <Badge>{orderDetails.order.status}</Badge>
                  </CardTitle>
                  <CardDescription>
                    {orderDetails.order.product?.name} - Quantity: {orderDetails.order.quantity}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {/* Stage Progress */}
                  <div className="flex items-center justify-between mb-6">
                    {orderDetails.stages.map((stage, idx) => {
                      const config = stageConfig[stage.stage as ProductionStage]
                      const Icon = config.icon
                      return (
                        <div key={stage.stage} className="flex items-center">
                          <div className="text-center">
                            <div
                              className={`w-12 h-12 rounded-full flex items-center justify-center ${
                                stage.quantity > 0 ? config.color : "bg-gray-50 text-gray-400"
                              }`}
                            >
                              <Icon className="h-5 w-5" />
                            </div>
                            <div className="mt-2 text-sm font-medium">{config.label}</div>
                            <div className="text-lg font-bold">{stage.quantity}</div>
                            {stage.started_at && (
                              <div className="text-xs text-muted-foreground">
                                {new Date(stage.started_at).toLocaleDateString()}
                              </div>
                            )}
                          </div>
                          {idx < orderDetails.stages.length - 1 && (
                            <ArrowRight className="h-4 w-4 mx-4 text-muted-foreground" />
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    {(orderDetails.stages.find((s) => s.stage === "NOT_STARTED")?.quantity ?? 0) > 0 && (
                      <Button onClick={() => setStartDialogOpen(true)}>
                        <Play className="h-4 w-4 mr-2" />
                        Start Production
                      </Button>
                    )}
                    <Button variant="outline" onClick={() => setMoveDialogOpen(true)}>
                      <ArrowRight className="h-4 w-4 mr-2" />
                      Move Units
                    </Button>
                    {(orderDetails.stages.find((s) => s.stage === "COMPLETED")?.quantity ?? 0) > 0 && (
                      <Button variant="outline" onClick={() => setShipDialogOpen(true)}>
                        <Truck className="h-4 w-4 mr-2" />
                        Ship Units
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Production Logs */}
              <Card>
                <CardHeader>
                  <CardTitle>Production History</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {orderDetails.logs.length === 0 ? (
                      <p className="text-muted-foreground text-sm">No production history yet.</p>
                    ) : (
                      orderDetails.logs.map((log) => (
                        <div key={log.id} className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
                          <div className="flex items-center gap-2">
                            {log.from_stage && (
                              <>
                                <Badge variant="outline">{stageConfig[log.from_stage as ProductionStage]?.label || log.from_stage}</Badge>
                                <ArrowRight className="h-4 w-4" />
                              </>
                            )}
                            <Badge>{stageConfig[log.to_stage as ProductionStage]?.label || log.to_stage}</Badge>
                          </div>
                          <div className="font-medium">{log.quantity} units</div>
                          <div className="text-sm text-muted-foreground flex-1">
                            {log.notes && <span className="italic">"{log.notes}"</span>}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {new Date(log.created_at).toLocaleString()}
                          </div>
                          {log.created_by && (
                            <div className="text-sm text-muted-foreground">by {log.created_by}</div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Start Production Dialog */}
      <Dialog open={startDialogOpen} onOpenChange={setStartDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start Production</DialogTitle>
            <DialogDescription>
              Move units from "Not Started" to "Kitting" to begin production.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="start-quantity">Quantity (leave empty to start all)</Label>
              <Input
                id="start-quantity"
                type="number"
                min="1"
                placeholder="All available"
                value={startQuantity}
                onChange={(e) => setStartQuantity(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStartDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                startProduction.mutate({
                  quantity: startQuantity ? parseInt(startQuantity) : undefined,
                  created_by: "user",
                })
              }
              disabled={startProduction.isLoading}
            >
              {startProduction.isLoading ? "Starting..." : "Start Production"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move Units Dialog */}
      <Dialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move Units Between Stages</DialogTitle>
            <DialogDescription>
              Transfer units from one production stage to another.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>From Stage</Label>
                <Select value={moveFromStage} onValueChange={(v) => setMoveFromStage(v as ProductionStage)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["KITTING", "SMT", "TH"] as ProductionStage[]).map((stage) => (
                      <SelectItem key={stage} value={stage}>
                        {stageConfig[stage].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>To Stage</Label>
                <Select value={moveToStage} onValueChange={(v) => setMoveToStage(v as ProductionStage)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["SMT", "TH", "COMPLETED"] as ProductionStage[]).map((stage) => (
                      <SelectItem key={stage} value={stage}>
                        {stageConfig[stage].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="move-quantity">
                Quantity (max: {getMaxMoveQuantity()})
              </Label>
              <Input
                id="move-quantity"
                type="number"
                min="1"
                max={getMaxMoveQuantity()}
                value={moveQuantity}
                onChange={(e) => setMoveQuantity(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="move-notes">Notes (optional)</Label>
              <Input
                id="move-notes"
                placeholder="e.g., Batch completed QC"
                value={moveNotes}
                onChange={(e) => setMoveNotes(e.target.value)}
              />
            </div>
            {(moveFromStage === "SMT" || moveFromStage === "TH") && (
              <div className="flex items-start gap-2 rounded-md border p-3">
                <Checkbox
                  id="move-auto-consume"
                  checked={moveAutoConsume}
                  onCheckedChange={(c) => setMoveAutoConsume(c === true)}
                  className="mt-0.5"
                />
                <div className="space-y-0.5">
                  <Label htmlFor="move-auto-consume" className="cursor-pointer">
                    Auto-consume {moveFromStage} materials
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Draw down inventory for the {moveFromStage} materials on this
                    order as the units leave {moveFromStage}. Uncheck to move
                    without consuming.
                  </p>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                moveUnits.mutate({
                  from_stage: moveFromStage,
                  to_stage: moveToStage,
                  quantity: parseInt(moveQuantity),
                  notes: moveNotes || undefined,
                  created_by: "user",
                  auto_consume: moveAutoConsume,
                })
              }
              disabled={moveUnits.isLoading || !moveQuantity || parseInt(moveQuantity) < 1}
            >
              {moveUnits.isLoading ? "Moving..." : "Move Units"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ship Units Dialog */}
      <Dialog open={shipDialogOpen} onOpenChange={setShipDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ship Units</DialogTitle>
            <DialogDescription>
              Mark completed units as shipped.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="ship-quantity">Quantity to Ship</Label>
              <Input
                id="ship-quantity"
                type="number"
                min="1"
                value={shipQuantity}
                onChange={(e) => setShipQuantity(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShipDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                shipUnits.mutate({
                  quantity: parseInt(shipQuantity),
                  created_by: "user",
                })
              }
              disabled={shipUnits.isLoading || !shipQuantity || parseInt(shipQuantity) < 1}
            >
              {shipUnits.isLoading ? "Shipping..." : "Ship Units"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
