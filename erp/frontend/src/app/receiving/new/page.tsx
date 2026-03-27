"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { useApi, useMutation } from "@/hooks/use-api"
import {
  api,
  type PurchaseOrder,
  type Material,
  type Customer,
  type ReceivingSession,
  type ReceivingSessionLine,
  type ReceiveItemResult,
  type PackageType,
} from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
} from "@/components/ui/dialog"
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  ArrowLeft,
  Loader2,
  PackagePlus,
  Flag,
  Scan,
} from "lucide-react"
import { toast } from "sonner"

const PACKAGE_TYPES: PackageType[] = ["REEL", "TUBE", "TRAY", "BAG", "BOX", "BULK", "TR", "OTHER"]

export default function ReceivingNewPage() {
  const router = useRouter()
  const { user } = useAuth()

  // === SESSION STATE ===
  const [session, setSession] = useState<ReceivingSession | null>(null)
  const [sessionLines, setSessionLines] = useState<ReceivingSessionLine[]>([])

  // Session setup form
  const [receiptType, setReceiptType] = useState<"PO" | "CUSTOMER_SUPPLIED">("PO")
  const [poNumber, setPoNumber] = useState("")
  const [loadedPO, setLoadedPO] = useState<PurchaseOrder | null>(null)
  const [packingSlip, setPackingSlip] = useState("")
  const [selectedCustomerId, setSelectedCustomerId] = useState("")
  const [autoRelease, setAutoRelease] = useState(true)
  const startedBy = user?.full_name || ""

  // Item entry form
  const [itemIpn, setItemIpn] = useState("")
  const [itemMpn, setItemMpn] = useState("")
  const [itemManufacturer, setItemManufacturer] = useState("")
  const [itemQty, setItemQty] = useState("")
  const [itemPackageType, setItemPackageType] = useState<PackageType>("TR")
  const [resolvedMaterial, setResolvedMaterial] = useState<Material | null>(null)
  const [amlSuggestions, setAmlSuggestions] = useState<Array<{ id: string; manufacturer: string }>>([])

  // Validation preview
  const [ipnValid, setIpnValid] = useState<boolean | null>(null)
  const [amlValid, setAmlValid] = useState<boolean | null>(null)

  // Flag dialog
  const [flagDialogOpen, setFlagDialogOpen] = useState(false)
  const [flagReason, setFlagReason] = useState("")

  // Pending retries
  const [pendingRetries, setPendingRetries] = useState<Array<{
    dto: any
    client_request_id: string
    ipn: string
  }>>([])

  // Refs for auto-focus chain
  const ipnRef = useRef<HTMLInputElement>(null)
  const mpnRef = useRef<HTMLInputElement>(null)
  const qtyRef = useRef<HTMLInputElement>(null)
  const poInputRef = useRef<HTMLInputElement>(null)

  // Fetch customers for Customer Supplied mode
  const { data: customers } = useApi<Customer[]>("/customers")

  // === PO LOOKUP ===
  const loadPOMutation = useMutation(
    (poNum: string) => api.get<PurchaseOrder>(`/receiving/lookup/po/${poNum}`),
    {
      onSuccess: (po) => {
        setLoadedPO(po)
        toast.success(`Loaded PO ${po.po_number}`)
      },
      onError: (error) => toast.error(error.message),
    }
  )

  // === START SESSION ===
  const startSessionMutation = useMutation(
    (data: any) => api.post<ReceivingSession>("/receiving/sessions", data),
    {
      onSuccess: (s) => {
        setSession(s)
        toast.success(`Session ${s.session_number} started`)
        // Auto-focus IPN field
        setTimeout(() => ipnRef.current?.focus(), 100)
      },
      onError: (error) => toast.error(error.message),
    }
  )

  // === RECEIVE ITEM ===
  const receiveItemMutation = useMutation(
    (data: any) =>
      api.post<ReceiveItemResult>(
        `/receiving/sessions/${session!.id}/receive`,
        data
      ),
    {
      onSuccess: (result) => {
        setSessionLines((prev) => [...prev, result.line])
        if (result.status === "PASS") {
          toast.success(`Received ${result.line.received_ipn} — UID: ${result.uid}`)
        } else {
          toast.warning(
            `Flagged ${result.line.received_ipn} — UID: ${result.uid} (${result.hold_reason_code})`,
          )
        }
        clearItemForm()
        setTimeout(() => ipnRef.current?.focus(), 50)
      },
      onError: (error) => {
        toast.error(error.message)
      },
    }
  )

  // === CLOSE SESSION ===
  const closeSessionMutation = useMutation(
    () => api.post(`/receiving/sessions/${session!.id}/close`),
    {
      onSuccess: () => {
        toast.success("Session closed")
        router.push("/receiving")
      },
      onError: (error) => toast.error(error.message),
    }
  )

  // === IPN LOOKUP (preview) ===
  const lookupIpn = useCallback(async (ipn: string) => {
    if (!ipn.trim()) {
      setResolvedMaterial(null)
      setIpnValid(null)
      return
    }
    try {
      const result = await api.get<{ found: boolean; material?: Material }>(
        `/receiving/lookup/material/${encodeURIComponent(ipn.trim())}`
      )
      if (result.found && result.material) {
        setResolvedMaterial(result.material)
        setIpnValid(true)
      } else {
        setResolvedMaterial(null)
        setIpnValid(false)
      }
    } catch {
      setIpnValid(false)
      setResolvedMaterial(null)
    }
  }, [])

  // === AML LOOKUP (preview) ===
  const lookupAml = useCallback(
    async (mpn: string) => {
      if (!mpn.trim() || !resolvedMaterial) {
        setAmlSuggestions([])
        setAmlValid(null)
        return
      }
      try {
        const results = await api.get<
          Array<{ id: string; manufacturer: string }>
        >(
          `/receiving/lookup/aml-suggestions?material_id=${resolvedMaterial.id}&mpn=${encodeURIComponent(mpn.trim())}${session?.customer_id ? `&customer_id=${session.customer_id}` : ""}`
        )
        setAmlSuggestions(results)
        if (results.length === 1) {
          setItemManufacturer(results[0].manufacturer)
          setAmlValid(true)
        } else if (results.length > 1) {
          setAmlValid(true)
        } else {
          setAmlValid(false)
          setItemManufacturer("")
        }
      } catch {
        setAmlValid(null)
        setAmlSuggestions([])
      }
    },
    [resolvedMaterial, session?.customer_id]
  )

  // Handle IPN field Enter/Tab
  const handleIpnKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault()
      lookupIpn(itemIpn)
      mpnRef.current?.focus()
    }
  }

  // Handle MPN field Enter/Tab
  const handleMpnKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault()
      lookupAml(itemMpn)
      qtyRef.current?.focus()
    }
  }

  const clearItemForm = () => {
    setItemIpn("")
    setItemMpn("")
    setItemManufacturer("")
    setItemQty("")
    setItemPackageType("TR")
    setResolvedMaterial(null)
    setAmlSuggestions([])
    setIpnValid(null)
    setAmlValid(null)
  }

  const handleConfirmReceive = (flagged = false, reason = "") => {
    if (!session || !itemIpn || !itemQty) return
    const clientRequestId = crypto.randomUUID()

    const dto: any = {
      client_request_id: clientRequestId,
      received_ipn: itemIpn.trim(),
      received_mpn: itemMpn.trim() || undefined,
      received_manufacturer: itemManufacturer || undefined,
      quantity_received: parseFloat(itemQty),
      package_type: itemPackageType,
    }

    if (flagged) {
      dto.operator_flagged = true
      dto.operator_flag_reason = reason
    }

    receiveItemMutation.mutate(dto)
  }

  // Handle Ctrl+Enter to submit
  const handleConfirmReceiveRef = useRef(handleConfirmReceive)
  handleConfirmReceiveRef.current = handleConfirmReceive

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "Enter" && session && itemIpn && itemQty) {
        e.preventDefault()
        handleConfirmReceiveRef.current()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [session, itemIpn, itemQty])

  const handleRetry = async (idx: number) => {
    const retry = pendingRetries[idx]
    try {
      const result = await api.post<ReceiveItemResult>(
        `/receiving/sessions/${session!.id}/receive`,
        retry.dto,
      )
      setSessionLines((prev) => [...prev, result.line])
      setPendingRetries((prev) => prev.filter((_, i) => i !== idx))
      toast.success(`Retry successful for ${retry.ipn}`)
    } catch (error) {
      toast.error(`Retry failed: ${(error as Error).message}`)
    }
  }

  const handleStartSession = () => {
    if (!startedBy) {
      toast.error("Please enter your name")
      return
    }

    const data: any = {
      receipt_type: receiptType,
      auto_release_on_pass: autoRelease,
      started_by: startedBy,
    }

    if (receiptType === "PO" && loadedPO) {
      data.po_id = loadedPO.id
      data.supplier_id = loadedPO.supplier_id
    }
    if (receiptType === "CUSTOMER_SUPPLIED") {
      data.customer_id = selectedCustomerId || undefined
      data.packing_slip_number = packingSlip || undefined
    }

    startSessionMutation.mutate(data)
  }

  // Stats
  const passCount = sessionLines.filter(
    (l) => l.validation_status === "PASS"
  ).length
  const flaggedCount = sessionLines.filter(
    (l) => l.validation_status === "FLAGGED"
  ).length

  // ===================== RENDER =====================

  // Session not yet started
  if (!session) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push("/receiving")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Receive Materials</h1>
            <p className="text-muted-foreground">Start a new receiving session</p>
          </div>
        </div>

        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>Session Setup</CardTitle>
            <CardDescription>Configure how items will be received</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Operator Name */}
            <div className="grid gap-2">
              <Label htmlFor="started_by">Operator Name</Label>
              <Input
                id="started_by"
                value={startedBy}
                readOnly
                className="bg-muted"
              />
            </div>

            {/* Receipt Type */}
            <div className="grid gap-2">
              <Label>Receipt Type</Label>
              <Select value={receiptType} onValueChange={(v) => setReceiptType(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PO">Purchase Order</SelectItem>
                  <SelectItem value="CUSTOMER_SUPPLIED">Customer Supplied</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* PO Mode */}
            {receiptType === "PO" && (
              <div className="grid gap-2">
                <Label htmlFor="po_number">PO Number</Label>
                <div className="flex gap-2">
                  <Input
                    id="po_number"
                    ref={poInputRef}
                    value={poNumber}
                    onChange={(e) => setPoNumber(e.target.value)}
                    placeholder="Scan or type PO number"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && poNumber) {
                        loadPOMutation.mutate(poNumber)
                      }
                    }}
                  />
                  <Button
                    onClick={() => loadPOMutation.mutate(poNumber)}
                    disabled={!poNumber || loadPOMutation.isLoading}
                  >
                    {loadPOMutation.isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Load"
                    )}
                  </Button>
                </div>
                {loadedPO && (
                  <div className="mt-2 rounded border p-3 text-sm space-y-1">
                    <p>
                      <strong>{loadedPO.po_number}</strong> — {loadedPO.supplier?.name}
                    </p>
                    <p className="text-muted-foreground">
                      Status: {loadedPO.status} | {loadedPO.lines?.length ?? 0} lines
                    </p>
                    {loadedPO.lines && loadedPO.lines.length > 0 && (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>IPN</TableHead>
                            <TableHead className="text-right">Ordered</TableHead>
                            <TableHead className="text-right">Received</TableHead>
                            <TableHead className="text-right">Remaining</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {loadedPO.lines.map((line) => (
                            <TableRow key={line.id}>
                              <TableCell className="font-mono text-xs">
                                {line.material?.internal_part_number}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {line.quantity_ordered}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {line.quantity_received}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {Number(line.quantity_ordered) - Number(line.quantity_received)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Customer Supplied Mode */}
            {receiptType === "CUSTOMER_SUPPLIED" && (
              <>
                <div className="grid gap-2">
                  <Label>Customer</Label>
                  <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select customer" />
                    </SelectTrigger>
                    <SelectContent>
                      {customers?.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name} ({c.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="packing_slip">Packing Slip #</Label>
                  <Input
                    id="packing_slip"
                    value={packingSlip}
                    onChange={(e) => setPackingSlip(e.target.value)}
                    placeholder="Optional packing slip number"
                  />
                </div>
              </>
            )}

            {/* Auto-release toggle */}
            <div className="flex items-center gap-2">
              <Checkbox
                id="auto_release"
                checked={autoRelease}
                onCheckedChange={(c) => setAutoRelease(c === true)}
              />
              <Label htmlFor="auto_release">
                Auto-release on pass (items move to stock immediately)
              </Label>
            </div>

            {/* Start button */}
            <Button
              onClick={handleStartSession}
              disabled={
                startSessionMutation.isLoading ||
                !startedBy ||
                (receiptType === "PO" && !loadedPO)
              }
              className="w-full"
              size="lg"
            >
              {startSessionMutation.isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Scan className="h-4 w-4 mr-2" />
              )}
              Start Receiving Session
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ===================== SESSION ACTIVE =====================
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push("/receiving")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {session.session_number}
            </h1>
            <p className="text-muted-foreground">
              {receiptType === "PO"
                ? `PO: ${loadedPO?.po_number ?? ""} | Supplier: ${session.supplier?.name ?? ""}`
                : `Customer Supplied${session.customer?.name ? ` — ${session.customer.name}` : ""}`}
              {" | "}Started by {session.started_by}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className="text-sm">
            {passCount} received {flaggedCount > 0 && `(${flaggedCount} flagged)`}
          </Badge>
          <Button
            variant="outline"
            onClick={() => closeSessionMutation.mutate(undefined)}
            disabled={closeSessionMutation.isLoading}
          >
            Close Session
          </Button>
        </div>
      </div>

      {/* Main Content: Item Entry + Session Log */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* LEFT: Item Entry Form + Validation Panel */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PackagePlus className="h-5 w-5" />
              Scan / Enter Item
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* IPN */}
            <div className="grid gap-1">
              <Label htmlFor="ipn">IPN (Internal Part Number)</Label>
              <Input
                id="ipn"
                ref={ipnRef}
                value={itemIpn}
                onChange={(e) => setItemIpn(e.target.value)}
                onKeyDown={handleIpnKeyDown}
                onBlur={() => lookupIpn(itemIpn)}
                placeholder="Scan IPN barcode"
                autoFocus
              />
              <div className="flex items-center gap-2 text-xs min-h-5">
                {ipnValid === true && resolvedMaterial && (
                  <>
                    <CheckCircle className="h-3 w-3 text-green-500" />
                    <span className="text-muted-foreground">
                      {resolvedMaterial.description || resolvedMaterial.internal_part_number}
                    </span>
                  </>
                )}
                {ipnValid === false && (
                  <>
                    <XCircle className="h-3 w-3 text-red-500" />
                    <span className="text-red-500">Material not found</span>
                  </>
                )}
              </div>
            </div>

            {/* MPN */}
            <div className="grid gap-1">
              <Label htmlFor="mpn">MPN (Manufacturer Part Number)</Label>
              <Input
                id="mpn"
                ref={mpnRef}
                value={itemMpn}
                onChange={(e) => setItemMpn(e.target.value)}
                onKeyDown={handleMpnKeyDown}
                onBlur={() => lookupAml(itemMpn)}
                placeholder="Scan MPN barcode"
              />
              <div className="flex items-center gap-2 text-xs min-h-5">
                {amlValid === true && (
                  <>
                    <CheckCircle className="h-3 w-3 text-green-500" />
                    <span className="text-muted-foreground">
                      AML match: {itemManufacturer || "select below"}
                    </span>
                  </>
                )}
                {amlValid === false && (
                  <>
                    <AlertTriangle className="h-3 w-3 text-yellow-500" />
                    <span className="text-yellow-600">Not in AML — will be flagged</span>
                  </>
                )}
              </div>
            </div>

            {/* Manufacturer (auto or select) */}
            {amlSuggestions.length > 1 && (
              <div className="grid gap-1">
                <Label>Manufacturer</Label>
                <Select value={itemManufacturer} onValueChange={setItemManufacturer}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select manufacturer" />
                  </SelectTrigger>
                  <SelectContent>
                    {amlSuggestions.map((s) => (
                      <SelectItem key={s.id} value={s.manufacturer}>
                        {s.manufacturer}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {amlSuggestions.length === 1 && itemManufacturer && (
              <div className="text-sm">
                <Label>Manufacturer</Label>
                <p className="font-medium">{itemManufacturer}</p>
              </div>
            )}

            {/* Qty + Package Type */}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1">
                <Label htmlFor="qty">Quantity</Label>
                <Input
                  id="qty"
                  ref={qtyRef}
                  type="number"
                  step="any"
                  min="0"
                  value={itemQty}
                  onChange={(e) => setItemQty(e.target.value)}
                  placeholder="Qty"
                />
              </div>
              <div className="grid gap-1">
                <Label>Package Type</Label>
                <Select value={itemPackageType} onValueChange={(v) => setItemPackageType(v as PackageType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PACKAGE_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 pt-2">
              <Button
                onClick={() => handleConfirmReceive()}
                disabled={
                  receiveItemMutation.isLoading ||
                  !itemIpn ||
                  !itemQty ||
                  parseFloat(itemQty) <= 0
                }
                className="flex-1"
              >
                {receiveItemMutation.isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <CheckCircle className="h-4 w-4 mr-2" />
                )}
                Confirm & Receive
              </Button>
              <Button
                variant="outline"
                onClick={() => setFlagDialogOpen(true)}
                disabled={
                  receiveItemMutation.isLoading ||
                  !itemIpn ||
                  !itemQty
                }
              >
                <Flag className="h-4 w-4 mr-1" />
                Flag
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Ctrl+Enter to quick submit
            </p>
          </CardContent>
        </Card>

        {/* RIGHT: Session Receipt Log */}
        <Card>
          <CardHeader>
            <CardTitle>Session Log</CardTitle>
            <CardDescription>
              {sessionLines.length} items received
              {flaggedCount > 0 && ` (${flaggedCount} flagged)`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sessionLines.length === 0 && pendingRetries.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No items received yet. Scan an IPN to begin.
              </p>
            ) : (
              <div className="max-h-[500px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>UID</TableHead>
                      <TableHead>IPN</TableHead>
                      <TableHead>MPN</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {/* Pending retries */}
                    {pendingRetries.map((retry, idx) => (
                      <TableRow key={`retry-${idx}`} className="bg-yellow-50 dark:bg-yellow-950/20">
                        <TableCell>-</TableCell>
                        <TableCell>-</TableCell>
                        <TableCell>{retry.ipn}</TableCell>
                        <TableCell>-</TableCell>
                        <TableCell className="text-right">-</TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRetry(idx)}
                          >
                            Retry
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {/* Session lines (newest first) */}
                    {[...sessionLines].reverse().map((line) => (
                      <TableRow
                        key={line.id}
                        className={
                          line.validation_status === "FLAGGED"
                            ? "bg-amber-50 dark:bg-amber-950/20"
                            : ""
                        }
                      >
                        <TableCell className="font-mono text-xs">
                          {line.line_number}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {line.uid}
                        </TableCell>
                        <TableCell className="font-medium text-xs">
                          {line.received_ipn}
                        </TableCell>
                        <TableCell className="text-xs">
                          {line.received_mpn || "-"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {line.quantity_received}
                        </TableCell>
                        <TableCell>
                          {line.validation_status === "PASS" ? (
                            <Badge variant="default" className="text-xs">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Pass
                            </Badge>
                          ) : line.validation_status === "FLAGGED" ? (
                            <Badge variant="secondary" className="bg-amber-100 text-amber-800 text-xs">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Flagged
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">
                              {line.validation_status}
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Flag Dialog */}
      <Dialog open={flagDialogOpen} onOpenChange={setFlagDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Flag Item for Review</DialogTitle>
            <DialogDescription>
              This will force the item into FLAGGED status regardless of validation results.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-4">
            <Label htmlFor="flag_reason">Reason *</Label>
            <Textarea
              id="flag_reason"
              value={flagReason}
              onChange={(e) => setFlagReason(e.target.value)}
              placeholder="Describe why this item needs review..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFlagDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!flagReason.trim()}
              onClick={() => {
                handleConfirmReceive(true, flagReason)
                setFlagDialogOpen(false)
                setFlagReason("")
              }}
            >
              <Flag className="h-4 w-4 mr-1" />
              Flag & Receive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
