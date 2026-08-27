"use client"

import { useEffect, useState } from "react"
import { api, type Material } from "@/lib/api"
import {
  buildMaterialDrafts,
  materialPayloads,
  type MaterialDraft,
} from "@/lib/bom-wizard/commit"
import { RESOURCE_TYPES } from "@/lib/bom-wizard/extract"
import type { ExtractedRow, ResourceType } from "@/lib/bom-wizard/extract"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

/** Radix Select has no empty value, so "the file did not say" needs a name. */
const NO_TYPE = "__none__"

interface MissingMaterialsProps {
  rows: ExtractedRow[]
  /** Part numbers resolution could not find, in its own order. */
  missing: string[]
  resourceMapping: Record<string, ResourceType>
  /** Materials belong to a customer; this comes from the selected product. */
  customerId: string
  /** Matches the @Roles on POST /materials/bulk. */
  canCreate: boolean
  /** Re-resolve, so the new materials stop being missing. */
  onCreated: () => void
}

/**
 * The missing part numbers, as materials waiting to be created.
 *
 * REV-012 refused to create materials from an import at all, because the old
 * importer's habit of inventing them mid-import is what made a bad BOM
 * expensive to unpick. That reasoning holds; what it got wrong was leaving the
 * user to hand-key thirty materials in another screen and come back. So the
 * creation is here, but it is a deliberate step with everything visible and
 * editable first — not a silent side effect of pressing Commit.
 */
export function MissingMaterials({
  rows,
  missing,
  resourceMapping,
  customerId,
  canCreate,
  onCreated,
}: MissingMaterialsProps) {
  const [reviewing, setReviewing] = useState(false)
  const [drafts, setDrafts] = useState<MaterialDraft[]>([])
  const [creating, setCreating] = useState(false)

  // Reseed whenever the missing set changes — creating some of them leaves the
  // rest, and those should come back with the file's values, not last edit's.
  useEffect(() => {
    setDrafts(buildMaterialDrafts(rows, missing, resourceMapping))
    setReviewing(false)
  }, [rows, missing, resourceMapping])

  const update = (index: number, patch: Partial<MaterialDraft>) => {
    setDrafts((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)))
  }

  const blank = drafts.filter((d) => !d.internal_part_number.trim()).length

  const create = async () => {
    setCreating(true)
    try {
      const result = await api.post<{
        created: Material[]
        errors: { partNumber: string; error: string }[]
      }>("/materials/bulk", { materials: materialPayloads(drafts, customerId) })

      if (result.created.length > 0) {
        toast.success(
          `Created ${result.created.length} ${result.created.length === 1 ? "material" : "materials"}`
        )
      }
      // Reported rather than thrown: the endpoint creates what it can and hands
      // back the rest, so a single clash must not lose the ones that worked.
      if (result.errors.length > 0) {
        toast.warning(
          `${result.errors.length} could not be created: ${result.errors
            .slice(0, 3)
            .map((e) => `${e.partNumber} (${e.error})`)
            .join(", ")}${result.errors.length > 3 ? " …" : ""}`
        )
      }
      onCreated()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the materials")
    } finally {
      setCreating(false)
    }
  }

  if (missing.length === 0) return null

  return (
    <div className="rounded-md border bg-muted/30 p-2 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {canCreate
            ? "These have no material yet. Create them here and their lines will import."
            : "These have no material, so their lines will not be imported. An Admin or Manager can create them."}
        </p>
        {canCreate && !reviewing && (
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 h-7"
            disabled={customerId === ""}
            title={customerId === "" ? "Pick a product first — the customer comes from it" : undefined}
            onClick={() => setReviewing(true)}
          >
            Review and create {missing.length}
          </Button>
        )}
      </div>

      {!reviewing && (
        <p className="text-xs font-mono break-words">
          {missing.slice(0, 30).join(", ")}
          {missing.length > 30 && ` … and ${missing.length - 30} more`}
        </p>
      )}

      {reviewing && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Seeded from the file. Check them before creating — a typo here becomes a part
            number.
          </p>

          <div className="max-h-64 overflow-auto rounded-md border bg-background">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                <tr className="text-left">
                  <th className="px-2 py-1 font-medium">Internal P/N</th>
                  <th className="px-2 py-1 font-medium">Description</th>
                  <th className="px-2 py-1 font-medium">Manufacturer</th>
                  <th className="px-2 py-1 font-medium">Mfr P/N</th>
                  <th className="px-2 py-1 font-medium w-24">Type</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {drafts.map((draft, index) => (
                  <tr key={draft.internal_part_number || index}>
                    <td className="px-1 py-0.5">
                      <Input
                        className="h-7 text-xs font-mono"
                        value={draft.internal_part_number}
                        onChange={(e) => update(index, { internal_part_number: e.target.value })}
                      />
                    </td>
                    <td className="px-1 py-0.5">
                      <Input
                        className="h-7 text-xs"
                        value={draft.description}
                        onChange={(e) => update(index, { description: e.target.value })}
                      />
                    </td>
                    <td className="px-1 py-0.5">
                      <Input
                        className="h-7 text-xs"
                        value={draft.manufacturer}
                        onChange={(e) => update(index, { manufacturer: e.target.value })}
                      />
                    </td>
                    <td className="px-1 py-0.5">
                      <Input
                        className="h-7 text-xs font-mono"
                        value={draft.manufacturer_pn}
                        onChange={(e) => update(index, { manufacturer_pn: e.target.value })}
                      />
                    </td>
                    <td className="px-1 py-0.5">
                      <Select
                        value={draft.resource_type || NO_TYPE}
                        onValueChange={(v) =>
                          update(index, {
                            resource_type: v === NO_TYPE ? "" : (v as ResourceType),
                          })
                        }
                      >
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_TYPE}>—</SelectItem>
                          {RESOURCE_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>
                              {t}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {blank > 0
                ? `${blank} ${blank === 1 ? "row has" : "rows have"} no part number and cannot be created`
                : `Customer taken from the selected product.`}
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                className="h-7"
                disabled={creating}
                onClick={() => setReviewing(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-7"
                disabled={creating || blank > 0 || customerId === ""}
                onClick={create}
              >
                {creating && <Loader2 className="h-3 w-3 animate-spin" />}
                Create {drafts.length} {drafts.length === 1 ? "material" : "materials"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
