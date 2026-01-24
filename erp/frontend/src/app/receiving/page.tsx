"use client"

import { useApi, useMutation } from "@/hooks/use-api"
import { api, type ReceivingInspection, type InspectionStatus } from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Package,
  Eye,
  Play,
  Pause,
} from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

// Status config
const statusConfig: Record<InspectionStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode }> = {
  PENDING: { label: "Pending", variant: "secondary", icon: <Clock className="h-3 w-3" /> },
  IN_PROGRESS: { label: "In Progress", variant: "outline", icon: <Play className="h-3 w-3" /> },
  APPROVED: { label: "Approved", variant: "default", icon: <CheckCircle className="h-3 w-3" /> },
  REJECTED: { label: "Rejected", variant: "destructive", icon: <XCircle className="h-3 w-3" /> },
  ON_HOLD: { label: "On Hold", variant: "outline", icon: <Pause className="h-3 w-3" /> },
  RELEASED: { label: "Released", variant: "default", icon: <Package className="h-3 w-3" /> },
}

// Inspection Action Dialog
function InspectionActionDialog({
  inspection,
  onSuccess,
  trigger,
}: {
  inspection: ReceivingInspection
  onSuccess: () => void
  trigger: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [notes, setNotes] = useState("")
  const [actor, setActor] = useState("")

  const validateMutation = useMutation(
    () => api.post(`/receiving-inspections/${inspection.id}/validate`, { inspector: actor }),
    {
      onSuccess: () => {
        toast.success("Validation performed")
        setOpen(false)
        onSuccess()
      },
      onError: (error) => toast.error(error.message),
    }
  )

  const approveMutation = useMutation(
    () => api.post(`/receiving-inspections/${inspection.id}/approve`, { disposition_by: actor, disposition_notes: notes }),
    {
      onSuccess: () => {
        toast.success("Inspection approved")
        setOpen(false)
        onSuccess()
      },
      onError: (error) => toast.error(error.message),
    }
  )

  const rejectMutation = useMutation(
    () => api.post(`/receiving-inspections/${inspection.id}/reject`, { disposition_by: actor, disposition_notes: notes }),
    {
      onSuccess: () => {
        toast.success("Inspection rejected")
        setOpen(false)
        onSuccess()
      },
      onError: (error) => toast.error(error.message),
    }
  )

  const holdMutation = useMutation(
    () => api.post(`/receiving-inspections/${inspection.id}/hold`, { disposition_by: actor, disposition_notes: notes }),
    {
      onSuccess: () => {
        toast.success("Item placed on hold")
        setOpen(false)
        onSuccess()
      },
      onError: (error) => toast.error(error.message),
    }
  )

  const releaseMutation = useMutation(
    () => api.post(`/receiving-inspections/${inspection.id}/release`, { actor }),
    {
      onSuccess: () => {
        toast.success("Released to inventory")
        setOpen(false)
        onSuccess()
      },
      onError: (error) => toast.error(error.message),
    }
  )

  const canValidate = inspection.status === "PENDING"
  const canDisposition = inspection.status === "IN_PROGRESS"
  const canRelease = inspection.status === "APPROVED"

  const isLoading = validateMutation.isLoading || approveMutation.isLoading || rejectMutation.isLoading || holdMutation.isLoading || releaseMutation.isLoading

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Inspection Details
            <Badge variant={statusConfig[inspection.status].variant}>
              {statusConfig[inspection.status].icon}
              <span className="ml-1">{statusConfig[inspection.status].label}</span>
            </Badge>
          </DialogTitle>
          <DialogDescription>
            {inspection.material?.internal_part_number} - Qty: {inspection.quantity_received}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Inspection Results */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Received IPN:</span>
              <p className="font-medium">{inspection.received_ipn || "-"}</p>
              {inspection.ipn_match !== null && (
                <Badge variant={inspection.ipn_match ? "outline" : "destructive"} className="mt-1">
                  {inspection.ipn_match ? "Match" : "Mismatch"}
                </Badge>
              )}
            </div>
            <div>
              <span className="text-muted-foreground">Received MPN:</span>
              <p className="font-medium">{inspection.received_mpn || "-"}</p>
              {inspection.mpn_match !== null && (
                <Badge variant={inspection.mpn_match ? "outline" : "destructive"} className="mt-1">
                  {inspection.mpn_match ? "On AML" : "Not on AML"}
                </Badge>
              )}
            </div>
          </div>

          {inspection.disposition_notes && (
            <div className="text-sm">
              <span className="text-muted-foreground">Disposition Notes:</span>
              <p>{inspection.disposition_notes}</p>
            </div>
          )}

          {/* Action Inputs */}
          {(canValidate || canDisposition || canRelease) && (
            <>
              <div className="grid gap-2">
                <Label htmlFor="actor">Your Name *</Label>
                <Input
                  id="actor"
                  value={actor}
                  onChange={(e) => setActor(e.target.value)}
                  placeholder="Enter your name"
                  required
                />
              </div>

              {canDisposition && (
                <div className="grid gap-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Disposition notes..."
                    rows={2}
                  />
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {canValidate && (
            <Button
              onClick={() => validateMutation.mutate(undefined)}
              disabled={isLoading || !actor}
            >
              Start Validation
            </Button>
          )}
          {canDisposition && (
            <>
              <Button
                variant="default"
                onClick={() => approveMutation.mutate(undefined)}
                disabled={isLoading || !actor}
              >
                <CheckCircle className="h-4 w-4 mr-1" />
                Approve
              </Button>
              <Button
                variant="outline"
                onClick={() => holdMutation.mutate(undefined)}
                disabled={isLoading || !actor}
              >
                <Pause className="h-4 w-4 mr-1" />
                Hold
              </Button>
              <Button
                variant="destructive"
                onClick={() => rejectMutation.mutate(undefined)}
                disabled={isLoading || !actor}
              >
                <XCircle className="h-4 w-4 mr-1" />
                Reject
              </Button>
            </>
          )}
          {canRelease && (
            <Button
              onClick={() => releaseMutation.mutate(undefined)}
              disabled={isLoading || !actor}
            >
              <Package className="h-4 w-4 mr-1" />
              Release to Inventory
            </Button>
          )}
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function ReceivingPage() {
  const [statusFilter, setStatusFilter] = useState<string>("all")

  const endpoint = statusFilter === "all"
    ? "/receiving-inspections"
    : statusFilter === "PENDING"
      ? "/receiving-inspections/pending"
      : `/receiving-inspections/status/${statusFilter}`

  const { data: inspections, isLoading, refetch } = useApi<ReceivingInspection[]>(endpoint)

  // Calculate stats
  const pendingCount = inspections?.filter((i) => i.status === "PENDING").length || 0
  const inProgressCount = inspections?.filter((i) => i.status === "IN_PROGRESS").length || 0
  const approvedCount = inspections?.filter((i) => i.status === "APPROVED").length || 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Receiving Inspection</h1>
        <p className="text-muted-foreground">
          Validate received items before moving to inventory
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingCount}</div>
            <p className="text-xs text-muted-foreground">awaiting inspection</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Progress</CardTitle>
            <Play className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{inProgressCount}</div>
            <p className="text-xs text-muted-foreground">being inspected</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Approved</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{approvedCount}</div>
            <p className="text-xs text-muted-foreground">ready to release</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{inspections?.length || 0}</div>
            <p className="text-xs text-muted-foreground">inspections</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-4">
        <Label className="text-sm font-medium">Status:</Label>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
            <SelectItem value="APPROVED">Approved</SelectItem>
            <SelectItem value="REJECTED">Rejected</SelectItem>
            <SelectItem value="ON_HOLD">On Hold</SelectItem>
            <SelectItem value="RELEASED">Released</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Inspections Table */}
      <Card>
        <CardHeader>
          <CardTitle>Inspections</CardTitle>
          <CardDescription>Items received pending validation</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : inspections && inspections.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Material</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>Received IPN</TableHead>
                  <TableHead>Received MPN</TableHead>
                  <TableHead>IPN Match</TableHead>
                  <TableHead>AML Match</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inspections.map((inspection) => (
                  <TableRow key={inspection.id}>
                    <TableCell>
                      <span className="font-medium">
                        {inspection.material?.internal_part_number}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {inspection.quantity_received}
                    </TableCell>
                    <TableCell>{inspection.received_ipn || "-"}</TableCell>
                    <TableCell>{inspection.received_mpn || "-"}</TableCell>
                    <TableCell>
                      {inspection.ipn_match === null ? (
                        <span className="text-muted-foreground">-</span>
                      ) : inspection.ipn_match ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500" />
                      )}
                    </TableCell>
                    <TableCell>
                      {inspection.mpn_match === null ? (
                        <span className="text-muted-foreground">-</span>
                      ) : inspection.mpn_match ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-yellow-500" />
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusConfig[inspection.status].variant}>
                        {statusConfig[inspection.status].label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <InspectionActionDialog
                        inspection={inspection}
                        onSuccess={refetch}
                        trigger={
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <Eye className="h-4 w-4" />
                          </Button>
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-center text-muted-foreground py-8">
              No inspections found.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
