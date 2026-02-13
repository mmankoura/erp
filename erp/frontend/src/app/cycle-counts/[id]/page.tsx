"use client"

import { useState } from "react"
import { useApi, useMutation } from "@/hooks/use-api"
import {
  api,
  type CycleCount,
  type CycleCountItem,
  type CycleCountItemStatus,
} from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import {
  ArrowLeft,
  Play,
  CheckCircle,
  XCircle,
  Save,
  AlertTriangle,
  RotateCcw,
} from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"

const statusColors: Record<string, string> = {
  PLANNED: "bg-blue-100 text-blue-800",
  IN_PROGRESS: "bg-yellow-100 text-yellow-800",
  PENDING_REVIEW: "bg-purple-100 text-purple-800",
  APPROVED: "bg-green-100 text-green-800",
  CANCELLED: "bg-red-100 text-red-800",
}

const itemStatusColors: Record<CycleCountItemStatus, string> = {
  PENDING: "bg-gray-100 text-gray-800",
  COUNTED: "bg-blue-100 text-blue-800",
  RECOUNTED: "bg-yellow-100 text-yellow-800",
  APPROVED: "bg-green-100 text-green-800",
  ADJUSTED: "bg-purple-100 text-purple-800",
  SKIPPED: "bg-orange-100 text-orange-800",
}

export default function CycleCountDetailPage() {
  const params = useParams()
  const countId = params.id as string

  const [countEntries, setCountEntries] = useState<Record<string, number>>({})
  const [savingItems, setSavingItems] = useState<Set<string>>(new Set())

  const { data: cycleCount, isLoading, refetch } = useApi<CycleCount>(
    `/cycle-counts/${countId}`
  )

  const startMutation = useMutation(
    () => api.post<CycleCount>(`/cycle-counts/${countId}/start`, {}),
    {
      onSuccess: () => {
        toast.success("Cycle count started - system quantities captured")
        refetch()
      },
      onError: (error) => {
        toast.error(error.message || "Failed to start cycle count")
      },
    }
  )

  const recordCountMutation = useMutation(
    (data: { item_id: string; counted_quantity: number }) =>
      api.post<CycleCountItem>(`/cycle-counts/${countId}/count`, data),
    {
      onSuccess: (_, variables) => {
        toast.success("Count recorded")
        setSavingItems((prev) => {
          const next = new Set(prev)
          next.delete(variables.item_id)
          return next
        })
        refetch()
      },
      onError: (error, variables) => {
        toast.error(error.message || "Failed to record count")
        setSavingItems((prev) => {
          const next = new Set(prev)
          next.delete(variables.item_id)
          return next
        })
      },
    }
  )

  const completeMutation = useMutation(
    () => api.post<CycleCount>(`/cycle-counts/${countId}/complete`, {}),
    {
      onSuccess: () => {
        toast.success("Counting complete - ready for review")
        refetch()
      },
      onError: (error) => {
        toast.error(error.message || "Failed to complete count")
      },
    }
  )

  const approveMutation = useMutation(
    () => api.post<CycleCount>(`/cycle-counts/${countId}/approve`, {}),
    {
      onSuccess: () => {
        toast.success("Cycle count approved - adjustments created")
        refetch()
      },
      onError: (error) => {
        toast.error(error.message || "Failed to approve count")
      },
    }
  )

  const cancelMutation = useMutation(
    () => api.post<CycleCount>(`/cycle-counts/${countId}/cancel`, {}),
    {
      onSuccess: () => {
        toast.success("Cycle count cancelled")
        refetch()
      },
      onError: (error) => {
        toast.error(error.message || "Failed to cancel count")
      },
    }
  )

  const handleSaveCount = (itemId: string) => {
    const quantity = countEntries[itemId]
    if (quantity === undefined || quantity < 0) {
      toast.error("Please enter a valid quantity")
      return
    }

    setSavingItems((prev) => new Set(prev).add(itemId))
    recordCountMutation.mutate({ item_id: itemId, counted_quantity: quantity })
  }

  const handleCountChange = (itemId: string, value: string) => {
    const numValue = parseFloat(value)
    if (!isNaN(numValue) && numValue >= 0) {
      setCountEntries((prev) => ({ ...prev, [itemId]: numValue }))
    } else if (value === "") {
      setCountEntries((prev) => {
        const next = { ...prev }
        delete next[itemId]
        return next
      })
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
      </div>
    )
  }

  if (!cycleCount) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold">Cycle count not found</h2>
        <Button asChild className="mt-4">
          <Link href="/cycle-counts">Back to Cycle Counts</Link>
        </Button>
      </div>
    )
  }

  const pendingCount = cycleCount.items?.filter((i) => i.status === "PENDING").length || 0
  const countedCount = cycleCount.items?.filter(
    (i) => i.status === "COUNTED" || i.status === "RECOUNTED"
  ).length || 0
  const varianceItems = cycleCount.items?.filter(
    (i) => i.variance !== null && i.variance !== 0
  ) || []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/cycle-counts">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">
                {cycleCount.count_number}
              </h1>
              <Badge className={statusColors[cycleCount.status]}>
                {cycleCount.status.replace("_", " ")}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              Scheduled: {new Date(cycleCount.scheduled_date).toLocaleDateString()}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {cycleCount.status === "PLANNED" && (
            <Button onClick={() => startMutation.mutate(undefined)} disabled={startMutation.isLoading}>
              <Play className="h-4 w-4 mr-2" />
              Start Count
            </Button>
          )}

          {cycleCount.status === "IN_PROGRESS" && pendingCount === 0 && (
            <Button onClick={() => completeMutation.mutate(undefined)} disabled={completeMutation.isLoading}>
              <CheckCircle className="h-4 w-4 mr-2" />
              Complete Counting
            </Button>
          )}

          {cycleCount.status === "PENDING_REVIEW" && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Approve & Adjust
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Approve Cycle Count?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will create inventory adjustment transactions for all variance
                    items. {varianceItems.length} items have variances totaling{" "}
                    {cycleCount.total_variance_value.toFixed(2)} in value.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => approveMutation.mutate(undefined)}>
                    Approve & Create Adjustments
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {(cycleCount.status === "PLANNED" || cycleCount.status === "IN_PROGRESS") && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline">
                  <XCircle className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancel Cycle Count?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will cancel the cycle count. Any entered counts will be lost.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep Count</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => cancelMutation.mutate(undefined)}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Cancel Count
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Items</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{cycleCount.total_items}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Counted</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {cycleCount.items_counted}
            </div>
            <p className="text-xs text-muted-foreground">
              {pendingCount} pending
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">With Variance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {cycleCount.items_with_variance}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Variance Value</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${
                cycleCount.total_variance_value < 0 ? "text-red-600" : "text-green-600"
              }`}
            >
              ${Math.abs(cycleCount.total_variance_value).toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground">
              {cycleCount.total_variance_value < 0 ? "Shortage" : "Overage"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Count Items */}
      <Card>
        <CardHeader>
          <CardTitle>Count Items</CardTitle>
          <CardDescription>
            {cycleCount.status === "IN_PROGRESS"
              ? "Enter physical counts for each item"
              : cycleCount.status === "PENDING_REVIEW"
              ? "Review variances before approval"
              : "Count details"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {cycleCount.items && cycleCount.items.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Material</TableHead>
                  <TableHead className="text-right">System Qty</TableHead>
                  <TableHead className="text-right">
                    {cycleCount.status === "IN_PROGRESS" ? "Enter Count" : "Counted Qty"}
                  </TableHead>
                  <TableHead className="text-right">Variance</TableHead>
                  <TableHead className="text-right">Variance %</TableHead>
                  <TableHead>Status</TableHead>
                  {cycleCount.status === "IN_PROGRESS" && <TableHead>Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {cycleCount.items
                  .sort((a, b) => {
                    // Sort: pending first, then by material
                    if (a.status === "PENDING" && b.status !== "PENDING") return -1
                    if (a.status !== "PENDING" && b.status === "PENDING") return 1
                    return (a.material?.internal_part_number || "").localeCompare(
                      b.material?.internal_part_number || ""
                    )
                  })
                  .map((item) => {
                    const hasVariance = item.variance !== null && item.variance !== 0
                    const currentValue = countEntries[item.id]

                    return (
                      <TableRow
                        key={item.id}
                        className={hasVariance ? "bg-orange-50" : undefined}
                      >
                        <TableCell>
                          <div>
                            <p className="font-medium">
                              {item.material?.internal_part_number}
                            </p>
                            <p className="text-sm text-muted-foreground truncate max-w-[200px]">
                              {item.material?.description || "-"}
                            </p>
                            {item.lot && (
                              <p className="text-xs text-blue-600">
                                Lot: {item.lot.uid}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {Number(item.system_quantity).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          {cycleCount.status === "IN_PROGRESS" &&
                          item.status === "PENDING" ? (
                            <Input
                              type="number"
                              min={0}
                              step="any"
                              className="w-24 text-right"
                              value={currentValue ?? ""}
                              onChange={(e) =>
                                handleCountChange(item.id, e.target.value)
                              }
                              placeholder="0"
                            />
                          ) : (
                            <span className="font-mono">
                              {item.counted_quantity !== null
                                ? Number(item.counted_quantity).toLocaleString()
                                : "-"}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {item.variance !== null ? (
                            <span
                              className={
                                item.variance > 0
                                  ? "text-green-600"
                                  : item.variance < 0
                                  ? "text-red-600"
                                  : ""
                              }
                            >
                              {item.variance > 0 ? "+" : ""}
                              {Number(item.variance).toLocaleString()}
                            </span>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {item.variance_percent !== null ? (
                            <span
                              className={
                                Math.abs(item.variance_percent) > 5
                                  ? "text-orange-600 font-bold"
                                  : ""
                              }
                            >
                              {Number(item.variance_percent).toFixed(1)}%
                            </span>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge className={itemStatusColors[item.status]}>
                            {item.status}
                          </Badge>
                          {item.recount_number > 0 && (
                            <Badge variant="outline" className="ml-1">
                              <RotateCcw className="h-3 w-3 mr-1" />
                              {item.recount_number}
                            </Badge>
                          )}
                        </TableCell>
                        {cycleCount.status === "IN_PROGRESS" && (
                          <TableCell>
                            {item.status === "PENDING" ? (
                              <Button
                                size="sm"
                                onClick={() => handleSaveCount(item.id)}
                                disabled={
                                  savingItems.has(item.id) ||
                                  currentValue === undefined
                                }
                              >
                                <Save className="h-4 w-4" />
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setCountEntries((prev) => ({
                                    ...prev,
                                    [item.id]: item.counted_quantity ?? 0,
                                  }))
                                }}
                                title="Recount"
                              >
                                <RotateCcw className="h-4 w-4" />
                              </Button>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    )
                  })}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No items in this cycle count
            </div>
          )}
        </CardContent>
      </Card>

      {/* Variance Summary (for review) */}
      {cycleCount.status === "PENDING_REVIEW" && varianceItems.length > 0 && (
        <Card className="border-orange-200 bg-orange-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-orange-800">
              <AlertTriangle className="h-5 w-5" />
              Variance Summary
            </CardTitle>
            <CardDescription className="text-orange-700">
              Review these items before approval
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <h4 className="font-medium text-sm mb-2">Shortages (Negative)</h4>
                <ul className="space-y-1 text-sm">
                  {varianceItems
                    .filter((i) => (i.variance ?? 0) < 0)
                    .map((item) => (
                      <li key={item.id} className="flex justify-between">
                        <span>{item.material?.internal_part_number}</span>
                        <span className="text-red-600 font-mono">
                          {item.variance}
                        </span>
                      </li>
                    ))}
                  {varianceItems.filter((i) => (i.variance ?? 0) < 0).length === 0 && (
                    <li className="text-muted-foreground">None</li>
                  )}
                </ul>
              </div>
              <div>
                <h4 className="font-medium text-sm mb-2">Overages (Positive)</h4>
                <ul className="space-y-1 text-sm">
                  {varianceItems
                    .filter((i) => (i.variance ?? 0) > 0)
                    .map((item) => (
                      <li key={item.id} className="flex justify-between">
                        <span>{item.material?.internal_part_number}</span>
                        <span className="text-green-600 font-mono">
                          +{item.variance}
                        </span>
                      </li>
                    ))}
                  {varianceItems.filter((i) => (i.variance ?? 0) > 0).length === 0 && (
                    <li className="text-muted-foreground">None</li>
                  )}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Notes */}
      {cycleCount.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{cycleCount.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
