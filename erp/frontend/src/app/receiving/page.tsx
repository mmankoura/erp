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
import { DataTable, type Column } from "@/components/data-table"
import { VirtualGrid, type VirtualGridColumn } from "@/components/virtual-grid"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
  const [activeTab, setActiveTab] = useState<"sessions" | "flagged" | "inspections" | "log">("log")
  const [sessionStatusFilter, setSessionStatusFilter] = useState<string>("OPEN")
  const [statusFilter, setStatusFilter] = useState<string>("all")

  // Fetch sessions based on status filter
  const sessionEndpoint = sessionStatusFilter === "all"
    ? "/receiving/sessions"
    : `/receiving/sessions?status=${sessionStatusFilter}`
  const { data: sessions, isLoading: sessionsLoading, refetch: refetchSessions } = useApi<ReceivingSession[]>(sessionEndpoint)

  // Fetch flagged lines
  const { data: flaggedLines, isLoading: flaggedLoading, refetch: refetchFlagged } = useApi<ReceivingSessionLine[]>("/receiving/flagged")

  // Fetch inspections
  const inspectionEndpoint = statusFilter === "all"
    ? "/receiving-inspections"
    : statusFilter === "PENDING"
      ? "/receiving-inspections/pending"
      : `/receiving-inspections/status/${statusFilter}`

  const { data: inspections, isLoading: inspectionsLoading, refetch: refetchInspections } = useApi<ReceivingInspection[]>(inspectionEndpoint)

  // Fetch all lots for receiving log
  interface ReceivingLogLot {
    id: string
    uid: string
    material_id: string
    material: { internal_part_number: string; description: string | null; customer?: { name: string } | null } | null
    quantity: number
    package_type: string
    po_reference: string | null
    supplier: { name: string } | null
    owner_type: string
    status: string
    location: string
    received_date: string | null
    created_at: string
  }
  const { data: allLots, isLoading: lotsLoading } = useApi<ReceivingLogLot[]>("/inventory/lots")

  const receivingLogColumns: VirtualGridColumn<ReceivingLogLot>[] = [
    { id: "date", header: "Date", size: 140, sortable: true, accessorFn: (l) => l.created_at, cell: (l) => <span className="text-sm tabular-nums">{new Date(l.created_at).toLocaleDateString()} {new Date(l.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span> },
    { id: "uid", header: "UID", size: 160, sortable: true, filterable: true, filterAccessor: (l) => l.uid, accessorFn: (l) => l.uid, cell: (l) => <span className="font-mono text-xs">{l.uid}</span> },
    { id: "customer", header: "Customer", size: 130, sortable: true, filterable: true, filterAccessor: (l) => l.material?.customer?.name || "-", accessorFn: (l) => l.material?.customer?.name || "", cell: (l) => <span className="text-sm">{l.material?.customer?.name || "\u2014"}</span> },
    { id: "ipn", header: "IPN", size: 150, sortable: true, filterable: true, filterAccessor: (l) => l.material?.internal_part_number || "", accessorFn: (l) => l.material?.internal_part_number || "", cell: (l) => (<div><span className="font-medium text-sm">{l.material?.internal_part_number}</span>{l.material?.description && <p className="text-xs text-muted-foreground truncate">{l.material.description}</p>}</div>) },
    { id: "qty", header: "Qty", size: 80, align: "right", sortable: true, accessorFn: (l) => parseFloat(String(l.quantity)), cell: (l) => <span className="font-mono text-sm">{parseFloat(String(l.quantity)).toLocaleString()}</span> },
    { id: "package", header: "Package", size: 90, sortable: true, filterable: true, filterAccessor: (l) => l.package_type, accessorFn: (l) => l.package_type, cell: (l) => <Badge variant="outline" className="text-xs">{l.package_type}</Badge> },
    { id: "po_ref", header: "PO Ref", size: 120, sortable: true, filterable: true, filterAccessor: (l) => l.po_reference || "-", accessorFn: (l) => l.po_reference || "", cell: (l) => <span className="text-sm text-muted-foreground">{l.po_reference || "\u2014"}</span> },
    { id: "status", header: "Status", size: 100, sortable: true, filterable: true, filterAccessor: (l) => l.status, accessorFn: (l) => l.status, cell: (l) => <Badge variant={l.status === "ACTIVE" ? "default" : l.status === "CONSUMED" ? "secondary" : "destructive"} className="text-xs">{l.status}</Badge> },
    { id: "location", header: "Location", size: 90, sortable: true, filterable: true, filterAccessor: (l) => l.location, accessorFn: (l) => l.location, cell: (l) => <span className="text-xs">{l.location}</span> },
  ]

  // Calculate stats
  const openSessionCount = sessions?.filter((s) => s.status === "OPEN").length || sessions?.length || 0
  const flaggedCount = flaggedLines?.length || 0
  const pendingInspections = inspections?.filter((i) => i.status === "PENDING").length || 0
  const approvedInspections = inspections?.filter((i) => i.status === "APPROVED").length || 0

  // Session columns for DataTable
  const sessionColumns: Column<ReceivingSession>[] = [
    {
      key: "session_number",
      header: "Session #",
      sortable: true,
      cell: (s) => <span className="font-mono font-medium">{s.session_number}</span>,
    },
    {
      key: "receipt_type",
      header: "Type",
      sortable: true,
      cell: (s) => (
        <Badge variant="outline" className="text-xs">
          {s.receipt_type === "PO" ? "PO" : "Customer Supplied"}
        </Badge>
      ),
    },
    {
      key: "po_reference",
      header: "PO / Packing Slip",
      sortable: true,
      sortAccessor: (s) => s.purchase_order?.po_number || s.packing_slip_number || "",
      cell: (s) => s.purchase_order?.po_number || s.packing_slip_number || "-",
    },
    {
      key: "started_by",
      header: "Started By",
      sortable: true,
      cell: (s) => s.started_by,
    },
    {
      key: "started_at",
      header: "Started At",
      sortable: true,
      sortAccessor: (s) => new Date(s.started_at).getTime(),
      cell: (s) => <span className="text-sm">{new Date(s.started_at).toLocaleString()}</span>,
    },
    {
      key: "next_line_number",
      header: "Lines",
      sortable: true,
      cell: (s) => <span className="font-mono">{s.next_line_number}</span>,
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      cell: (s) => (
        <Badge variant={sessionStatusConfig[s.status]?.variant || "outline"}>
          {sessionStatusConfig[s.status]?.label || s.status}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      resizable: false,
      cell: (s) => (
        <Link href={`/receiving/new?session=${s.id}`}>
          <Button variant="ghost" size="sm" className="h-8 text-xs">
            <ArrowRight className="h-4 w-4 mr-1" />
            Resume
          </Button>
        </Link>
      ),
    },
  ]

  // Flagged items columns for DataTable
  const flaggedColumns: Column<ReceivingSessionLine>[] = [
    {
      key: "uid",
      header: "UID",
      sortable: true,
      cell: (line) => <span className="font-mono text-sm">{line.uid}</span>,
    },
    {
      key: "received_ipn",
      header: "IPN",
      sortable: true,
      cell: (line) => <span className="font-medium">{line.received_ipn}</span>,
    },
    {
      key: "received_mpn",
      header: "MPN",
      sortable: true,
      cell: (line) => <span className="font-mono text-sm">{line.received_mpn || "-"}</span>,
    },
    {
      key: "quantity_received",
      header: "Qty",
      className: "text-right",
      sortable: true,
      cell: (line) => <span className="font-mono">{line.quantity_received}</span>,
    },
    {
      key: "hold_reason_code",
      header: "Reason",
      sortable: true,
      cell: (line) => (
        <Badge variant="destructive" className="text-xs">
          {holdReasonLabels[line.hold_reason_code || ""] || line.hold_reason_code || "-"}
        </Badge>
      ),
    },
    {
      key: "session",
      header: "Session",
      sortable: true,
      sortAccessor: (line) => line.session?.session_number || "",
      cell: (line) => <span className="font-mono text-sm">{line.session?.session_number || "-"}</span>,
    },
    {
      key: "created_at",
      header: "Received At",
      sortable: true,
      sortAccessor: (line) => new Date(line.created_at).getTime(),
      cell: (line) => <span className="text-sm">{new Date(line.created_at).toLocaleString()}</span>,
    },
    {
      key: "actions",
      header: "",
      resizable: false,
      cell: (line) => (
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
      ),
    },
  ]

  // Inspection columns for DataTable
  const inspectionColumns: Column<ReceivingInspection>[] = [
    {
      key: "material",
      header: "Material",
      sortable: true,
      sortAccessor: (i) => i.material?.internal_part_number || "",
      cell: (i) => <span className="font-medium">{i.material?.internal_part_number}</span>,
    },
    {
      key: "quantity_received",
      header: "Qty",
      className: "text-right",
      sortable: true,
      cell: (i) => <span className="font-mono">{i.quantity_received}</span>,
    },
    {
      key: "received_ipn",
      header: "Received IPN",
      sortable: true,
      cell: (i) => i.received_ipn || "-",
    },
    {
      key: "received_mpn",
      header: "Received MPN",
      sortable: true,
      cell: (i) => i.received_mpn || "-",
    },
    {
      key: "ipn_match",
      header: "IPN Match",
      sortable: true,
      sortAccessor: (i) => i.ipn_match === null ? -1 : i.ipn_match ? 1 : 0,
      cell: (i) =>
        i.ipn_match === null ? (
          <span className="text-muted-foreground">-</span>
        ) : i.ipn_match ? (
          <CheckCircle className="h-4 w-4 text-green-500" />
        ) : (
          <XCircle className="h-4 w-4 text-red-500" />
        ),
    },
    {
      key: "mpn_match",
      header: "AML Match",
      sortable: true,
      sortAccessor: (i) => i.mpn_match === null ? -1 : i.mpn_match ? 1 : 0,
      cell: (i) =>
        i.mpn_match === null ? (
          <span className="text-muted-foreground">-</span>
        ) : i.mpn_match ? (
          <CheckCircle className="h-4 w-4 text-green-500" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-yellow-500" />
        ),
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      cell: (i) => (
        <Badge variant={statusConfig[i.status].variant}>
          {statusConfig[i.status].label}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      resizable: false,
      cell: (i) => (
        <InspectionActionDialog
          inspection={i}
          onSuccess={refetchInspections}
          trigger={
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <Eye className="h-4 w-4" />
            </Button>
          }
        />
      ),
    },
  ]

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
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "log"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setActiveTab("log")}
        >
          Receiving Log
          <Badge variant="secondary" className="ml-2 text-xs">{allLots?.length ?? 0}</Badge>
        </button>
      </div>

      {/* Open Sessions Tab */}
      {activeTab === "sessions" && (
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <Label className="text-sm font-medium">Status:</Label>
            <Select value={sessionStatusFilter} onValueChange={setSessionStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="OPEN">Open</SelectItem>
                <SelectItem value="CLOSED">Closed</SelectItem>
                <SelectItem value="CANCELLED">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DataTable
            data={sessions || null}
            columns={sessionColumns}
            isLoading={sessionsLoading}
            searchFilter={(s, search) => {
              const q = search.toLowerCase()
              return (
                s.session_number?.toLowerCase().includes(q) ||
                s.started_by?.toLowerCase().includes(q) ||
                (s.purchase_order?.po_number?.toLowerCase().includes(q) ?? false)
              )
            }}
            searchPlaceholder="Search by session #, operator, or PO..."
            emptyMessage="No sessions found."
            storageKey="receiving-sessions"
          />
        </div>
      )}

      {/* Flagged Items Tab */}
      {activeTab === "flagged" && (
        <DataTable
          data={flaggedLines || null}
          columns={flaggedColumns}
          isLoading={flaggedLoading}
          searchFilter={(line, search) => {
            const q = search.toLowerCase()
            return (
              line.uid?.toLowerCase().includes(q) ||
              line.received_ipn?.toLowerCase().includes(q) ||
              (line.received_mpn?.toLowerCase().includes(q) ?? false)
            )
          }}
          searchPlaceholder="Search by UID, IPN, or MPN..."
          emptyMessage="No flagged items. All received materials passed validation."
          storageKey="receiving-flagged"
        />
      )}

      {/* Inspections Tab */}
      {activeTab === "inspections" && (
        <div className="space-y-4">
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
          <DataTable
            data={inspections || null}
            columns={inspectionColumns}
            isLoading={inspectionsLoading}
            searchFilter={(i, search) => {
              const q = search.toLowerCase()
              return (
                (i.material?.internal_part_number?.toLowerCase().includes(q) ?? false) ||
                (i.received_ipn?.toLowerCase().includes(q) ?? false) ||
                (i.received_mpn?.toLowerCase().includes(q) ?? false)
              )
            }}
            searchPlaceholder="Search by material, IPN, or MPN..."
            emptyMessage="No inspections found."
            storageKey="receiving-inspections"
          />
        </div>
      )}

      {/* Receiving Log Tab */}
      {activeTab === "log" && (
        <VirtualGrid
          data={allLots ?? null}
          columns={receivingLogColumns}
          title="Receiving Log"
          isLoading={lotsLoading}
          searchPlaceholder="Search by UID, IPN, customer, PO ref, status..."
          searchFn={(l, q) =>
            !!(l.uid.toLowerCase().includes(q) ||
            (l.material?.internal_part_number ?? "").toLowerCase().includes(q) ||
            (l.material?.description ?? "").toLowerCase().includes(q) ||
            (l.material?.customer?.name ?? "").toLowerCase().includes(q) ||
            (l.po_reference ?? "").toLowerCase().includes(q) ||
            l.status.toLowerCase().includes(q) ||
            l.package_type.toLowerCase().includes(q))
          }
        />
      )}
    </div>
  )
}
