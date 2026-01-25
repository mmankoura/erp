"use client"

import { useApi, useMutation } from "@/hooks/use-api"
import {
  api,
  type InventoryStock,
  type InventoryTransaction,
  type InventoryLot,
  type Material,
} from "@/lib/api"
import { DataTable, type Column } from "@/components/data-table"
import { InventoryImportWizard } from "@/components/inventory-import-wizard"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Plus,
  ArrowUpDown,
  History,
  AlertTriangle,
  Package,
  Upload,
  Trash2,
} from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

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

// Adjust Stock Dialog
function AdjustStockDialog({
  stock,
  onSuccess,
  trigger,
}: {
  stock: InventoryStock
  onSuccess: () => void
  trigger: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [adjustmentType, setAdjustmentType] = useState<"set" | "add" | "subtract">("set")
  const [quantity, setQuantity] = useState("")
  const [reason, setReason] = useState("")

  const adjustMutation = useMutation(
    (data: { quantity: number; reason?: string }) =>
      api.post(`/inventory/${stock.material_id}/set-stock`, data),
    {
      onSuccess: () => {
        toast.success("Stock adjusted successfully")
        setOpen(false)
        setQuantity("")
        setReason("")
        onSuccess()
      },
      onError: (error) => {
        toast.error(error.message || "Failed to adjust stock")
      },
    }
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const qty = parseFloat(quantity)
    if (isNaN(qty)) return

    let finalQuantity: number
    switch (adjustmentType) {
      case "add":
        finalQuantity = stock.quantity_on_hand + qty
        break
      case "subtract":
        finalQuantity = stock.quantity_on_hand - qty
        break
      default:
        finalQuantity = qty
    }

    adjustMutation.mutate({
      quantity: finalQuantity,
      reason: reason || undefined,
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Adjust Stock</DialogTitle>
            <DialogDescription>
              Adjust inventory for {stock.material?.internal_part_number}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="text-sm">
              <span className="text-muted-foreground">Current Stock: </span>
              <span className="font-medium">{stock.quantity_on_hand}</span>
            </div>

            <div className="grid gap-2">
              <Label>Adjustment Type</Label>
              <Select
                value={adjustmentType}
                onValueChange={(v) => setAdjustmentType(v as "set" | "add" | "subtract")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="set">Set to specific quantity</SelectItem>
                  <SelectItem value="add">Add to current stock</SelectItem>
                  <SelectItem value="subtract">Subtract from stock</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="quantity">
                {adjustmentType === "set"
                  ? "New Quantity"
                  : adjustmentType === "add"
                    ? "Quantity to Add"
                    : "Quantity to Subtract"}
              </Label>
              <Input
                id="quantity"
                type="number"
                min="0"
                step="0.01"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="0"
                required
              />
              {quantity && adjustmentType !== "set" && (
                <p className="text-sm text-muted-foreground">
                  Result:{" "}
                  {adjustmentType === "add"
                    ? stock.quantity_on_hand + parseFloat(quantity || "0")
                    : stock.quantity_on_hand - parseFloat(quantity || "0")}
                </p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="reason">Reason</Label>
              <Textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Cycle count, damage, etc."
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={adjustMutation.isLoading || !quantity}>
              {adjustMutation.isLoading ? "Saving..." : "Adjust Stock"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
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

// Extended type with id for DataTable
type InventoryStockWithId = InventoryStock & { id: string }

// Extended type for lots DataTable
type InventoryLotWithId = InventoryLot & { id: string }

export default function InventoryPage() {
  const { data: inventoryRaw, isLoading, refetch } = useApi<InventoryStock[]>("/inventory")
  const { data: lowStock } = useApi<InventoryStock[]>("/inventory/low-stock?threshold=10")
  const { data: recentTransactions } = useApi<InventoryTransaction[]>(
    "/inventory/transactions/recent?limit=20"
  )
  const { data: lotsRaw, isLoading: lotsLoading, refetch: refetchLots } = useApi<InventoryLot[]>("/inventory/lots")
  const [importWizardOpen, setImportWizardOpen] = useState(false)

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

  // Calculate summary stats
  const totalItems = inventory?.length || 0
  const totalOnHand = inventory?.reduce((sum, item) => sum + item.quantity_on_hand, 0) || 0
  const totalAllocated = inventory?.reduce((sum, item) => sum + item.quantity_allocated, 0) || 0
  const lowStockCount = lowStock?.length || 0

  const lotColumns: Column<InventoryLotWithId>[] = [
    {
      key: "uid",
      header: "UID",
      cell: (lot) => <span className="font-mono font-medium">{lot.uid}</span>,
    },
    {
      key: "customer",
      header: "Customer",
      cell: (lot) => lot.material?.customer?.name || "-",
    },
    {
      key: "ipn",
      header: "IPN",
      cell: (lot) => lot.material?.internal_part_number,
    },
    {
      key: "quantity",
      header: "Quantity",
      className: "text-right",
      cell: (lot) => <span className="font-mono">{lot.quantity.toLocaleString()}</span>,
    },
    {
      key: "package_type",
      header: "Package",
      cell: (lot) => <Badge variant="outline">{lot.package_type}</Badge>,
    },
    {
      key: "po_reference",
      header: "PO Ref",
      cell: (lot) => <span className="text-muted-foreground">{lot.po_reference || "-"}</span>,
    },
    {
      key: "status",
      header: "Status",
      cell: (lot) => (
        <Badge
          variant={
            lot.status === "ACTIVE"
              ? "default"
              : lot.status === "CONSUMED"
                ? "secondary"
                : "destructive"
          }
        >
          {lot.status}
        </Badge>
      ),
    },
    {
      key: "received_date",
      header: "Received",
      cell: (lot) => (
        <span className="text-sm text-muted-foreground">
          {lot.received_date ? new Date(lot.received_date).toLocaleDateString() : "-"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "w-[60px]",
      cell: (lot) => (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive hover:text-destructive"
          onClick={() => {
            if (confirm(`Delete lot ${lot.uid}?`)) {
              deleteLotMutation.mutate(lot.id)
            }
          }}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      ),
    },
  ]

  const columns: Column<InventoryStockWithId>[] = [
    {
      key: "customer",
      header: "Customer",
      cell: (stock) => stock.material?.customer?.name || "-",
    },
    {
      key: "material",
      header: "Material",
      cell: (stock) => (
        <div>
          <span className="font-medium">{stock.material?.internal_part_number}</span>
          {stock.material?.description && (
            <p className="text-xs text-muted-foreground truncate max-w-[200px]">
              {stock.material.description}
            </p>
          )}
        </div>
      ),
    },
    {
      key: "quantity_on_hand",
      header: "On Hand",
      className: "text-right",
      cell: (stock) => (
        <span className="font-mono">{stock.quantity_on_hand.toLocaleString()}</span>
      ),
    },
    {
      key: "quantity_allocated",
      header: "Allocated",
      className: "text-right",
      cell: (stock) => (
        <span className={`font-mono ${stock.quantity_allocated > 0 ? "text-yellow-600" : ""}`}>
          {stock.quantity_allocated.toLocaleString()}
        </span>
      ),
    },
    {
      key: "quantity_available",
      header: "Available",
      className: "text-right",
      cell: (stock) => (
        <span
          className={`font-mono font-medium ${
            stock.quantity_available <= 0
              ? "text-red-600"
              : stock.quantity_available < 10
                ? "text-yellow-600"
                : "text-green-600"
          }`}
        >
          {stock.quantity_available.toLocaleString()}
        </span>
      ),
    },
    {
      key: "quantity_on_order",
      header: "On Order",
      className: "text-right",
      cell: (stock) => (
        <span className={`font-mono ${stock.quantity_on_order > 0 ? "text-blue-600" : ""}`}>
          {stock.quantity_on_order.toLocaleString()}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "w-[120px]",
      cell: (stock) => (
        <div className="flex items-center gap-1">
          <TransactionHistoryDialog
            stock={stock}
            trigger={
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <History className="h-4 w-4" />
              </Button>
            }
          />
          <AdjustStockDialog
            stock={stock}
            onSuccess={refetch}
            trigger={
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <ArrowUpDown className="h-4 w-4" />
              </Button>
            }
          />
        </div>
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
          <ReceiveStockDialog
            onSuccess={refetch}
            trigger={
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Receive Stock
              </Button>
            }
          />
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
          <TabsTrigger value="recent">Recent Activity</TabsTrigger>
          <TabsTrigger value="low-stock">Low Stock</TabsTrigger>
        </TabsList>

        <TabsContent value="stock" className="space-y-4">
          <DataTable
            data={inventory}
            columns={columns}
            isLoading={isLoading}
            searchKey="material_id"
            searchPlaceholder="Search materials..."
            emptyMessage="No inventory found."
          />
        </TabsContent>

        <TabsContent value="lots" className="space-y-4">
          <DataTable
            data={lots}
            columns={lotColumns}
            isLoading={lotsLoading}
            searchKey="uid"
            searchPlaceholder="Search by UID..."
            emptyMessage="No lots found. Import inventory to add lots."
            enableSelection
            onBulkDelete={(ids) => {
              if (confirm(`Delete ${ids.length} selected lots?`)) {
                bulkDeleteLotsMutation.mutate(ids)
              }
            }}
          />
        </TabsContent>

        <TabsContent value="recent" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Transactions</CardTitle>
              <CardDescription>Latest inventory movements</CardDescription>
            </CardHeader>
            <CardContent>
              {recentTransactions && recentTransactions.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Material</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead>By</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentTransactions.map((tx) => {
                      const config = transactionTypeConfig[tx.transaction_type] || {
                        label: tx.transaction_type,
                        color: "",
                      }
                      return (
                        <TableRow key={tx.id}>
                          <TableCell className="text-sm">
                            {new Date(tx.created_at).toLocaleString()}
                          </TableCell>
                          <TableCell>{tx.material?.customer?.name || "-"}</TableCell>
                          <TableCell className="font-medium">
                            {tx.material?.internal_part_number}
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
                          <TableCell className="text-sm">{tx.created_by || "-"}</TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-center text-muted-foreground py-8">No recent transactions</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="low-stock" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                Low Stock Items
              </CardTitle>
              <CardDescription>Materials with available quantity at or below 10</CardDescription>
            </CardHeader>
            <CardContent>
              {lowStock && lowStock.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead>Material</TableHead>
                      <TableHead className="text-right">On Hand</TableHead>
                      <TableHead className="text-right">Allocated</TableHead>
                      <TableHead className="text-right">Available</TableHead>
                      <TableHead className="text-right">On Order</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lowStock.map((stock) => (
                      <TableRow key={stock.material_id}>
                        <TableCell>{stock.material?.customer?.name || "-"}</TableCell>
                        <TableCell>
                          <span className="font-medium">{stock.material?.internal_part_number}</span>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {stock.quantity_on_hand}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {stock.quantity_allocated}
                        </TableCell>
                        <TableCell className="text-right font-mono text-red-600 font-medium">
                          {stock.quantity_available}
                        </TableCell>
                        <TableCell className="text-right font-mono text-blue-600">
                          {stock.quantity_on_order}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-center text-muted-foreground py-8">
                  No low stock items. All materials are above threshold.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
