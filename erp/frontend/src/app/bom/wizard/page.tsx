"use client"

/**
 * The BOM Formatting Wizard.
 *
 * The page owns exactly one piece of state — a `WizardDoc` of `{source,
 * actions, cursor}` — and the grid on screen is always `replay(source,
 * appliedActions(doc))`. Nothing here mutates a grid. Every button either
 * records an action or moves the cursor, which is what makes Undo, Redo and
 * (once the recorder panel lands) deleting a step from the middle all the same
 * operation.
 */

import { Suspense, useCallback, useMemo, useRef, useState } from "react"
import { replay } from "@/lib/bom-wizard/apply"
import {
  appliedActions,
  canRedo,
  canUndo,
  emptyDoc,
  goTo,
  loadRecipe,
  record,
  redo,
  removeAction,
  setComment,
  undo,
} from "@/lib/bom-wizard/doc"
import { readBomFile } from "@/lib/bom-wizard/parse"
import type { BomRevision } from "@/lib/api"
import type {
  GridAction,
  RecordedAction,
  WizardDoc,
  WizardRow,
  WizardSource,
} from "@/lib/bom-wizard/types"
import { WizardGridView } from "@/components/bom-wizard/wizard-grid"
import { RecorderPanel } from "@/components/bom-wizard/recorder-panel"
import { CommitDialog } from "@/components/bom-wizard/commit-dialog"
import { LoadRecipeDialog, SaveRecipeDialog } from "@/components/bom-wizard/recipe-dialogs"
import {
  FillDownDialog,
  HeaderRowDialog,
  MappingDialog,
  MergeReferencesDialog,
} from "@/components/bom-wizard/action-dialogs"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ArrowDownToLine,
  Check,
  Columns3,
  FileUp,
  FolderOpen,
  Heading,
  Merge,
  Redo2,
  Save,
  Undo2,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { useRouter, useSearchParams } from "next/navigation"
import { newId } from "@/lib/utils"

type DialogKind =
  | "headers"
  | "fill"
  | "merge"
  | "mapping"
  | "commit"
  | "save-recipe"
  | "load-recipe"
  | null

function BomWizardScreen() {
  // Set when the wizard was reached from a product's Import BOM button, so the
  // commit dialog opens on that product instead of an empty picker.
  const productId = useSearchParams().get("product") ?? undefined
  const router = useRouter()

  /**
   * A commit is the end of the job, so the wizard gets out of the way and
   * hands over to the revision it just wrote — deep-linked, so the page opens
   * on that revision rather than defaulting to whichever one is active.
   */
  const onCommitted = useCallback(
    (revision: BomRevision) => {
      setDialog(null)
      router.push(`/products/${revision.product_id}?revision=${revision.id}`)
    },
    [router]
  )

  const [sheets, setSheets] = useState<WizardSource[] | null>(null)
  const [doc, setDoc] = useState<WizardDoc | null>(null)
  const [dialog, setDialog] = useState<DialogKind>(null)
  /** Last row double-clicked, offered as the default when picking a header row. */
  const [activatedRow, setActivatedRow] = useState<number | undefined>(undefined)
  const fileInput = useRef<HTMLInputElement>(null)

  // The one derivation that matters: the grid is a fold, never a mutated copy.
  const grid = useMemo(
    () => (doc ? replay(doc.source, appliedActions(doc)) : null),
    [doc]
  )

  const openFile = async (file: File) => {
    try {
      const parsed = await readBomFile(file)
      const usable = parsed.sheets.filter((s) => s.matrix.length > 0)
      setSheets(usable)
      setDoc(emptyDoc(usable[0]))
      setActivatedRow(undefined)
      toast.success(
        `Loaded ${file.name}${usable.length > 1 ? ` — ${usable.length} sheets` : ""}`
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not read that file")
    }
  }

  const pickSheet = (sheetName: string) => {
    const sheet = sheets?.find((s) => s.sheetName === sheetName)
    if (!sheet) return
    // Switching sheets starts a new document: the actions recorded so far
    // address rows and columns of the sheet they were recorded against.
    setDoc(emptyDoc(sheet))
    setActivatedRow(undefined)
  }

  const onRecord = useCallback((action: GridAction) => {
    setDoc((prev) =>
      prev
        ? record(prev, action, {
            id: newId(),
            recorded_at: new Date().toISOString(),
          })
        : prev
    )
  }, [])

  const onRowActivate = useCallback((row: WizardRow) => setActivatedRow(row.srcIndex), [])

  const onGoTo = useCallback((cursor: number) => {
    setDoc((prev) => (prev ? goTo(prev, cursor) : prev))
  }, [])

  const onRemove = useCallback((id: string) => {
    setDoc((prev) => (prev ? removeAction(prev, id) : prev))
  }, [])

  const onComment = useCallback((id: string, comment: string) => {
    setDoc((prev) => (prev ? setComment(prev, id, comment) : prev))
  }, [])

  const onLoadRecipe = useCallback((actions: RecordedAction[], name: string) => {
    setDoc((prev) => (prev ? loadRecipe(prev, actions) : prev))
    toast.success(`Loaded "${name}" — ${actions.length} steps applied`)
  }, [])

  const close = () => {
    setSheets(null)
    setDoc(null)
    setDialog(null)
    setActivatedRow(undefined)
    if (fileInput.current) fileInput.current.value = ""
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">BOM Formatting Wizard</h1>
          <p className="text-muted-foreground">
            Reshape a supplier&apos;s spreadsheet into importable BOM lines, recording each
            step so the same cleanup can be replayed on the next revision.
          </p>
        </div>
        {doc && (
          <Button variant="outline" onClick={close}>
            <X className="h-4 w-4 mr-2" />
            Close file
          </Button>
        )}
      </div>

      <input
        ref={fileInput}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void openFile(file)
        }}
      />

      {!doc || !grid ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-4 py-20 text-center">
            <FileUp className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-medium">Open a BOM file to begin</p>
              <p className="text-sm text-muted-foreground">
                Excel or CSV. The file is read in your browser and nothing is saved until
                you commit.
              </p>
            </div>
            <Button onClick={() => fileInput.current?.click()}>
              <FileUp className="h-4 w-4 mr-2" />
              Choose file
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px] items-start">
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium truncate max-w-[16rem]">
                  {doc.source.fileName}
                </span>

                {sheets && sheets.length > 1 ? (
                  <Select value={doc.source.sheetName} onValueChange={pickSheet}>
                    <SelectTrigger className="h-8 w-52">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {sheets.map((s) => (
                        <SelectItem key={s.sheetName} value={s.sheetName}>
                          {s.sheetName}
                          <span className="ml-2 text-xs text-muted-foreground">
                            {s.matrix.length} rows
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge variant="secondary">{doc.source.sheetName}</Badge>
                )}

                <Badge variant="outline">
                  {grid.rows.length} of {doc.source.matrix.length} rows
                </Badge>

                <div className="flex-1" />

                {/* The step count lives in the recorder panel, not here. */}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!canUndo(doc)}
                  onClick={() => setDoc(undo(doc))}
                >
                  <Undo2 className="h-4 w-4 mr-2" />
                  Undo
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!canRedo(doc)}
                  onClick={() => setDoc(redo(doc))}
                >
                  <Redo2 className="h-4 w-4 mr-2" />
                  Redo
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                <Button variant="outline" size="sm" onClick={() => setDialog("headers")}>
                  <Heading className="h-4 w-4 mr-2" />
                  Use row as headers
                </Button>
                <Button variant="outline" size="sm" onClick={() => setDialog("fill")}>
                  <ArrowDownToLine className="h-4 w-4 mr-2" />
                  Fill down
                </Button>
                <Button variant="outline" size="sm" onClick={() => setDialog("merge")}>
                  <Merge className="h-4 w-4 mr-2" />
                  Merge continuation rows
                </Button>
                <Button variant="outline" size="sm" onClick={() => setDialog("mapping")}>
                  <Columns3 className="h-4 w-4 mr-2" />
                  Map columns
                </Button>

                <div className="flex-1" />

                <Button variant="ghost" size="sm" onClick={() => setDialog("load-recipe")}>
                  <FolderOpen className="h-4 w-4 mr-2" />
                  Load recipe
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={doc.actions.length === 0}
                  onClick={() => setDialog("save-recipe")}
                >
                  <Save className="h-4 w-4 mr-2" />
                  Save recipe
                </Button>

                <Button size="sm" onClick={() => setDialog("commit")}>
                  <Check className="h-4 w-4 mr-2" />
                  Commit…
                </Button>
              </div>

              <WizardGridView grid={grid} height={620} onRowActivate={onRowActivate} />
            </CardContent>
          </Card>

          <RecorderPanel
            doc={doc}
            onGoTo={onGoTo}
            onRemove={onRemove}
            onComment={onComment}
          />
        </div>
      )}

      {doc && grid && (
        <>
          <HeaderRowDialog
            grid={grid}
            open={dialog === "headers"}
            onOpenChange={(open) => setDialog(open ? "headers" : null)}
            onRecord={onRecord}
            defaultRow={activatedRow}
          />
          <FillDownDialog
            grid={grid}
            open={dialog === "fill"}
            onOpenChange={(open) => setDialog(open ? "fill" : null)}
            onRecord={onRecord}
          />
          <MergeReferencesDialog
            grid={grid}
            open={dialog === "merge"}
            onOpenChange={(open) => setDialog(open ? "merge" : null)}
            onRecord={onRecord}
          />
          <MappingDialog
            grid={grid}
            open={dialog === "mapping"}
            onOpenChange={(open) => setDialog(open ? "mapping" : null)}
            onRecord={onRecord}
          />
          <CommitDialog
            grid={grid}
            sourceFileName={doc.source.fileName}
            open={dialog === "commit"}
            onOpenChange={(open) => setDialog(open ? "commit" : null)}
            onCommitted={onCommitted}
            defaultProductId={productId}
          />
          <SaveRecipeDialog
            actions={doc.actions}
            open={dialog === "save-recipe"}
            onOpenChange={(open) => setDialog(open ? "save-recipe" : null)}
          />
          <LoadRecipeDialog
            open={dialog === "load-recipe"}
            onOpenChange={(open) => setDialog(open ? "load-recipe" : null)}
            onLoad={onLoadRecipe}
          />
        </>
      )}
    </div>
  )
}

/**
 * `useSearchParams` opts a route into client rendering unless it sits under a
 * Suspense boundary, which would otherwise fail the production build for this
 * statically prerendered page.
 */
export default function BomWizardPage() {
  return (
    <Suspense fallback={<div className="text-muted-foreground">Loading…</div>}>
      <BomWizardScreen />
    </Suspense>
  )
}
