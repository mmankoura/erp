/**
 * Saved views.
 *
 * A view is the whole shape of a grid at a moment — what is filtered, how it is
 * sorted, which columns are showing and how wide they are — under a name the
 * user chose. The daily "open POs for this customer, costs visible, sorted by
 * date" stops being six clicks.
 *
 * Stored in the same `vgrid:<storageKey>:` namespace the grid already uses for
 * remembered widths, so a grid without a `storageKey` simply has no views.
 * Per browser, per user: making views follow a person across machines needs a
 * table on the server, which is a bigger decision than this.
 */

import type { ColumnFiltersState, SortingState, VisibilityState, ColumnSizingState } from "@tanstack/react-table"

export interface GridView {
  name: string
  filters: ColumnFiltersState
  sorting: SortingState
  visibility: VisibilityState
  sizing: ColumnSizingState
  search: string
  filterRow: boolean
}

/** What is written to localStorage. Versioned so a later shape change can migrate rather than throw. */
interface ViewFile {
  version: 1
  views: GridView[]
}

export const viewsKey = (storageKey: string) => `vgrid:${storageKey}:views`

/**
 * Views are picked from a list by eye, so two that differ only in case are a
 * trap. Saving "Open POs" over "open pos" replaces it rather than adding a
 * near-duplicate.
 */
export function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/**
 * Never throws. A corrupt or hand-edited entry yields no views rather than an
 * unrenderable grid — the same bargain the remembered-columns reader makes.
 */
export function parseViews(raw: string | null): GridView[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as ViewFile
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.views)) return []
    return parsed.views.filter(
      (v): v is GridView => !!v && typeof v.name === "string" && v.name.trim() !== ""
    )
  } catch {
    return []
  }
}

export function serializeViews(views: GridView[]): string {
  return JSON.stringify({ version: 1, views } satisfies ViewFile)
}

/** Add or replace by name, keeping the list in the order the user made them. */
export function upsertView(views: GridView[], next: GridView): GridView[] {
  const at = views.findIndex((v) => sameName(v.name, next.name))
  if (at === -1) return [...views, next]
  const copy = [...views]
  copy[at] = next
  return copy
}

export function removeView(views: GridView[], name: string): GridView[] {
  return views.filter((v) => !sameName(v.name, name))
}

export function findView(views: GridView[], name: string): GridView | undefined {
  return views.find((v) => sameName(v.name, name))
}
