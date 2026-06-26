"use client"

import { useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { useApi, useMutation } from "@/hooks/use-api"
import { api, type PhysicalCount } from "@/lib/api"
import { useAuth, UserRole } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { ArrowLeft, FileDown, FileSpreadsheet, Play, XCircle } from "lucide-react"
import { toast } from "sonner"
import Link from "next/link"

export default function PhysicalCountDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const { user, hasRole } = useAuth()

  const { data: count, isLoading, refetch } = useApi<PhysicalCount>(`/physical-counts/${id}`)

  const startMutation = useMutation<PhysicalCount, void>(
    () => api.post(`/physical-counts/${id}/start`, {}),
    {
      onSuccess: () => {
        toast.success("Count started")
        refetch()
        router.push(`/physical-count/${id}/scan`)
      },
      onError: (err) => toast.error(err.message || "Failed to start count"),
    }
  )

  const cancelMutation = useMutation<PhysicalCount, void>(
    () => api.post(`/physical-counts/${id}/cancel`, {}),
    {
      onSuccess: () => {
        toast.success("Count cancelled")
        refetch()
      },
      onError: (err) => toast.error(err.message || "Failed to cancel"),
    }
  )

  const resumeMutation = useMutation<PhysicalCount, void>(
    () => api.post(`/physical-counts/${id}/resume`, {}),
    {
      onSuccess: () => {
        toast.success("Count resumed")
        refetch()
        router.push(`/physical-count/${id}/scan`)
      },
      onError: (err) => toast.error(err.message || "Failed to resume count"),
    }
  )

  // Status-driven routing
  useEffect(() => {
    if (!count) return
    if (count.status === "IN_PROGRESS" && count.counted_by === user?.username) {
      router.replace(`/physical-count/${id}/scan`)
    } else if (count.status === "PENDING_REVIEW") {
      router.replace(`/physical-count/${id}/review`)
    }
  }, [count, id, router, user])

  if (isLoading || !count) {
    return <div className="text-muted-foreground">Loading...</div>
  }

  const isLockedToOther =
    count.status === "IN_PROGRESS" &&
    !!count.counted_by &&
    count.counted_by !== user?.username

  return (
    <div className="space-y-6">
      <Link href="/physical-count">
        <Button variant="ghost" size="sm">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {count.count_number}
            <Badge className="ml-3">{count.status}</Badge>
          </h1>
          <p className="text-muted-foreground">
            Customer: {count.customer?.name ?? count.customer_id}
            {count.bin_filter ? ` · BIN: ${count.bin_filter}` : ""}
            {count.category_filter ? ` · Category: ${count.category_filter}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          {count.status === "PLANNED" && (
            <Button onClick={() => startMutation.mutate(undefined)} disabled={startMutation.isLoading}>
              Start Count
            </Button>
          )}
          {count.status === "PAUSED" && (
            <Button onClick={() => resumeMutation.mutate(undefined)} disabled={resumeMutation.isLoading}>
              <Play className="h-4 w-4 mr-1" /> Resume Count
            </Button>
          )}
          {(count.status === "PLANNED" || count.status === "IN_PROGRESS" || count.status === "PAUSED" || count.status === "PENDING_REVIEW") &&
            hasRole(UserRole.ADMIN, UserRole.MANAGER) && (
              <Button
                variant="destructive"
                onClick={() => {
                  if (confirm(`Cancel ${count.count_number}? This cannot be undone.`)) {
                    cancelMutation.mutate(undefined)
                  }
                }}
              >
                <XCircle className="h-4 w-4 mr-1" /> Cancel Count
              </Button>
            )}
          {count.status === "APPROVED" && (
            <>
              <Button
                variant="outline"
                onClick={async () => {
                  const { generatePhysicalCountPdf } = await import("@/lib/physical-count-pdf")
                  const report = await api.get<unknown>(`/physical-counts/${id}/variance-report`)
                  generatePhysicalCountPdf(report as Parameters<typeof generatePhysicalCountPdf>[0])
                }}
              >
                <FileDown className="h-4 w-4 mr-1" /> PDF
              </Button>
              <Button
                variant="outline"
                onClick={async () => {
                  const { exportPhysicalCountToExcel } = await import("@/lib/physical-count-excel")
                  const report = await api.get<unknown>(`/physical-counts/${id}/variance-report`)
                  exportPhysicalCountToExcel(report as Parameters<typeof exportPhysicalCountToExcel>[0])
                }}
              >
                <FileSpreadsheet className="h-4 w-4 mr-1" /> Excel
              </Button>
            </>
          )}
        </div>
      </div>

      {isLockedToOther && (
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground">
              This count is currently being scanned by <strong>{count.counted_by}</strong>. You can view it but cannot scan.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <Stat label="Expected lots" value={count.total_expected_lots} />
            <Stat label="Distinct UIDs scanned" value={count.total_scans} />
            <Stat label="Shortage" value={count.shortage_count} />
            <Stat label="Overage" value={count.overage_count} />
            <Stat label="Not scanned" value={count.not_scanned_count} />
            <Stat label="Orphan scans" value={count.orphan_count} />
            <Stat label="Variance value" value={Number(count.total_variance_value).toFixed(2)} />
            <Stat label="Counted by" value={count.counted_by ?? "—"} />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-mono text-base">{value}</div>
    </div>
  )
}
