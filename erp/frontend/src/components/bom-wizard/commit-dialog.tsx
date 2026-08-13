"use client"

import { useEffect, useMemo, useState } from "react"
import { api, type BomRevision, type BomSource, type Product } from "@/lib/api"
import { useApi } from "@/hooks/use-api"
import { useAuth, UserRole } from "@/contexts/auth-context"
import { extractRows, findWarnings, unrecognisedResourceTypes, RESOURCE_TYPES } from "@/lib/bom-wizard/extract"
import type { ResourceType } from "@/lib/bom-wizard/extract"
import {
  buildCreateItems,
  buildReplaceItems,
  materialLookup,
  partNumbersToResolve,
  type PartNumberResolution,
} from "@/lib/bom-wizard/commit"
import type { WizardGrid } from "@/lib/bom-wizard/types"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { AlertTriangle, CheckCircle2, Loader2, XCircle } from "lucide-react"
import { toast } from "sonner"

type CommitMode = "create" | "replace"

interface CommitDialogProps {
  grid: WizardGrid
  sourceFileName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onCommitted: (revision: BomRevision) => void
}

const today = () => new Date().toISOString().slice(0, 10)

/**
 * The wizard exists for spreadsheets that arrive from a customer, so that is
 * what it records. Typed rather than inlined — the value goes through
 * `@IsEnum(BomSource)` on the way in, where a wrong string is a 400 rather
 * than anything TypeScript would have caught.
 */
const WIZARD_SOURCE: BomSource = "IMPORT_CLIENT"

export function CommitDialog({
  grid,
  sourceFileName,
  open,
  onOpenChange,
  onCommitted,
}: CommitDialogProps) {
  const { hasRole } = useAuth()
  // Matches the @Roles on PUT /bom/revision/:id/items. Creating a revision is
  // ADMIN+MANAGER, so only the destructive path is gated here.
  const canReplace = hasRole(UserRole.ADMIN)

  const [mode, setMode] = useState<CommitMode>("create")
  const [productId, setProductId] = useState<string>("")
  const [revisionNumber, setRevisionNumber] = useState("")
  const [revisionDate, setRevisionDate] = useState(today())
  const [changeSummary, setChangeSummary] = useState("")
  const [isActive, setIsActive] = useState(false)
  const [targetRevisionId, setTargetRevisionId] = useState("")
  const [confirmOverwrite, setConfirmOverwrite] = useState(false)
  const [acceptCase, setAcceptCase] = useState(true)
  const [resourceMapping, setResourceMapping] = useState<Record<string, ResourceType>>({})
  const [resolution, setResolution] = useState<PartNumberResolution | null>(null)
  const [resolving, setResolving] = useState(false)
  const [committing, setCommitting] = useState(false)

  const { data: products } = useApi<Product[]>("/products", { enabled: open })
  const { data: revisions } = useApi<BomRevision[]>(`/bom/product/${productId}`, {
    enabled: open && mode === "replace" && productId !== "",
  })

  const rows = useMemo(() => extractRows(grid), [grid])
  const warnings = useMemo(() => findWarnings(rows), [rows])
  const resourceGroups = useMemo(() => unrecognisedResourceTypes(rows), [rows])

  // Resolve part numbers whenever the dialog opens against a new set of rows.
  useEffect(() => {
    if (!open) return

    setMode("create")
    setConfirmOverwrite(false)
    setResolution(null)
    setRevisionDate(today())
    // Start from the suggestions; the table below is what makes them a choice.
    setResourceMapping(
      Object.fromEntries(resourceGroups.map((g) => [g.raw, g.suggestion]))
    )

    const partNumbers = partNumbersToResolve(rows)
    if (partNumbers.length === 0) {
      setResolution({ matched: [], case_mismatch: [], missing: [] })
      return
    }

    let cancelled = false
    setResolving(true)
    api
      .post<PartNumberResolution>("/materials/resolve-part-numbers", {
        part_numbers: partNumbers,
      })
      .then((result) => !cancelled && setResolution(result))
      .catch((err) => {
        if (cancelled) return
        toast.error(err instanceof Error ? err.message : "Could not look up part numbers")
      })
      .finally(() => !cancelled && setResolving(false))

    return () => {
      cancelled = true
    }
  }, [open, rows, resourceGroups])

  const lookup = useMemo(
    () => (resolution ? materialLookup(resolution, acceptCase) : new Map<string, string>()),
    [resolution, acceptCase]
  )

  const built = useMemo(() => {
    const options = { materialByPartNumber: lookup, resourceMapping }
    return mode === "create"
      ? buildCreateItems(rows, options)
      : buildReplaceItems(rows, options)
  }, [mode, rows, lookup, resourceMapping])

  const targetRevision = revisions?.find((r) => r.id === targetRevisionId)

  const ready =
    !resolving &&
    !committing &&
    built.items.length > 0 &&
    (mode === "create"
      ? productId !== "" && revisionNumber.trim() !== ""
      : targetRevisionId !== "")

  const commit = async () => {
    setCommitting(true)
    try {
      if (mode === "create") {
        const revision = await api.post<BomRevision>("/bom/revision/full", {
          product_id: productId,
          revision_number: revisionNumber.trim(),
          revision_date: revisionDate,
          change_summary: changeSummary.trim() || undefined,
          source: WIZARD_SOURCE,
          source_filename: sourceFileName,
          is_active: isActive,
          items: built.items,
        })
        toast.success(
          `Created revision ${revision.revision_number} with ${built.items.length} lines`
        )
        onCommitted(revision)
      } else {
        const result = await api.put<{ revision: BomRevision; added: number; updated: number; removed: number; unchanged: number }>(
          `/bom/revision/${targetRevisionId}/items`,
          {
            items: built.items,
            confirm_overwrite_with_orders: confirmOverwrite || undefined,
          }
        )
        toast.success(
          `Replaced items: ${result.added} added, ${result.updated} updated, ${result.removed} removed, ${result.unchanged} unchanged`
        )
        onCommitted(result.revision)
      }
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Commit failed")
    } finally {
      setCommitting(false)
    }
  }

  const missingCount = resolution?.missing.length ?? 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Commit to a BOM revision</DialogTitle>
          <DialogDescription>
            {rows.length} lines from {sourceFileName}. Nothing is written until you press
            Commit.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-5 pb-2">
            {/* ---- Mode ---- */}
            <div className="space-y-2">
              <Label>What to do</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setMode("create")}
                  className={`rounded-md border p-3 text-left text-sm ${
                    mode === "create" ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                  }`}
                >
                  <span className="block font-medium">Create a new revision</span>
                  <span className="block text-xs text-muted-foreground">
                    Adds a revision to a product. Nothing existing changes.
                  </span>
                </button>
                <button
                  type="button"
                  disabled={!canReplace}
                  onClick={() => setMode("replace")}
                  className={`rounded-md border p-3 text-left text-sm disabled:opacity-50 disabled:cursor-not-allowed ${
                    mode === "replace" ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                  }`}
                >
                  <span className="block font-medium">
                    Replace an existing revision&apos;s items
                    {!canReplace && <Badge variant="outline" className="ml-2">Admin only</Badge>}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Overwrites every line on the revision you choose.
                  </span>
                </button>
              </div>
            </div>

            {/* ---- Target ---- */}
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Product</Label>
                <Select value={productId} onValueChange={setProductId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pick a product" />
                  </SelectTrigger>
                  <SelectContent>
                    {(products ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.part_number} — {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {mode === "create" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="rev-number">Revision number</Label>
                    <Input
                      id="rev-number"
                      value={revisionNumber}
                      onChange={(e) => setRevisionNumber(e.target.value)}
                      placeholder="V1.4B"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="rev-date">Revision date</Label>
                    <Input
                      id="rev-date"
                      type="date"
                      value={revisionDate}
                      onChange={(e) => setRevisionDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="rev-summary">Change summary (optional)</Label>
                    <Input
                      id="rev-summary"
                      value={changeSummary}
                      onChange={(e) => setChangeSummary(e.target.value)}
                    />
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer sm:col-span-2">
                    <Checkbox
                      checked={isActive}
                      onCheckedChange={(c) => setIsActive(c === true)}
                    />
                    <span className="text-sm">
                      Make this the active revision for the product
                    </span>
                  </label>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>Revision to overwrite</Label>
                    <Select
                      value={targetRevisionId}
                      onValueChange={setTargetRevisionId}
                      disabled={!productId}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={productId ? "Pick a revision" : "Pick a product first"}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {(revisions ?? []).map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.revision_number}
                            {r.is_active ? " (active)" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {targetRevision && (
                    <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                        <div>
                          Every line on <strong>{targetRevision.revision_number}</strong> will be
                          replaced by the {built.items.length} lines below. Lines that match on
                          identity keep their alternates; the rest are deleted.
                        </div>
                      </div>
                    </div>
                  )}

                  <label className="flex items-start gap-2 cursor-pointer">
                    <Checkbox
                      className="mt-0.5"
                      checked={confirmOverwrite}
                      onCheckedChange={(c) => setConfirmOverwrite(c === true)}
                    />
                    <span className="text-sm">
                      Proceed even if orders reference this revision
                      <span className="block text-xs text-muted-foreground">
                        Only ever allowed for orders still in ENTERED. Anything further along is
                        refused whatever this says.
                      </span>
                    </span>
                  </label>
                </div>
              )}
            </div>

            {/* ---- Part numbers ---- */}
            <div className="space-y-2">
              <Label>Part numbers</Label>
              {resolving ? (
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Looking up {partNumbersToResolve(rows).length} part numbers…
                </p>
              ) : resolution ? (
                <div className="space-y-2 text-sm">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary" className="gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      {resolution.matched.length} matched
                    </Badge>
                    {resolution.case_mismatch.length > 0 && (
                      <Badge variant="outline" className="gap-1">
                        {resolution.case_mismatch.length} differ only by case
                      </Badge>
                    )}
                    {missingCount > 0 && (
                      <Badge variant="destructive" className="gap-1">
                        <XCircle className="h-3 w-3" />
                        {missingCount} not in materials
                      </Badge>
                    )}
                  </div>

                  {resolution.case_mismatch.length > 0 && (
                    <label className="flex items-start gap-2 cursor-pointer">
                      <Checkbox
                        className="mt-0.5"
                        checked={acceptCase}
                        onCheckedChange={(c) => setAcceptCase(c === true)}
                      />
                      <span className="text-xs">
                        Use the existing material for part numbers that differ only by case
                        <span className="block text-muted-foreground">
                          e.g. {resolution.case_mismatch[0].part_number} ⇢{" "}
                          {resolution.case_mismatch[0].internal_part_number}. Unchecked, these
                          lines are skipped rather than creating a duplicate material.
                        </span>
                      </span>
                    </label>
                  )}

                  {missingCount > 0 && (
                    <div className="rounded-md border bg-muted/30 p-2">
                      <p className="text-xs text-muted-foreground mb-1">
                        These have no material and will not be imported. Create them in
                        Materials first, then reopen this dialog.
                      </p>
                      <p className="text-xs font-mono break-words">
                        {resolution.missing.slice(0, 30).join(", ")}
                        {missingCount > 30 && ` … and ${missingCount - 30} more`}
                      </p>
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            {/* ---- Resource types ---- */}
            {resourceGroups.length > 0 && (
              <div className="space-y-2">
                <Label>Resource types the BOM enum cannot hold</Label>
                <p className="text-xs text-muted-foreground">
                  Each is mapped onto an enum value, and the file&apos;s own wording is kept in
                  the line&apos;s notes so nothing is lost.
                </p>
                <div className="rounded-md border divide-y">
                  {resourceGroups.map((group) => (
                    <div key={group.raw} className="flex items-center gap-3 px-3 py-2">
                      <span className="font-mono text-sm flex-1 truncate">{group.raw}</span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {group.count} {group.count === 1 ? "line" : "lines"}
                      </span>
                      <Select
                        value={resourceMapping[group.raw] ?? group.suggestion}
                        onValueChange={(v) =>
                          setResourceMapping((prev) => ({ ...prev, [group.raw]: v as ResourceType }))
                        }
                      >
                        <SelectTrigger className="w-28 h-8 shrink-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {RESOURCE_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>
                              {t}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ---- What will not be imported ---- */}
            {built.skipped.length > 0 && (
              <div className="space-y-2">
                <Label className="text-destructive">
                  {built.skipped.length} {built.skipped.length === 1 ? "line" : "lines"} will not
                  be imported
                </Label>
                <ScrollArea className="h-28 rounded-md border">
                  <div className="p-2 space-y-0.5">
                    {built.skipped.map((s) => (
                      <p key={s.srcIndex} className="text-xs">
                        <span className="text-muted-foreground">Row {s.srcIndex + 1}:</span>{" "}
                        {s.reason}
                      </p>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}

            {/* ---- Warnings ---- */}
            {warnings.length > 0 && (
              <div className="space-y-2">
                <Label>
                  {warnings.length} {warnings.length === 1 ? "warning" : "warnings"}
                </Label>
                <p className="text-xs text-muted-foreground">
                  These do not block the commit — they are things worth looking at first.
                </p>
                <ScrollArea className="h-32 rounded-md border">
                  <div className="p-2 space-y-0.5">
                    {warnings.map((w, i) => (
                      <p key={`${w.kind}-${w.srcIndex}-${i}`} className="text-xs">
                        {w.message}
                      </p>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="border-t pt-3">
          <span className="mr-auto text-sm text-muted-foreground">
            {built.items.length} of {rows.length} lines ready
          </span>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={committing}>
            Cancel
          </Button>
          <Button disabled={!ready} onClick={commit}>
            {committing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {mode === "create" ? "Create revision" : "Replace items"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
