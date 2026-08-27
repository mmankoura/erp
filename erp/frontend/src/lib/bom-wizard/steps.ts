/**
 * Which step of the import the user is on, derived rather than stored.
 *
 * The wizard's document is already the source of truth for what has been done,
 * so asking it is better than keeping a parallel counter that can disagree with
 * it. Undo, Redo, "delete the third step" and "load a recipe" then need no
 * special handling at all: they change the document, and the flow follows.
 *
 * The single exception is `skipped`, which is intent rather than fact. Skipping
 * a step leaves no trace in the document — it cannot, because a recipe replayed
 * on a different file should not inherit somebody's decision to skip a step
 * that file does need. So it lives in the page and is passed in here.
 */

import { appliedActions } from "./doc"
import { columnFor } from "./apply"
import { REQUIRED_FIELDS, fieldMeta } from "./fields"
import type { GridAction, WizardDoc, WizardGrid } from "./types"

export type StepId = "file" | "headers" | "merge" | "mapping" | "commit"

export type StepStatus =
  /** Satisfied by the document. */
  | "done"
  /** The step to act on. */
  | "current"
  /** Reachable, but not yet. */
  | "todo"
  /** The user passed on it. */
  | "skipped"
  /** This file has nothing for it to do — established by fact, not guess. */
  | "not-needed"

export interface StepState {
  id: StepId
  /** 1-based, for display. */
  index: number
  label: string
  required: boolean
  status: StepStatus
  /** Why it is not done, or what it would do. Shown as a tooltip. */
  hint?: string
}

export const STEP_ORDER: StepId[] = ["file", "headers", "merge", "mapping", "commit"]

/** The steps a user may pass on. Mapping is the only one the commit truly needs. */
export const OPTIONAL_STEPS: StepId[] = ["headers", "merge"]

const LABELS: Record<StepId, string> = {
  file: "Open file",
  headers: "Set headers",
  merge: "Merge continuation rows",
  mapping: "Map columns",
  commit: "Commit",
}

/**
 * The required fields with no column behind them.
 *
 * This is what a greyed Commit button should have been saying all along.
 * Without it the user sees "0 of 3,412 lines ready" and is never told the cause
 * is one unmapped column.
 */
export function commitBlockers(grid: WizardGrid | null): string[] {
  if (!grid) return ["No file is open"]
  return REQUIRED_FIELDS.filter((field) => columnFor(grid, field) === undefined).map(
    (field) => `${fieldMeta(field)?.label ?? field} is not mapped to a column`
  )
}

export interface DeriveInput {
  doc: WizardDoc | null
  grid: WizardGrid | null
  skipped: ReadonlySet<StepId>
  /**
   * Whether a merge would collapse anything on this file. Undefined while it is
   * unknown; `false` marks the step "not needed" rather than merely undone.
   */
  mergeNeeded?: boolean
}

/**
 * Every step, in order, with the one the user should act on marked `current`.
 *
 * A step satisfied *after* the current one keeps its tick. Undoing past the
 * header action makes Set headers current again without blanking the mapping
 * the user already earned — the flow walks back, the work does not evaporate.
 */
export function deriveSteps({ doc, grid, skipped, mergeNeeded }: DeriveInput): StepState[] {
  const applied = doc ? appliedActions(doc) : []
  const blockers = commitBlockers(grid)

  const satisfied: Record<StepId, boolean> = {
    file: doc !== null,
    // Read off the grid, not the action list, so an undo or a deleted step
    // un-completes it by itself — and a loaded recipe completes it.
    headers: grid?.headerRowIndex != null,
    merge: applied.some((a) => a.type === "merge_references"),
    mapping: grid !== null && blockers.length === 0,
    // Committing navigates away; nothing in-session can satisfy it.
    commit: false,
  }

  // A step the user skipped and then did anyway is done, not skipped.
  const passedOver = (id: StepId) => skipped.has(id) && !satisfied[id]
  const notNeeded = (id: StepId) => id === "merge" && mergeNeeded === false && !satisfied[id]

  const current =
    STEP_ORDER.find((id) => !satisfied[id] && !passedOver(id) && !notNeeded(id)) ?? "commit"

  const hintFor = (id: StepId): string | undefined => {
    if (id === "mapping" && blockers.length > 0) return blockers.join("; ")
    if (id === "merge" && mergeNeeded === false) return "No continuation rows on this file"
    if (id === "commit" && blockers.length > 0) return blockers.join("; ")
    return undefined
  }

  return STEP_ORDER.map((id, i) => {
    const status: StepStatus = satisfied[id]
      ? "done"
      : notNeeded(id)
        ? "not-needed"
        : passedOver(id)
          ? "skipped"
          : id === current
            ? "current"
            : "todo"

    return {
      id,
      index: i + 1,
      label: LABELS[id],
      required: !OPTIONAL_STEPS.includes(id),
      status,
      hint: hintFor(id),
    }
  })
}

/**
 * The optional steps a loaded recipe passed over.
 *
 * A recipe is a decision already made about a format. If it contains no merge,
 * that format has no wrapped rows, and stopping to ask would be re-asking a
 * question the recipe already answered. Required steps are never skipped this
 * way — a recipe whose mapping does not fit this file must still stop on Map
 * columns and say so.
 */
export function skippedByRecipe(actions: GridAction[]): Set<StepId> {
  const skipped = new Set<StepId>()
  if (!actions.some((a) => a.type === "map_row_to_headers")) skipped.add("headers")
  if (!actions.some((a) => a.type === "merge_references")) skipped.add("merge")
  return skipped
}

export function currentStep(steps: StepState[]): StepId {
  return steps.find((s) => s.status === "current")?.id ?? "commit"
}

/**
 * Whether the toolbar should let this step run.
 *
 * The current step, plus anything already done — going back to change a
 * decision is the whole point of the recorder panel, and locking the user out
 * of a step they have already completed would fight it.
 */
export function canRunStep(steps: StepState[], id: StepId): boolean {
  const step = steps.find((s) => s.id === id)
  return step?.status === "current" || step?.status === "done"
}
