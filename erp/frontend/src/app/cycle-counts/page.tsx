"use client"

import { useState } from "react"
import { useApi, useMutation } from "@/hooks/use-api"
import {
  api,
  type CycleCount,
  type CycleCountStatus,
  type CycleCountType,
  type Material,
} from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { Plus, ClipboardCheck, Play, CheckCircle, XCircle, Eye } from "lucide-react"
import Link from "next/link"

const statusColors: Record<CycleCountStatus, string> = {
  PLANNED: "bg-blue-100 text-blue-800",
  IN_PROGRESS: "bg-yellow-100 text-yellow-800",
  PENDING_REVIEW: "bg-purple-100 text-purple-800",
  APPROVED: "bg-green-100 text-green-800",
  CANCELLED: "bg-red-100 text-red-800",
}

const typeLabels: Record<CycleCountType, string> = {
  FULL: "Full Inventory",
  PARTIAL: "Partial Count",
  ABC: "ABC Analysis",
  LOCATION: "Location-based",
}

export default function CycleCountsPage() {
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [selectedMaterials, setSelectedMaterials] = useState<string[]>([])

  const { data: cycleCounts, isLoading, refetch } = useApi<CycleCount[]>("/cycle-counts")
  const { data: materials } = useApi<Material[]>("/materials")

  const [newCount, setNewCount] = useState({
    count_type: "PARTIAL" as CycleCountType,
    scheduled_date: new Date().toISOString().split("T")[0],
    notes: "",
  })

  const createMutation = useMutation(
    (data: {
      count_type: CycleCountType
      scheduled_date: string
      material_ids?: string[]
      notes?: string
    }) => api.post<CycleCount>("/cycle-counts", data),
    {
      onSuccess: () => {
        toast.success("Cycle count created")
        setShowCreateDialog(false)
        setNewCount({
          count_type: "PARTIAL",
          scheduled_date: new Date().toISOString().split("T")[0],
          notes: "",
        })
        setSelectedMaterials([])
        refetch()
      },
      onError: (error) => {
        toast.error(error.message || "Failed to create cycle count")
      },
    }
  )

  const startMutation = useMutation(
    (id: string) => api.post<CycleCount>(`/cycle-counts/${id}/start`, {}),
    {
      onSuccess: () => {
        toast.success("Cycle count started")
        refetch()
      },
      onError: (error) => {
        toast.error(error.message || "Failed to start cycle count")
      },
    }
  )

  const cancelMutation = useMutation(
    (id: string) => api.post<CycleCount>(`/cycle-counts/${id}/cancel`, {}),
    {
      onSuccess: () => {
        toast.success("Cycle count cancelled")
        refetch()
      },
      onError: (error) => {
        toast.error(error.message || "Failed to cancel cycle count")
      },
    }
  )

  const handleCreate = () => {
    createMutation.mutate({
      count_type: newCount.count_type,
      scheduled_date: newCount.scheduled_date,
      material_ids: newCount.count_type === "PARTIAL" ? selectedMaterials : undefined,
      notes: newCount.notes || undefined,
    })
  }

  const toggleMaterialSelection = (materialId: string) => {
    setSelectedMaterials((prev) =>
      prev.includes(materialId)
        ? prev.filter((id) => id !== materialId)
        : [...prev, materialId]
    )
  }

  const filteredCounts = cycleCounts?.filter((count) => {
    if (statusFilter === "all") return true
    return count.status === statusFilter
  })

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Cycle Counts</h1>
          <p className="text-muted-foreground">
            Physical inventory counts and reconciliation
          </p>
        </div>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Cycle Count
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Cycle Count</DialogTitle>
              <DialogDescription>
                Schedule a new physical inventory count
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Count Type</Label>
                  <Select
                    value={newCount.count_type}
                    onValueChange={(v) =>
                      setNewCount({ ...newCount, count_type: v as CycleCountType })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FULL">Full Inventory</SelectItem>
                      <SelectItem value="PARTIAL">Partial Count</SelectItem>
                      <SelectItem value="ABC">ABC Analysis</SelectItem>
                      <SelectItem value="LOCATION">Location-based</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Scheduled Date</Label>
                  <Input
                    type="date"
                    value={newCount.scheduled_date}
                    onChange={(e) =>
                      setNewCount({ ...newCount, scheduled_date: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={newCount.notes}
                  onChange={(e) => setNewCount({ ...newCount, notes: e.target.value })}
                  placeholder="Optional notes about this count..."
                  rows={2}
                />
              </div>

              {newCount.count_type === "PARTIAL" && (
                <div className="space-y-2">
                  <Label>Select Materials to Count ({selectedMaterials.length} selected)</Label>
                  <div className="border rounded-md max-h-60 overflow-y-auto p-2">
                    {materials?.map((material) => (
                      <div
                        key={material.id}
                        className="flex items-center space-x-2 py-1"
                      >
                        <Checkbox
                          checked={selectedMaterials.includes(material.id)}
                          onCheckedChange={() => toggleMaterialSelection(material.id)}
                        />
                        <span className="text-sm font-medium">
                          {material.internal_part_number}
                        </span>
                        <span className="text-sm text-muted-foreground truncate">
                          {material.description}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={
                  createMutation.isLoading ||
                  (newCount.count_type === "PARTIAL" && selectedMaterials.length === 0)
                }
              >
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center gap-4">
            <Label>Status:</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="PLANNED">Planned</SelectItem>
                <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                <SelectItem value="PENDING_REVIEW">Pending Review</SelectItem>
                <SelectItem value="APPROVED">Approved</SelectItem>
                <SelectItem value="CANCELLED">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Planned</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {cycleCounts?.filter((c) => c.status === "PLANNED").length || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">In Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {cycleCounts?.filter((c) => c.status === "IN_PROGRESS").length || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pending Review</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              {cycleCounts?.filter((c) => c.status === "PENDING_REVIEW").length || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Approved (This Month)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {cycleCounts?.filter((c) => c.status === "APPROVED").length || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Cycle Counts List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5" />
            Cycle Counts
          </CardTitle>
          <CardDescription>
            {filteredCounts?.length || 0} cycle counts
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredCounts && filteredCounts.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Count #</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Scheduled</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead className="text-right">Counted</TableHead>
                  <TableHead className="text-right">Variance</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCounts.map((count) => (
                  <TableRow key={count.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/cycle-counts/${count.id}`}
                        className="hover:underline text-primary"
                      >
                        {count.count_number}
                      </Link>
                    </TableCell>
                    <TableCell>{typeLabels[count.count_type]}</TableCell>
                    <TableCell>
                      {new Date(count.scheduled_date).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Badge className={statusColors[count.status]}>
                        {count.status.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {count.total_items}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {count.items_counted}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {count.items_with_variance > 0 ? (
                        <span className="text-orange-600">
                          {count.items_with_variance} items
                        </span>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" asChild>
                          <Link href={`/cycle-counts/${count.id}`}>
                            <Eye className="h-4 w-4" />
                          </Link>
                        </Button>
                        {count.status === "PLANNED" && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => startMutation.mutate(count.id)}
                              disabled={startMutation.isLoading}
                              title="Start Count"
                            >
                              <Play className="h-4 w-4 text-green-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => cancelMutation.mutate(count.id)}
                              disabled={cancelMutation.isLoading}
                              title="Cancel"
                            >
                              <XCircle className="h-4 w-4 text-red-600" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <ClipboardCheck className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No cycle counts found</p>
              <p className="text-sm">Create a new cycle count to get started</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
