/**
 * The document operations: everything that changes the *action list*.
 *
 * `apply.ts` folds actions over the source; this module decides which actions
 * are in the list and how many of them are applied. Kept pure and free of
 * React for the same reason the engine is — undo, redo and "delete the third
 * action" are the operations most likely to be subtly wrong, and they are far
 * easier to prove correct here than through a rendered grid.
 *
 * Ids and timestamps are supplied by the caller rather than generated here, so
 * these functions stay deterministic and the tests need no clock.
 */

import type { GridAction, RecordedAction, WizardDoc, WizardSource } from "./types"

export function emptyDoc(source: WizardSource): WizardDoc {
  return { source, actions: [], cursor: 0 }
}

/** The actions currently folded into the visible grid. */
export function appliedActions(doc: WizardDoc): GridAction[] {
  return doc.actions.slice(0, doc.cursor).map((r) => r.action)
}

export const canUndo = (doc: WizardDoc): boolean => doc.cursor > 0
export const canRedo = (doc: WizardDoc): boolean => doc.cursor < doc.actions.length

/**
 * Append an action at the cursor.
 *
 * Recording after an undo discards the redo tail — the standard editor
 * bargain. The alternative, keeping the tail, would mean the list no longer
 * reads as the sequence that produced the grid in front of you, which is the
 * one thing the recorder panel has to be honest about.
 */
export function record(
  doc: WizardDoc,
  action: GridAction,
  meta: { id: string; recorded_at: string; comment?: string }
): WizardDoc {
  const recorded: RecordedAction = {
    id: meta.id,
    action,
    recorded_at: meta.recorded_at,
    ...(meta.comment ? { comment: meta.comment } : {}),
  }
  const kept = doc.actions.slice(0, doc.cursor)
  return { ...doc, actions: [...kept, recorded], cursor: kept.length + 1 }
}

export function undo(doc: WizardDoc): WizardDoc {
  return canUndo(doc) ? { ...doc, cursor: doc.cursor - 1 } : doc
}

export function redo(doc: WizardDoc): WizardDoc {
  return canRedo(doc) ? { ...doc, cursor: doc.cursor + 1 } : doc
}

/**
 * Remove an action outright, wherever it sits.
 *
 * The engine's replay tests pin the property this relies on: deleting an
 * action from the middle yields the same grid as never having recorded it. So
 * the only bookkeeping needed is the cursor, which shifts down when the
 * removed action was already applied.
 */
export function removeAction(doc: WizardDoc, id: string): WizardDoc {
  const at = doc.actions.findIndex((a) => a.id === id)
  if (at === -1) return doc

  return {
    ...doc,
    actions: doc.actions.filter((a) => a.id !== id),
    cursor: at < doc.cursor ? doc.cursor - 1 : doc.cursor,
  }
}

/** The recorder's Comments column. The only field on a recorded action the user may edit. */
export function setComment(doc: WizardDoc, id: string, comment: string): WizardDoc {
  const at = doc.actions.findIndex((a) => a.id === id)
  if (at === -1) return doc

  const actions = [...doc.actions]
  const trimmed = comment.trim()
  const { comment: _dropped, ...rest } = actions[at]
  actions[at] = trimmed ? { ...rest, comment: trimmed } : rest

  return { ...doc, actions }
}

/**
 * Replace the action list wholesale — loading a saved recipe onto the file
 * that is already open. The source is untouched, which is the entire point of
 * recipes: last month's steps, this month's file.
 */
export function loadRecipe(doc: WizardDoc, actions: RecordedAction[]): WizardDoc {
  return { ...doc, actions: [...actions], cursor: actions.length }
}
