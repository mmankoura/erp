"use client"

import { useState, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import { useApi } from "@/hooks/use-api"
import {
  api,
  type PhysicalCount,
  type PhysicalCountScan,
} from "@/lib/api"
import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { VirtualGrid, type VirtualGridColumn } from "@/components/virtual-grid"
import { ArrowLeft, Trash2 } from "lucide-react"
import { toast } from "sonner"
import Link from "next/link"

type ScanWithId = PhysicalCountScan & { id: string }

interface DupExisting {
  id: string
  scanned_qty: number
  resolution: string
  scanned_at: string
}

export default function ScanPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const { user } = useAuth()

  const { data: count, refetch: refetchCount } = useApi<PhysicalCount>(`/physical-counts/${id}`)
  const { data: scans, refetch: refetchScans } = useApi<ScanWithId[]>(`/physical-counts/${id}/scans`)

  const [uid, setUid] = useState("")
  const [qty, setQty] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [dupExisting, setDupExisting] = useState<DupExisting[] | null>(null)
  const [pendingScan, setPendingScan] = useState<{ uid: string; qty: number } | null>(null)
  const uidRef = useRef<HTMLInputElement>(null)
  const qtyRef = useRef<HTMLInputElement>(null)

  const submit = async (dupResolution?: "SUM" | "REPLACE" | "REJECT") => {
    const trimmedUid = uid.trim()
    const numQty = parseFloat(qty)
    if (!trimmedUid || isNaN(numQty) || numQty < 0) {
      toast.error("UID and qty are required")
      return
    }
    setSubmitting(true)
    try {
      const body: { uid: string; scanned_qty: number; dup_resolution?: string } = {
        uid: trimmedUid,
        scanned_qty: numQty,
      }
      if (dupResolution) body.dup_resolution = dupResolution
      await api.post(`/physical-counts/${id}/scan`, body)
      toast.success(`Scanned ${trimmedUid}`)
      setUid("")
      setQty("")
      setDupExisting(null)
      setPendingScan(null)
      refetchScans()
      refetchCount()
      setTimeout(() => uidRef.current?.focus(), 50)
    } catch (err) {
      const e = err as { status?: number; body?: { error?: string; existing?: DupExisting[]; message?: string }; message?: string }
      if (e.status === 409 && e.body?.error === "DUPLICATE_UID") {
        setDupExisting(e.body.existing ?? [])
        setPendingScan({ uid: trimmedUid, qty: numQty })
      } else if (e.status === 422 && e.body?.error === "WRONG_CUSTOMER") {
        toast.error(e.body.message ?? "UID belongs to another customer")
        setUid("")
        setQty("")
        setTimeout(() => uidRef.current?.focus(), 50)
      } else {
        toast.error(e.message ?? "Scan failed")
      }
    } finally {
      setSubmitting(false)
    }
  }

  const voidScan = async (scanId: string) => {
    if (!confirm("Void this scan?")) return
    try {
      await api.delete(`/physical-counts/${id}/scans/${scanId}`)
      toast.success("Scan voided")
      refetchScans()
      refetchCount()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to void scan")
    }
  }

  const completeCount = async () => {
    if (!confirm("Complete this count? You cannot add more scans after.")) return
    try {
      await api.post(`/physical-counts/${id}/complete`, {})
      toast.success("Count completed — review discrepancies")
      router.push(`/physical-count/${id}/review`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to complete")
    }
  }

  const isOwner = count?.counted_by === user?.username

  const columns: VirtualGridColumn<ScanWithId>[] = [
    {
      id: "scanned_at",
      header: "Time",
      size: 160,
      sortable: true,
      accessorFn: (s) => s.scanned_at,
      cell: (s) => <span className="text-xs">{new Date(s.scanned_at).toLocaleTimeString()}</span>,
    },
    {
      id: "uid",
      header: "UID",
      size: 180,
      sortable: true,
      filterable: true,
      accessorFn: (s) => s.uid,
      cell: (s) => <span className="font-mono font-medium text-sm">{s.uid}</span>,
    },
    {
      id: "qty",
      header: "Qty",
      size: 100,
      align: "right",
      sortable: true,
      accessorFn: (s) => parseFloat(String(s.scanned_qty)),
      cell: (s) => <span className="font-mono text-sm">{parseFloat(String(s.scanned_qty)).toLocaleString()}</span>,
    },
    {
      id: "matched",
      header: "Match",
      size: 130,
      sortable: true,
      filterable: true,
      accessorFn: (s) => (s.matched_lot_id ? "matched" : "orphan"),
      filterAccessor: (s) => (s.matched_lot_id ? "matched" : "orphan"),
      cell: (s) =>
        s.matched_lot_id ? (
          <Badge variant="default" className="text-xs">matched</Badge>
        ) : (
          <Badge variant="outline" className="text-xs">orphan</Badge>
        ),
    },
    {
      id: "resolution",
      header: "Status",
      size: 110,
      sortable: true,
      filterable: true,
      accessorFn: (s) => s.resolution,
      cell: (s) => <Badge variant="outline" className="text-xs">{s.resolution}</Badge>,
    },
    {
      id: "actions",
      header: "",
      size: 70,
      sortable: false,
      filterable: false,
      accessorFn: () => "",
      cell: (s) =>
        s.resolution !== "REJECTED" && isOwner ? (
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => voidScan(s.id)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        ) : null,
    },
  ]

  if (!count) return <div className="text-muted-foreground">Loading...</div>

  const liveScansCount = (scans ?? []).filter((s) => s.resolution !== "REJECTED").length
  const distinctUidScans = new Set((scans ?? []).filter((s) => s.resolution !== "REJECTED").map((s) => s.uid)).size

  return (
    <div className="space-y-6">
      <Link href={`/physical-count/${id}`}>
        <Button variant="ghost" size="sm">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
      </Link>

      <div>
        <h1 className="text-2xl font-bold">{count.count_number} — Scan</h1>
        <p className="text-muted-foreground text-sm">
          Customer: {count.customer?.name} · Expected lots: {count.total_expected_lots} · Distinct UIDs scanned: {distinctUidScans} · Live scans: {liveScansCount}
        </p>
      </div>

      {isOwner && (
        <Card>
          <CardHeader>
            <CardTitle>New Scan</CardTitle>
            <CardDescription>Scan UID, then enter qty. Enter advances fields and submits.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Input
                ref={uidRef}
                value={uid}
                onChange={(e) => setUid(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); qtyRef.current?.focus() } }}
                placeholder="UID"
                autoFocus
                className="font-mono"
                disabled={submitting}
              />
              <Input
                ref={qtyRef}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit() } }}
                placeholder="Qty"
                type="number"
                className="font-mono"
                disabled={submitting}
              />
            </div>
            <Button onClick={() => submit()} disabled={submitting || !uid.trim() || !qty}>
              {submitting ? "Saving..." : "Record scan"}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Scan log</CardTitle>
            <CardDescription>All scans for this count, newest first.</CardDescription>
          </div>
          {isOwner && (
            <Button onClick={completeCount}>Complete count</Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <VirtualGrid
            data={scans ?? null}
            columns={columns}
            searchPlaceholder="Search by UID..."
            searchFn={(s, q) => s.uid.toLowerCase().includes(q)}
          />
        </CardContent>
      </Card>

      <Dialog open={!!dupExisting} onOpenChange={(open) => { if (!open) { setDupExisting(null); setPendingScan(null) } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Duplicate UID</DialogTitle>
            <DialogDescription>
              UID <span className="font-mono">{pendingScan?.uid}</span> was already scanned. How do you want to handle this scan of qty <span className="font-mono">{pendingScan?.qty}</span>?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <div className="text-muted-foreground">Existing scans:</div>
            {(dupExisting ?? []).map((s) => (
              <div key={s.id} className="flex justify-between border rounded px-2 py-1">
                <span className="font-mono">qty {s.scanned_qty}</span>
                <Badge variant="outline" className="text-xs">{s.resolution}</Badge>
                <span className="text-xs text-muted-foreground">{new Date(s.scanned_at).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => submit("REJECT")}>Reject this scan</Button>
            <Button variant="outline" onClick={() => submit("REPLACE")}>Replace prior</Button>
            <Button onClick={() => submit("SUM")}>Sum with prior</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
