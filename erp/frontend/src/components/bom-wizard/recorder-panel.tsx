"use client"

import { useEffect, useMemo, useState } from "react"
import { applyAction, gridFromSource } from "@/lib/bom-wizard/apply"
import { describeAction } from "@/lib/bom-wizard/describe"
import type { ActionDescription } from "@/lib/bom-wizard/describe"
import type { WizardDoc } from "@/lib/bom-wizard/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { FileText, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface RecorderPanelProps {
  doc: WizardDoc
  onGoTo: (cursor: number) => void
  onRemove: (id: string) => void
  onComment: (id: string, comment: string) => void
}

/**
 * The Comments column.
 *
 * Holds its own text and reports on blur rather than on every keystroke:
 * committing per character would change the doc, which re-folds the whole grid
 * behind it — several hundred rows of work to record one letter.
 */
function CommentInput({
  value,
  onCommit,
}: {
  value: string
  onCommit: (next: string) => void
}) {
  const [draft, setDraft] = useState(value)

  // Follow the doc when it changes underneath — an undo, or a recipe load.
  useEffect(() => setDraft(value), [value])

  return (
    <Input
      value={draft}
      placeholder="Why this step…"
      className="h-7 text-xs"
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onCommit(draft)}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur()
        if (e.key === "Escape") {
          setDraft(value)
          e.currentTarget.blur()
        }
      }}
    />
  )
}

export function RecorderPanel({ doc, onGoTo, onRemove, onComment }: RecorderPanelProps) {
  /**
   * The grid as it stood *before* each action, which is the only state where
   * that action's arguments still resolve — see `describe.ts`. One replay per
   * step; action lists are short and the alternative is describing a deleted
   * column by its raw id.
   */
  const descriptions = useMemo(() => {
    const out: ActionDescription[] = []
    let grid = gridFromSource(doc.source)
    for (const recorded of doc.actions) {
      out.push(describeAction(recorded.action, grid))
      grid = applyAction(grid, recorded.action)
    }
    return out
  }, [doc.source, doc.actions])

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Recorded steps</CardTitle>
          <Badge variant="secondary">
            {doc.cursor} of {doc.actions.length}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Click a step to see the grid as it stood there. Deleting one replays the rest
          without it.
        </p>
      </CardHeader>

      <CardContent className="flex-1 p-0">
        <div className="h-[560px] overflow-y-auto">
          <div className="px-4 pb-4 space-y-1">
            {/* Position 0 — the file before anything ran. */}
            <button
              type="button"
              onClick={() => onGoTo(0)}
              className={cn(
                "w-full flex items-center gap-2 rounded-md border px-3 py-2 text-left transition-colors",
                doc.cursor === 0
                  ? "border-primary bg-primary/5"
                  : "border-transparent hover:bg-muted/50"
              )}
            >
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="min-w-0">
                <span className="block text-sm font-medium">Source file</span>
                <span className="block text-xs text-muted-foreground truncate">
                  {doc.source.matrix.length} rows, untouched
                </span>
              </span>
            </button>

            {doc.actions.map((recorded, i) => {
              const applied = i < doc.cursor
              const isCurrent = doc.cursor === i + 1
              const { title, detail } = descriptions[i]

              return (
                <div
                  key={recorded.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onGoTo(i + 1)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      onGoTo(i + 1)
                    }
                  }}
                  className={cn(
                    "w-full rounded-md border px-3 py-2 space-y-1.5 cursor-pointer transition-colors",
                    isCurrent
                      ? "border-primary bg-primary/5"
                      : "border-transparent hover:bg-muted/50",
                    // Undone steps stay listed but read as inactive — they are
                    // still part of the recipe, just not folded in yet.
                    !applied && "opacity-50"
                  )}
                >
                  <div className="flex items-start gap-2">
                    <span
                      className={cn(
                        "shrink-0 mt-0.5 h-5 w-5 rounded-full text-[11px] font-medium grid place-items-center",
                        applied
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {i + 1}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{title}</span>
                      <span className="block text-xs text-muted-foreground break-words">
                        {detail}
                      </span>
                    </span>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                      title="Delete this step"
                      onClick={(e) => {
                        e.stopPropagation()
                        onRemove(recorded.id)
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  <CommentInput
                    value={recorded.comment ?? ""}
                    onCommit={(next) => onComment(recorded.id, next)}
                  />
                </div>
              )
            })}

            {doc.actions.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                Nothing recorded yet. Every action you run from the toolbar lands here, in
                order, ready to be saved as a recipe.
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
