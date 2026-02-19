"use client"

import { useApi, useMutation } from "@/hooks/use-api"
import {
  api,
  type ReceivingInspection,
  type InspectionStatus,
  type ReceivingSession,
  type ReceivingSessionLine,
  type DispositionActionType,
} from "@/lib/api"
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
  Plus,
  ArrowRight,
  Undo2,
  Trash2,
  ShieldCheck,
} from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import Link from "next/link"

// Status config for inspections
const statusConfig: Record<InspectionStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode }> = {
  PENDING: { label: "Pending", variant: "secondary", icon: <Clock className="h-3 w-3" /> },
  IN_PROGRESS: { label: "In Progress", variant: "outline", icon: <Play className="h-3 w-3" /> },
  APPROVED: { label: "Approved", variant: "default", icon: <CheckCircle className="h-3 w-3" /> },
  REJECTED: { label: "Rejected", variant: "destructive", icon: <XCircle className="h-3 w-3" /> },
  ON_HOLD: { label: "On Hold", variant: "outline", icon: <Pause className="h-3 w-3" /> },
  RELEASED: { label: "Released", variant: "default", icon: <Package className="h-3 w-3" /> },
}

const holdReasonLabels: Record<string, string> = {
  WRONG_MPN: "Wrong MPN",
  DAMAGED: "Damaged",
  NO_PO_LINE: "No PO Line",
  NO_AML: "Not on AML",
  COUNTERFEIT_CONCERN: "Counterfeit Concern",
  OTHER: "Other",
}

// Discrepancy Resolution Dialog for flagged receiving lines
function ResolveDiscrepancyDialog({
  line,
  onSuccess,
  trigger,
}: {
  line: ReceivingSessionLine
  onSuccess: () => void
  trigger: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [action, setAction] = useState<DispositionActionType>("ACCEPT_DEVIATION")
  const [dispositionBy, setDispositionBy] = useState("")
  const [dispositionNotes, setDispositionNotes] = useState("")
  const [acceptedQuantity, setAcceptedQuantity] = useState<string>("")

  const resolveMutation = useMutation(
    (data: { disposition_action: DispositionActionType; disposition_by: string; disposition_notes?: string; accepted_quantity?: number }) =>
      api.post(`/receiving/lines/${line.id}/resolve`, data),
    {
      onSuccess: () => {
        toast.success("Discrepancy resolved")
        setOpen(false)
        setDispositionBy("")
        setDispositionNotes("")
        setAcceptedQuantity("")
        onSuccess()
      },
      onError: (error) => toast.error(error.message),
    }
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const data: { disposition_action: DispositionActionType; disposition_by: string; disposition_notes?: string; accepted_quantity?: number } = {
      disposition_action: action,
      disposition_by: dispositionBy,
    }
    if (dispositionNotes) data.disposition_notes = dispositionNotes
    if (action === "PARTIAL_ACCEPT" && acceptedQuantity) {
      data.accepted_quantity = parseFloat(acceptedQuantity)
    }
    resolveMutation.mutate(data)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Resolve Discrepancy
              <Badge variant="destructive" className="text-xs">
                {holdReasonLabels[line.hold_reason_code || ""] || line.hold_reason_code}
              </Badge>
            </DialogTitle>
            <DialogDescription>
              UID: {line.uid} | {line.received_ipn} | Qty: {line.quantity_received}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Validation Details */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Received IPN:</span>
                <p className="font-medium">{line.received_ipn}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Received MPN:</span>
                <p className="font-medium">{line.received_mpn || "-"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Manufacturer:</span>
                <p className="font-medium">{line.received_manufacturer || "-"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Qty Received:</span>
                <p className="font-medium">{line.quantity_received}</p>
              </div>
              {line.hold_notes && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">Hold Notes:</span>
                  <p>{line.hold_notes}</p>
                </div>
              )}
            </div>

            {/* Disposition Action */}
            <div className="grid gap-2">
              <Label>Disposition Action *</Label>
              <Select value={action} onValueChange={(v) => setAction(v as DispositionActionType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACCEPT_DEVIATION">Accept Deviation (release as-is)</SelectItem>
                  <SelectItem value="PARTIAL_ACCEPT">Partial Accept (accept partial qty)</SelectItem>
                  <SelectItem value="REJECT_RTV">Reject / Return to Vendor</SelectItem>
                  <SelectItem value="SCRAP">Scrap</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {action === "PARTIAL_ACCEPT" && (
              <div className="grid gap-2">
                <Label htmlFor="accepted_qty">Accepted Quantity *</Label>
                <Input
                  id="accepted_qty"
                  type="number"
                  step="0.0001"
                  min="0"
                  max={line.quantity_received}
                  value={acceptedQuantity}
                  onChange={(e) => setAcceptedQuantity(e.target.value)}
                  placeholder={`Max: ${line.quantity_received}`}
                  required
                />
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="disposition_by">Your Name *</Label>
              <Input
                id="disposition_by"
                value={dispositionBy}
                onChange={(e) => setDispositionBy(e.target.value)}
                placeholder="Enter your name"
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="disposition_notes">Notes</Label>
              <Textarea
                id="disposition_notes"
                value={dispositionNotes}
                onChange={(e) => setDispositionNotes(e.target.value)}
                placeholder="Disposition notes..."
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={resolveMutation.isLoading || !dispositionBy || (action === "PARTIAL_ACCEPT" && !acceptedQuantity)}
              variant={action === "REJECT_RTV" || action === "SCRAP" ? "destructive" : "default"}
            >
              {action === "ACCEPT_DEVIATION" && <><ShieldCheck className="h-4 w-4 mr-1" />Accept</>}
              {action === "PARTIAL_ACCEPT" && <><ShieldCheck className="h-4 w-4 mr-1" />Accept Partial</>}
              {action === "REJECT_RTV" && <><Undo2 className="h-4 w-4 mr-1" />Return to Vendor</>}
              {action === "SCRAP" && <><Trash2 className="h-4 w-4 mr-1" />Scrap</>}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// Inspection Action Dialog (existing functionality)
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

// Session status badge config
const sessionStatusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  OPEN: { label: "Open", variant: "default" },
  CLOSED: { label: "Closed", variant: "secondary" },
  CANCELLED: { label: "Cancelled", variant: "outline" },
}

export default function ReceivingPage() {
  const [activeTab, setActiveTab] = useState<"sessions" | "flagged" | "inspections">("sessions")
  const [statusFilter, setStatusFilter] = useState<string>("all")

  // Fetch open sessions
  const { data: sessions, isLoading: sessionsLoading, refetch: refetchSessions } = useApi<ReceivingSession[]>("/receiving/sessions?status=OPEN")

  // Fetch flagged lines
  const { data: flaggedLines, isLoading: flaggedLoading, refetch: refetchFlagged } = useApi<ReceivingSessionLine[]>("/receiving/flagged")

  // Fetch inspections
  const endpoint = statusFilter === "all"
    ? "/receiving-inspections"
    : statusFilter === "PENDING"
      ? "/receiving-inspections/pending"
      : `/receiving-inspections/status/${statusFilter}`

  const { data: inspections, isLoading: inspectionsLoading, refetch: refetchInspections } = useApi<ReceivingInspection[]>(endpoint)

  // Calculate stats
  const openSessionCount = sessions?.length || 0
  const flaggedCount = flaggedLines?.length || 0
  const pendingInspections = inspections?.filter((i) => i.status === "PENDING").length || 0
  const approvedInspections = inspections?.filter((i) => i.status === "APPROVED").length || 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Receiving</h1>
          <p className="text-muted-foreground">
            Receive materials, manage sessions, and resolve discrepancies
          </p>
        </div>
        <Link href="/receiving/new">
          <Button size="lg">
            <Plus className="h-4 w-4 mr-2" />
            Receive Materials
          </Button>
        </Link>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card
          className={`cursor-pointer transition-colors ${activeTab === "sessions" ? "ring-2 ring-primary" : "hover:bg-muted/50"}`}
          onClick={() => setActiveTab("sessions")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Open Sessions</CardTitle>
            <Play className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{openSessionCount}</div>
            <p className="text-xs text-muted-foreground">active receiving sessions</p>
          </CardContent>
        </Card>
        <Card
          className={`cursor-pointer transition-colors ${activeTab === "flagged" ? "ring-2 ring-primary" : "hover:bg-muted/50"}`}
          onClick={() => setActiveTab("flagged")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Flagged Items</CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{flaggedCount}</div>
            <p className="text-xs text-muted-foreground">awaiting disposition</p>
          </CardContent>
        </Card>
        <Card
          className={`cursor-pointer transition-colors ${activeTab === "inspections" ? "ring-2 ring-primary" : "hover:bg-muted/50"}`}
          onClick={() => setActiveTab("inspections")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Inspections</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingInspections}</div>
            <p className="text-xs text-muted-foreground">awaiting validation</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ready to Release</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{approvedInspections}</div>
            <p className="text-xs text-muted-foreground">approved inspections</p>
          </CardContent>
        </Card>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b">
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "sessions"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setActiveTab("sessions")}
        >
          Open Sessions
          {openSessionCount > 0 && (
            <Badge variant="secondary" className="ml-2 text-xs">{openSessionCount}</Badge>
          )}
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "flagged"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setActiveTab("flagged")}
        >
          Flagged Items
          {flaggedCount > 0 && (
            <Badge variant="destructive" className="ml-2 text-xs">{flaggedCount}</Badge>
          )}
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "inspections"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setActiveTab("inspections")}
        >
          Inspections
        </button>
      </div>

      {/* Open Sessions Tab */}
      {activeTab === "sessions" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Play className="h-5 w-5" />
              Open Receiving Sessions
            </CardTitle>
            <CardDescription>Active sessions that can be resumed</CardDescription>
          </CardHeader>
          <CardContent>
            {sessionsLoading ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : sessions && sessions.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Session #</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>PO / Packing Slip</TableHead>
                    <TableHead>Started By</TableHead>
                    <TableHead>Started At</TableHead>
                    <TableHead>Lines</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.map((session) => (
                    <TableRow key={session.id}>
                      <TableCell className="font-mono font-medium">{session.session_number}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {session.receipt_type === "PO" ? "PO" : "Customer Supplied"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {session.purchase_order?.po_number || session.packing_slip_number || "-"}
                      </TableCell>
                      <TableCell>{session.started_by}</TableCell>
                      <TableCell className="text-sm">
                        {new Date(session.started_at).toLocaleString()}
                      </TableCell>
                      <TableCell className="font-mono">{session.next_line_number}</TableCell>
                      <TableCell>
                        <Badge variant={sessionStatusConfig[session.status]?.variant || "outline"}>
                          {sessionStatusConfig[session.status]?.label || session.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Link href={`/receiving/new?session=${session.id}`}>
                          <Button variant="ghost" size="sm" className="h-8 text-xs">
                            <ArrowRight className="h-4 w-4 mr-1" />
                            Resume
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                No open sessions. Click &quot;Receive Materials&quot; to start a new session.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Flagged Items Tab */}
      {activeTab === "flagged" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Flagged Items
            </CardTitle>
            <CardDescription>Items flagged during receiving that require disposition</CardDescription>
          </CardHeader>
          <CardContent>
            {flaggedLoading ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : flaggedLines && flaggedLines.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>UID</TableHead>
                    <TableHead>IPN</TableHead>
                    <TableHead>MPN</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Session</TableHead>
                    <TableHead>Received At</TableHead>
                    <TableHead className="w-[100px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {flaggedLines.map((line) => (
                    <TableRow key={line.id} className="bg-amber-50/50">
                      <TableCell className="font-mono text-sm">{line.uid}</TableCell>
                      <TableCell className="font-medium">{line.received_ipn}</TableCell>
                      <TableCell className="font-mono text-sm">{line.received_mpn || "-"}</TableCell>
                      <TableCell className="text-right font-mono">{line.quantity_received}</TableCell>
                      <TableCell>
                        <Badge variant="destructive" className="text-xs">
                          {holdReasonLabels[line.hold_reason_code || ""] || line.hold_reason_code || "-"}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {line.session?.session_number || "-"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {new Date(line.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <ResolveDiscrepancyDialog
                          line={line}
                          onSuccess={() => {
                            refetchFlagged()
                            refetchInspections()
                          }}
                          trigger={
                            <Button variant="outline" size="sm" className="h-8 text-xs">
                              <Eye className="h-3 w-3 mr-1" />
                              Resolve
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
                No flagged items. All received materials passed validation.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Inspections Tab */}
      {activeTab === "inspections" && (
        <>
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

          <Card>
            <CardHeader>
              <CardTitle>Inspections</CardTitle>
              <CardDescription>Items received pending validation</CardDescription>
            </CardHeader>
            <CardContent>
              {inspectionsLoading ? (
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
                            onSuccess={refetchInspections}
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
        </>
      )}
    </div>
  )
}
