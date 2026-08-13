"use client"

import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import { useApi } from "@/hooks/use-api"
import { useAuth, UserRole } from "@/contexts/auth-context"
import {
  parseActions,
  parseRecipeFile,
  recipeFileName,
  toRecipeFile,
  SCHEMA_VERSION,
  type StoredRecipe,
} from "@/lib/bom-wizard/recipes"
import type { RecordedAction } from "@/lib/bom-wizard/types"
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
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Loader2, Trash2 } from "lucide-react"
import { toast } from "sonner"

/** Ids for actions arriving from a file or an older save that lacks them. */
const makeId = (index: number) => `imported-${index}-${crypto.randomUUID().slice(0, 8)}`

/**
 * Matches the @Roles on POST/PATCH/DELETE /bom/wizard/recipes. Reading them is
 * open to everyone, so loading, exporting and importing stay available — only
 * writing to the shared list is gated.
 */
const useCanManageRecipes = () => useAuth().hasRole(UserRole.ADMIN, UserRole.MANAGER)

// =============== Save ===============

export function SaveRecipeDialog({
  actions,
  open,
  onOpenChange,
  defaultName,
}: {
  actions: RecordedAction[]
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultName?: string
}) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [saving, setSaving] = useState(false)
  const canManage = useCanManageRecipes()

  const { data: existing } = useApi<StoredRecipe[]>("/bom/wizard/recipes", { enabled: open })

  useEffect(() => {
    if (open) {
      setName(defaultName ?? "")
      setDescription("")
    }
  }, [open, defaultName])

  const clash = existing?.find((r) => r.name.trim().toLowerCase() === name.trim().toLowerCase())

  const save = async () => {
    setSaving(true)
    try {
      if (clash) {
        await api.patch(`/bom/wizard/recipes/${clash.id}`, {
          description: description.trim() || undefined,
          schema_version: SCHEMA_VERSION,
          actions,
        })
        toast.success(`Updated "${clash.name}"`)
      } else {
        await api.post("/bom/wizard/recipes", {
          name: name.trim(),
          description: description.trim() || undefined,
          schema_version: SCHEMA_VERSION,
          actions,
        })
        toast.success(`Saved "${name.trim()}"`)
      }
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the recipe")
    } finally {
      setSaving(false)
    }
  }

  const download = () => {
    const file = toRecipeFile(name || "bom-recipe", description, actions)
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = recipeFileName(file.name)
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Save these steps as a recipe</DialogTitle>
          <DialogDescription>
            {actions.length} {actions.length === 1 ? "step" : "steps"}. A recipe holds the
            transformation only — no data from this file — so it can be replayed on next
            month&apos;s.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="recipe-name">Name</Label>
            <Input
              id="recipe-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="AEGIS wrapped BOM"
            />
            {clash && (
              <p className="text-xs text-muted-foreground">
                A recipe called &ldquo;{clash.name}&rdquo; already exists — saving will replace
                its steps.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="recipe-description">Description (optional)</Label>
            <Textarea
              id="recipe-description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Which supplier's format this handles, and anything odd about it."
            />
          </div>
        </div>

        <DialogFooter className="sm:justify-between">
          <Button variant="outline" onClick={download} disabled={actions.length === 0}>
            Export to file
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              disabled={!name.trim() || actions.length === 0 || saving || !canManage}
              title={canManage ? undefined : "Saving a shared recipe needs Manager or Admin"}
              onClick={save}
            >
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {clash ? "Replace steps" : "Save recipe"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// =============== Load ===============

export function LoadRecipeDialog({
  open,
  onOpenChange,
  onLoad,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onLoad: (actions: RecordedAction[], name: string) => void
}) {
  const { data: recipes, isLoading, refetch } = useApi<StoredRecipe[]>("/bom/wizard/recipes", {
    enabled: open,
  })
  const [busy, setBusy] = useState(false)
  const canManage = useCanManageRecipes()

  /** Validate before applying: the server stores actions opaquely. */
  const apply = (recipe: StoredRecipe) => {
    const result = parseActions(recipe.actions, makeId)
    if ("error" in result) {
      toast.error(`"${recipe.name}" cannot be replayed — ${result.error}`)
      return
    }
    onLoad(result.actions, recipe.name)
    onOpenChange(false)
  }

  const remove = async (recipe: StoredRecipe) => {
    setBusy(true)
    try {
      await api.delete(`/bom/wizard/recipes/${recipe.id}`)
      toast.success(`Deleted "${recipe.name}"`)
      await refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete the recipe")
    } finally {
      setBusy(false)
    }
  }

  const importFile = async (file: File) => {
    const result = parseRecipeFile(await file.text(), makeId)
    if ("error" in result) {
      toast.error(result.error)
      return
    }
    onLoad(result.recipe.actions, result.recipe.name)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Load a recipe</DialogTitle>
          <DialogDescription>
            Replaces the steps recorded so far. The file stays as it is — only the
            transformation changes.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-72 rounded-md border">
          <div className="p-2 space-y-1">
            {isLoading && (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">Loading…</p>
            )}

            {!isLoading && (recipes ?? []).length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                No saved recipes yet. Record some steps and save them, or import a file below.
              </p>
            )}

            {(recipes ?? []).map((recipe) => (
              <div
                key={recipe.id}
                className="flex items-start gap-2 rounded-md px-3 py-2 hover:bg-muted/50"
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => apply(recipe)}
                >
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{recipe.name}</span>
                    <Badge variant="secondary" className="shrink-0">
                      {recipe.actions.length}{" "}
                      {recipe.actions.length === 1 ? "step" : "steps"}
                    </Badge>
                  </span>
                  {recipe.description && (
                    <span className="block text-xs text-muted-foreground truncate">
                      {recipe.description}
                    </span>
                  )}
                </button>
                {canManage && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                    title="Delete this recipe"
                    disabled={busy}
                    onClick={() => remove(recipe)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="space-y-2">
          <Label htmlFor="recipe-import">Or import a recipe file</Label>
          <Input
            id="recipe-import"
            type="file"
            accept=".json,.bomrecipe.json"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void importFile(file)
              e.target.value = ""
            }}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
