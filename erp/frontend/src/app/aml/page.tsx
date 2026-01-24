"use client"

import { useApi, useMutation } from "@/hooks/use-api"
import { api, type ApprovedManufacturer, type AmlStatus, type Material } from "@/lib/api"
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
  Plus,
  Eye,
  Trash2,
  Factory,
  Package,
} from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

// Status config
const statusConfig: Record<AmlStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode }> = {
  PENDING: { label: "Pending", variant: "secondary", icon: <Clock className="h-3 w-3" /> },
  APPROVED: { label: "Approved", variant: "default", icon: <CheckCircle className="h-3 w-3" /> },
  SUSPENDED: { label: "Suspended", variant: "destructive", icon: <AlertTriangle className="h-3 w-3" /> },
  OBSOLETE: { label: "Obsolete", variant: "outline", icon: <XCircle className="h-3 w-3" /> },
}

// Create/Edit AML Dialog
function AmlDialog({
  aml,
  onSuccess,
  trigger,
}: {
  aml?: ApprovedManufacturer
  onSuccess: () => void
  trigger: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [formData, setFormData] = useState({
    material_id: aml?.material_id || "",
    manufacturer: aml?.manufacturer || "",
    manufacturer_part_number: aml?.manufacturer_pn || "",
    notes: aml?.notes || "",
    created_by: "",
  })

  const { data: materials } = useApi<Material[]>("/materials")

  const createMutation = useMutation(
    (data: typeof formData) => api.post("/aml", data),
    {
      onSuccess: () => {
        toast.success("AML entry created")
        setOpen(false)
        onSuccess()
      },
      onError: (error) => toast.error(error.message),
    }
  )

  const updateMutation = useMutation(
    (data: Partial<typeof formData>) => api.patch(`/aml/${aml?.id}`, data),
    {
      onSuccess: () => {
        toast.success("AML entry updated")
        setOpen(false)
        onSuccess()
      },
      onError: (error) => toast.error(error.message),
    }
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (aml) {
      updateMutation.mutate({
        manufacturer: formData.manufacturer,
        manufacturer_part_number: formData.manufacturer_part_number,
        notes: formData.notes,
      })
    } else {
      createMutation.mutate(formData)
    }
  }

  const isLoading = createMutation.isLoading || updateMutation.isLoading

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{aml ? "Edit AML Entry" : "Add AML Entry"}</DialogTitle>
            <DialogDescription>
              {aml ? "Update the approved manufacturer/part number." : "Add a new manufacturer/part number to the approved list."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {!aml && (
              <div className="grid gap-2">
                <Label htmlFor="material_id">Material *</Label>
                <Select
                  value={formData.material_id}
                  onValueChange={(v) => setFormData({ ...formData, material_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select material" />
                  </SelectTrigger>
                  <SelectContent>
                    {materials?.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.internal_part_number} - {m.description || "No description"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="manufacturer">Manufacturer *</Label>
              <Input
                id="manufacturer"
                value={formData.manufacturer}
                onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
                placeholder="e.g., Texas Instruments"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="manufacturer_part_number">Manufacturer Part Number *</Label>
              <Input
                id="manufacturer_part_number"
                value={formData.manufacturer_part_number}
                onChange={(e) => setFormData({ ...formData, manufacturer_part_number: e.target.value })}
                placeholder="e.g., TPS61200DRCT"
                required
              />
            </div>
            {!aml && (
              <div className="grid gap-2">
                <Label htmlFor="created_by">Created By</Label>
                <Input
                  id="created_by"
                  value={formData.created_by}
                  onChange={(e) => setFormData({ ...formData, created_by: e.target.value })}
                  placeholder="Your name"
                />
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Optional notes..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {aml ? "Save Changes" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// AML Detail/Action Dialog
function AmlDetailDialog({
  aml,
  onSuccess,
  trigger,
}: {
  aml: ApprovedManufacturer
  onSuccess: () => void
  trigger: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [actor, setActor] = useState("")
  const [reason, setReason] = useState("")

  const approveMutation = useMutation(
    () => api.post(`/aml/${aml.id}/approve`, { approved_by: actor }),
    {
      onSuccess: () => {
        toast.success("AML entry approved")
        setOpen(false)
        onSuccess()
      },
      onError: (error) => toast.error(error.message),
    }
  )

  const suspendMutation = useMutation(
    () => api.post(`/aml/${aml.id}/suspend`, { suspended_by: actor, reason }),
    {
      onSuccess: () => {
        toast.success("AML entry suspended")
        setOpen(false)
        onSuccess()
      },
      onError: (error) => toast.error(error.message),
    }
  )

  const reinstateMutation = useMutation(
    () => api.post(`/aml/${aml.id}/reinstate`, { reinstated_by: actor }),
    {
      onSuccess: () => {
        toast.success("AML entry reinstated")
        setOpen(false)
        onSuccess()
      },
      onError: (error) => toast.error(error.message),
    }
  )

  const obsoleteMutation = useMutation(
    () => api.post(`/aml/${aml.id}/obsolete`, { obsoleted_by: actor, reason }),
    {
      onSuccess: () => {
        toast.success("AML entry marked obsolete")
        setOpen(false)
        onSuccess()
      },
      onError: (error) => toast.error(error.message),
    }
  )

  const deleteMutation = useMutation(
    () => api.delete(`/aml/${aml.id}`),
    {
      onSuccess: () => {
        toast.success("AML entry deleted")
        setOpen(false)
        onSuccess()
      },
      onError: (error) => toast.error(error.message),
    }
  )

  const canApprove = aml.status === "PENDING"
  const canSuspend = aml.status === "APPROVED"
  const canReinstate = aml.status === "SUSPENDED"
  const canObsolete = aml.status === "APPROVED" || aml.status === "SUSPENDED"

  const isLoading = approveMutation.isLoading || suspendMutation.isLoading || reinstateMutation.isLoading || obsoleteMutation.isLoading || deleteMutation.isLoading

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            AML Details
            <Badge variant={statusConfig[aml.status].variant}>
              {statusConfig[aml.status].icon}
              <span className="ml-1">{statusConfig[aml.status].label}</span>
            </Badge>
          </DialogTitle>
          <DialogDescription>
            {aml.manufacturer} - {aml.manufacturer_pn}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Material IPN:</span>
              <p className="font-medium">{aml.material?.internal_part_number || "-"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Manufacturer:</span>
              <p className="font-medium">{aml.manufacturer}</p>
            </div>
            <div>
              <span className="text-muted-foreground">MPN:</span>
              <p className="font-medium">{aml.manufacturer_pn}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Approved By:</span>
              <p className="font-medium">{aml.approved_by || "-"}</p>
            </div>
          </div>

          {aml.notes && (
            <div className="text-sm">
              <span className="text-muted-foreground">Notes:</span>
              <p>{aml.notes}</p>
            </div>
          )}

          {/* Action Inputs */}
          {(canApprove || canSuspend || canReinstate || canObsolete) && (
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

              {(canSuspend || canObsolete) && (
                <div className="grid gap-2">
                  <Label htmlFor="reason">Reason</Label>
                  <Textarea
                    id="reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Optional reason..."
                    rows={2}
                  />
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {canApprove && (
            <Button
              variant="default"
              onClick={() => approveMutation.mutate(undefined)}
              disabled={isLoading || !actor}
            >
              <CheckCircle className="h-4 w-4 mr-1" />
              Approve
            </Button>
          )}
          {canSuspend && (
            <Button
              variant="outline"
              onClick={() => suspendMutation.mutate(undefined)}
              disabled={isLoading || !actor}
            >
              <AlertTriangle className="h-4 w-4 mr-1" />
              Suspend
            </Button>
          )}
          {canReinstate && (
            <Button
              variant="default"
              onClick={() => reinstateMutation.mutate(undefined)}
              disabled={isLoading || !actor}
            >
              <CheckCircle className="h-4 w-4 mr-1" />
              Reinstate
            </Button>
          )}
          {canObsolete && (
            <Button
              variant="outline"
              onClick={() => obsoleteMutation.mutate(undefined)}
              disabled={isLoading || !actor}
            >
              <XCircle className="h-4 w-4 mr-1" />
              Mark Obsolete
            </Button>
          )}
          <Button
            variant="destructive"
            onClick={() => deleteMutation.mutate(undefined)}
            disabled={isLoading}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Delete
          </Button>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function AMLPage() {
  const [statusFilter, setStatusFilter] = useState<string>("all")

  const { data: amlEntries, isLoading, refetch } = useApi<ApprovedManufacturer[]>("/aml")

  // Filter entries
  const filteredEntries = amlEntries?.filter((entry) => {
    if (statusFilter !== "all" && entry.status !== statusFilter) return false
    return true
  })

  // Calculate stats
  const pendingCount = amlEntries?.filter((e) => e.status === "PENDING").length || 0
  const approvedCount = amlEntries?.filter((e) => e.status === "APPROVED").length || 0
  const suspendedCount = amlEntries?.filter((e) => e.status === "SUSPENDED").length || 0
  const totalCount = amlEntries?.length || 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Approved Manufacturer List</h1>
          <p className="text-muted-foreground">
            Manage approved manufacturer/part number combinations
          </p>
        </div>
        <AmlDialog
          onSuccess={refetch}
          trigger={
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Entry
            </Button>
          }
        />
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Entries</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCount}</div>
            <p className="text-xs text-muted-foreground">manufacturer/part combinations</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{pendingCount}</div>
            <p className="text-xs text-muted-foreground">awaiting approval</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Approved</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{approvedCount}</div>
            <p className="text-xs text-muted-foreground">active approvals</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Suspended</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{suspendedCount}</div>
            <p className="text-xs text-muted-foreground">suspended entries</p>
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
            <SelectItem value="APPROVED">Approved</SelectItem>
            <SelectItem value="SUSPENDED">Suspended</SelectItem>
            <SelectItem value="OBSOLETE">Obsolete</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* AML Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Factory className="h-5 w-5" />
            AML Entries
          </CardTitle>
          <CardDescription>Approved manufacturer/part number combinations for materials</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredEntries && filteredEntries.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Material IPN</TableHead>
                  <TableHead>Manufacturer</TableHead>
                  <TableHead>MPN</TableHead>
                  <TableHead>Approved By</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEntries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>
                      <span className="font-medium">
                        {entry.material?.internal_part_number || "-"}
                      </span>
                    </TableCell>
                    <TableCell>{entry.manufacturer}</TableCell>
                    <TableCell className="font-mono">{entry.manufacturer_pn}</TableCell>
                    <TableCell>{entry.approved_by || "-"}</TableCell>
                    <TableCell>
                      <Badge variant={statusConfig[entry.status].variant}>
                        {statusConfig[entry.status].icon}
                        <span className="ml-1">{statusConfig[entry.status].label}</span>
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <AmlDetailDialog
                          aml={entry}
                          onSuccess={refetch}
                          trigger={
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <Eye className="h-4 w-4" />
                            </Button>
                          }
                        />
                        <AmlDialog
                          aml={entry}
                          onSuccess={refetch}
                          trigger={
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <Factory className="h-4 w-4" />
                            </Button>
                          }
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-center text-muted-foreground py-8">
              No AML entries found. Add your first approved manufacturer.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
