"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useApi } from "@/hooks/use-api"
import {
  api,
  type PhysicalCount,
  type PhysicalCountDiscrepancy,
  type PhysicalCountDiscrepancyType,
  type PhysicalCountResolutionAction,
} from "@/lib/api"
import { useAuth, UserRole } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { ArrowLeft, ChevronDown, ChevronRight } from "lucide-react"
import { toast } from "sonner"
import Link from "next/link"

type DiscrepancyWithId = PhysicalCountDiscrepancy & { id: string }

const TYPE_LABELS: Record<PhysicalCountDiscrepancyType, string> = {
  SHORTAGE: "Shortage (scan < system)",
  OVERAGE: "Overage (scan > system)",
  NOT_SCANNED: "Not Scanned (in system, no scan)",
  ORPHAN: "Orphan (scanned, not in system)",
}

const RESOLUTION_OPTIONS_BY_TYPE: Record<PhysicalCountDiscrepancyType, PhysicalCountResolutionAction[]> = {
  SHORTAGE: ["ADJUST_TO_SCAN", "ACCEPT_WITH_NOTE", "RECOUNT", "SCRAP_MISSING"],
  OVERAGE: ["ADJUST_TO_SCAN", "ACCEPT_WITH_NOTE", "RECOUNT"],
  NOT_SCANNED: ["ADJUST_TO_SCAN", "ACCEPT_WITH_NOTE", "RECOUNT", "SCRAP_MISSING"],
  ORPHAN: ["ACCEPT_WITH_NOTE", "RECOUNT"],
}

export default function ReviewPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const { hasRole } = useAuth()
  const canApprove = hasRole(UserRole.ADMIN, UserRole.MANAGER)

  const { data: count, refetch: refetchCount } = useApi<PhysicalCount>(`/physical-counts/${id}`)
  const { data: discrepancies, refetch: refetchDiscrepancies } = useApi<DiscrepancyWithId[]>(
    `/physical-counts/${id}/discrepancies`,
  )

  const [openSections, setOpenSections] = useState<Record<PhysicalCountDiscrepancyType, boolean>>({
    SHORTAGE: true,
    OVERAGE: true,
    NOT_SCANNED: true,
    ORPHAN: true,
  })

  const toggle = (t: PhysicalCountDiscrepancyType) =>
    setOpenSections((s) => ({ ...s, [t]: !s[t] }))

  if (!count) return <div className="text-muted-foreground">Loading...</div>

  const allDiscrepancies = discrepancies ?? []
  const byType: Record<PhysicalCountDiscrepancyType, DiscrepancyWithId[]> = {
    SHORTAGE: [],
    OVERAGE: [],
    NOT_SCANNED: [],
    ORPHAN: [],
  }
  for (const d of allDiscrepancies) byType[d.type].push(d)

  const resolvedCount = allDiscrepancies.filter((d) => d.resolution_action).length
  const allResolved = allDiscrepancies.length > 0 && resolvedCount === allDiscrepancies.length

  const approve = async () => {
    if (!confirm("Approve count? This creates inventory transactions and cannot be undone.")) return
    try {
      await api.post(`/physical-counts/${id}/approve`, {})
      toast.success("Count approved")
      router.push(`/physical-count/${id}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to approve")
    }
  }

  return (
    <div className="space-y-6">
      <Link href={`/physical-count/${id}`}>
        <Button variant="ghost" size="sm">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{count.count_number} — Review</h1>
          <p className="text-muted-foreground text-sm">
            {resolvedCount} of {allDiscrepancies.length} resolved
            {count.status === "APPROVED" && " · APPROVED"}
          </p>
        </div>
        {count.status === "PENDING_REVIEW" && canApprove && (
          <Button onClick={approve} disabled={!allResolved}>
            Approve count
          </Button>
        )}
      </div>

      {(["SHORTAGE", "OVERAGE", "NOT_SCANNED", "ORPHAN"] as PhysicalCountDiscrepancyType[]).map((t) => (
        <DiscrepancySection
          key={t}
          type={t}
          items={byType[t]}
          open={openSections[t]}
          onToggle={() => toggle(t)}
          readOnly={count.status !== "PENDING_REVIEW"}
          onResolved={() => { refetchDiscrepancies(); refetchCount() }}
          countId={id}
        />
      ))}
    </div>
  )
}

function DiscrepancySection({
  type,
  items,
  open,
  onToggle,
  readOnly,
  onResolved,
  countId,
}: {
  type: PhysicalCountDiscrepancyType
  items: DiscrepancyWithId[]
  open: boolean
  onToggle: () => void
  readOnly: boolean
  onResolved: () => void
  countId: string
}) {
  return (
    <Card>
      <CardHeader className="cursor-pointer" onClick={onToggle}>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              {TYPE_LABELS[type]}
              <Badge variant="outline" className="ml-2">{items.length}</Badge>
            </CardTitle>
          </div>
        </div>
      </CardHeader>
      {open && (
        <CardContent className="space-y-2">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">None.</p>
          ) : (
            items.map((d) => (
              <DiscrepancyRow
                key={d.id}
                discrepancy={d}
                readOnly={readOnly}
                onResolved={onResolved}
                countId={countId}
              />
            ))
          )}
        </CardContent>
      )}
    </Card>
  )
}

function DiscrepancyRow({
  discrepancy,
  readOnly,
  onResolved,
  countId,
}: {
  discrepancy: DiscrepancyWithId
  readOnly: boolean
  onResolved: () => void
  countId: string
}) {
  const [action, setAction] = useState<PhysicalCountResolutionAction | "">(
    discrepancy.resolution_action ?? ""
  )
  const [note, setNote] = useState<string>(discrepancy.resolution_note ?? "")
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!action) {
      toast.error("Pick a resolution action")
      return
    }
    setSaving(true)
    try {
      await api.patch(`/physical-counts/${countId}/discrepancies/${discrepancy.id}`, {
        resolution_action: action,
        resolution_note: note || undefined,
      })
      toast.success("Resolved")
      onResolved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to resolve")
    } finally {
      setSaving(false)
    }
  }

  const options = RESOLUTION_OPTIONS_BY_TYPE[discrepancy.type]

  return (
    <div className="border rounded-md p-3 space-y-2">
      <div className="grid grid-cols-1 md:grid-cols-6 gap-2 text-sm">
        <div>
          <div className="text-xs text-muted-foreground">UID / IPN</div>
          <div className="font-mono font-medium">{discrepancy.uid ?? discrepancy.lot?.uid ?? "—"}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Expected</div>
          <div className="font-mono">{discrepancy.expected_qty ?? "—"}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Scanned</div>
          <div className="font-mono">{discrepancy.scanned_qty ?? "—"}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Variance</div>
          <div className="font-mono">{discrepancy.variance}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Variance $</div>
          <div className="font-mono">
            {discrepancy.variance_value != null ? Number(discrepancy.variance_value).toFixed(2) : "—"}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Resolved by</div>
          <div className="text-sm">{discrepancy.resolved_by ?? "—"}</div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
        <div className="md:col-span-4">
          <Select value={action} onValueChange={(v) => setAction(v as PhysicalCountResolutionAction)} disabled={readOnly}>
            <SelectTrigger>
              <SelectValue placeholder="Resolution action" />
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o} value={o}>{o.replace(/_/g, " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-6">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional)"
            disabled={readOnly}
          />
        </div>
        <div className="md:col-span-2">
          <Button onClick={save} disabled={readOnly || saving || !action} className="w-full">
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    </div>
  )
}
