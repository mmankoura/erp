"use client"

import { useState } from "react"
import {
  fieldKey,
  MASTER_FIELDS,
  type ConflictChoices,
  type FillEdits,
  type MasterDataPlan,
  type MasterField,
} from "@/lib/bom-wizard/commit"
import { RESOURCE_TYPES } from "@/lib/bom-wizard/extract"
import type { ResourceType } from "@/lib/bom-wizard/extract"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ChevronDown, ChevronRight } from "lucide-react"

const FIELD_LABELS: Record<MasterField, string> = {
  resource_type: "Type",
  description: "Description",
  manufacturer: "Manufacturer",
  manufacturer_pn: "Mfr P/N",
}

interface MasterDataProps {
  plan: MasterDataPlan
  choices: ConflictChoices
  onChoicesChange: (choices: ConflictChoices) => void
  fillEdits: FillEdits
  onFillEditsChange: (edits: FillEdits) => void
  applyFills: boolean
  onApplyFillsChange: (apply: boolean) => void
  /** Matches the @Roles on PATCH /materials/bulk. */
  canUpdate: boolean
  /** Named in the summary — six months on, "from where?" is the question. */
  sourceFileName: string
}

/**
 * Settling the master record while importing.
 *
 * The material is the master, but a great many of them are bare rows the old
 * importer created from a part number alone, so the file being imported is
 * often the only place their description or resource type has ever been
 * written down. Filling those blanks here is what stops a correct import still
 * showing nothing on the product page.
 *
 * REV-012 stopped imports changing master data, and this is a deliberate step
 * back across that line — so it is drawn in full: counted, listed, editable,
 * declinable with one checkbox, incapable of clearing a value, and audited.
 * What that release actually objected to was change that was silent and
 * untraceable, and none of this is either.
 */
export function MasterData({
  plan,
  choices,
  onChoicesChange,
  fillEdits,
  onFillEditsChange,
  applyFills,
  onApplyFillsChange,
  canUpdate,
  sourceFileName,
}: MasterDataProps) {
  const [showFills, setShowFills] = useState(false)

  const { fills, conflicts, kept } = plan
  if (fills.length === 0 && conflicts.length === 0 && kept.length === 0) return null

  const materialsTouched = new Set(fills.map((f) => f.material_id)).size
  const usingFile = conflicts.filter(
    (c) => choices[fieldKey(c.material_id, c.field)] === "file"
  ).length

  const setAll = (choice: "material" | "file") =>
    onChoicesChange(
      Object.fromEntries(conflicts.map((c) => [fieldKey(c.material_id, c.field), choice]))
    )

  if (!canUpdate) {
    return (
      <div className="rounded-md border bg-muted/30 p-2">
        <p className="text-xs text-muted-foreground">
          Materials will not be changed — an Admin or Manager can settle the{" "}
          {fills.length} blank {fills.length === 1 ? "field" : "fields"} this file could fill
          {conflicts.length > 0 && ` and the ${conflicts.length} that disagree`}. The lines
          will still record what the file says.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-md border bg-muted/30 p-2 space-y-3">
      {/* ---- Blanks the file can fill ---- */}
      {fills.length > 0 && (
        <div className="space-y-2">
          <label className="flex items-start gap-2 cursor-pointer">
            <Checkbox
              className="mt-0.5"
              checked={applyFills}
              onCheckedChange={(c) => onApplyFillsChange(c === true)}
            />
            <span className="text-xs">
              Fill {fills.length} blank {fills.length === 1 ? "field" : "fields"} on{" "}
              {materialsTouched} {materialsTouched === 1 ? "material" : "materials"} from{" "}
              <span className="font-mono">{sourceFileName}</span>
              <span className="block text-muted-foreground">
                Only fields the material has nothing in. Nothing already set is touched.
              </span>
            </span>
          </label>

          {applyFills && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-1 text-xs"
                onClick={() => setShowFills((v) => !v)}
              >
                {showFills ? (
                  <ChevronDown className="h-3 w-3 mr-1" />
                ) : (
                  <ChevronRight className="h-3 w-3 mr-1" />
                )}
                {showFills ? "Hide" : "Review"} the values
              </Button>

              {showFills && (
                <div className="max-h-56 overflow-auto rounded-md border bg-background">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                      <tr className="text-left">
                        <th className="px-2 py-1 font-medium">Internal P/N</th>
                        <th className="px-2 py-1 font-medium w-28">Field</th>
                        <th className="px-2 py-1 font-medium">Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {fills.map((fill) => {
                        const key = fieldKey(fill.material_id, fill.field)
                        const value = fillEdits[key] ?? fill.value
                        return (
                          <tr key={key}>
                            <td className="px-2 py-0.5 font-mono truncate max-w-[10rem]">
                              {fill.internal_part_number}
                            </td>
                            <td className="px-2 py-0.5 text-muted-foreground">
                              {FIELD_LABELS[fill.field]}
                            </td>
                            <td className="px-1 py-0.5">
                              {fill.field === "resource_type" ? (
                                <Select
                                  value={value}
                                  onValueChange={(v) =>
                                    onFillEditsChange({ ...fillEdits, [key]: v })
                                  }
                                >
                                  <SelectTrigger className="h-7 text-xs w-28">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {RESOURCE_TYPES.map((t: ResourceType) => (
                                      <SelectItem key={t} value={t}>
                                        {t}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <Input
                                  className="h-7 text-xs"
                                  value={value}
                                  onChange={(e) =>
                                    onFillEditsChange({ ...fillEdits, [key]: e.target.value })
                                  }
                                />
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {showFills && (
                <p className="text-xs text-muted-foreground">
                  Clear a value to leave that field alone.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* ---- Where the file and the material disagree ---- */}
      {conflicts.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium">
              {conflicts.length} {conflicts.length === 1 ? "field disagrees" : "fields disagree"}{" "}
              with the material
            </span>
            <span className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => setAll("material")}
              >
                Use material for all
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => setAll("file")}
              >
                Use file for all
              </Button>
            </span>
          </div>

          <div className="max-h-56 overflow-auto rounded-md border bg-background">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                <tr className="text-left">
                  <th className="px-2 py-1 font-medium">Internal P/N</th>
                  <th className="px-2 py-1 font-medium w-24">Field</th>
                  <th className="px-2 py-1 font-medium">Material says</th>
                  <th className="px-2 py-1 font-medium">File says</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {conflicts.map((conflict) => {
                  const key = fieldKey(conflict.material_id, conflict.field)
                  const choice = choices[key] ?? "material"
                  return (
                    <tr key={key}>
                      <td className="px-2 py-1 font-mono truncate max-w-[9rem]">
                        {conflict.internal_part_number}
                      </td>
                      <td className="px-2 py-1 text-muted-foreground">
                        {FIELD_LABELS[conflict.field]}
                      </td>
                      {(["material", "file"] as const).map((side) => (
                        <td key={side} className="px-1 py-1">
                          <button
                            type="button"
                            onClick={() => onChoicesChange({ ...choices, [key]: side })}
                            className={
                              choice === side
                                ? "w-full text-left rounded border border-primary bg-primary/10 px-2 py-1"
                                : "w-full text-left rounded border border-transparent px-2 py-1 text-muted-foreground hover:bg-muted"
                            }
                          >
                            {side === "material" ? conflict.material_value : conflict.file_value}
                          </button>
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-muted-foreground">
            {usingFile === 0
              ? "The material's value is kept everywhere. Click a value to change that."
              : `${usingFile} of ${conflicts.length} set to use the file.`}
          </p>
        </div>
      )}

      {/* ---- Differences on fields nobody is being asked about ---- */}
      {kept.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {kept.length} other {kept.length === 1 ? "field differs" : "fields differ"} (
          {Array.from(new Set(kept.map((k) => FIELD_LABELS[k.field]))).join(", ")}). The
          material&apos;s value is kept.
        </p>
      )}
    </div>
  )
}

/** Re-exported so the dialog can label its summary without importing the map twice. */
export { FIELD_LABELS as MASTER_FIELD_LABELS, MASTER_FIELDS }
