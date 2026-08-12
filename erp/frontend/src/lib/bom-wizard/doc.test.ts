import { describe, it, expect } from "vitest"
import {
  emptyDoc,
  appliedActions,
  canUndo,
  canRedo,
  record,
  undo,
  redo,
  removeAction,
  setComment,
  loadRecipe,
} from "./doc"
import { replay } from "./apply"
import type { GridAction, WizardSource } from "./types"

const source: WizardSource = {
  fileName: "test.xlsx",
  sheetName: "Sheet1",
  matrix: [
    ["Item", "Qty", "Ref"],
    ["1", "2", "R1"],
    ["", "", "R2"],
    ["2", "5", "C1"],
  ],
}

const HEADERS: GridAction = { type: "map_row_to_headers", row: 0, deleteRow: true }
const FILL: GridAction = { type: "fill_down", columns: ["F1", "F2"], anchorColumn: "F1" }
const DROP_COL: GridAction = { type: "delete_columns", columns: ["F3"] }

let seq = 0
const meta = () => ({ id: `a${++seq}`, recorded_at: "2026-08-12T00:00:00.000Z" })

/** Record a list of actions onto a fresh doc. */
const docWith = (...actions: GridAction[]) =>
  actions.reduce((d, a) => record(d, a, meta()), emptyDoc(source))

describe("record", () => {
  it("appends and advances the cursor", () => {
    const doc = docWith(HEADERS, FILL)
    expect(doc.actions).toHaveLength(2)
    expect(doc.cursor).toBe(2)
  })

  it("does not mutate the doc it was given", () => {
    const before = emptyDoc(source)
    record(before, HEADERS, meta())
    expect(before.actions).toHaveLength(0)
    expect(before.cursor).toBe(0)
  })

  it("keeps a comment when one is supplied, and omits the key otherwise", () => {
    const withComment = record(emptyDoc(source), HEADERS, { ...meta(), comment: "row 1 is the header" })
    expect(withComment.actions[0].comment).toBe("row 1 is the header")
    expect(docWith(HEADERS).actions[0]).not.toHaveProperty("comment")
  })

  it("discards the redo tail — the list always reads as what produced the grid", () => {
    const doc = undo(docWith(HEADERS, FILL))
    expect(canRedo(doc)).toBe(true)

    const rewritten = record(doc, DROP_COL, meta())
    expect(rewritten.actions.map((a) => a.action)).toEqual([HEADERS, DROP_COL])
    expect(canRedo(rewritten)).toBe(false)
  })
})

describe("undo / redo", () => {
  it("moves only the cursor, never the action list", () => {
    const doc = docWith(HEADERS, FILL)
    const undone = undo(doc)
    expect(undone.cursor).toBe(1)
    expect(undone.actions).toHaveLength(2)
    expect(appliedActions(undone)).toEqual([HEADERS])
  })

  it("stops at the ends instead of going out of range", () => {
    const doc = docWith(HEADERS)
    expect(canUndo(emptyDoc(source))).toBe(false)
    expect(undo(undo(doc)).cursor).toBe(0)
    expect(redo(redo(doc)).cursor).toBe(1)
  })

  it("undoing to zero shows the untouched source", () => {
    const doc = docWith(HEADERS, FILL)
    const back = undo(undo(doc))
    expect(replay(source, appliedActions(back))).toEqual(replay(source, []))
  })

  it("round-trips: undo then redo is the same grid", () => {
    const doc = docWith(HEADERS, FILL)
    const there = replay(source, appliedActions(doc))
    const andBack = replay(source, appliedActions(redo(undo(doc))))
    expect(andBack).toEqual(there)
  })
})

describe("removeAction", () => {
  it("deleting from the middle equals never having recorded it", () => {
    const all = docWith(HEADERS, FILL, DROP_COL)
    const without = removeAction(all, all.actions[1].id)

    expect(replay(source, appliedActions(without))).toEqual(
      replay(source, [HEADERS, DROP_COL])
    )
  })

  it("pulls the cursor back when the removed action was applied", () => {
    const doc = docWith(HEADERS, FILL, DROP_COL)
    const without = removeAction(doc, doc.actions[0].id)
    expect(without.cursor).toBe(2)
    expect(without.actions).toHaveLength(2)
  })

  it("leaves the cursor alone when the removed action was still undone", () => {
    const doc = undo(docWith(HEADERS, FILL, DROP_COL)) // cursor 2, last one pending
    const without = removeAction(doc, doc.actions[2].id)
    expect(without.cursor).toBe(2)
    expect(without.actions).toHaveLength(2)
  })

  it("ignores an id that is not there", () => {
    const doc = docWith(HEADERS)
    expect(removeAction(doc, "nope")).toBe(doc)
  })
})

describe("setComment", () => {
  it("sets and replaces", () => {
    const doc = docWith(HEADERS)
    const id = doc.actions[0].id
    expect(setComment(doc, id, "first").actions[0].comment).toBe("first")
    expect(setComment(setComment(doc, id, "first"), id, "second").actions[0].comment).toBe("second")
  })

  it("drops the key when cleared, rather than storing an empty string", () => {
    const doc = setComment(docWith(HEADERS), "a1", "x")
    const cleared = setComment(doc, doc.actions[0].id, "   ")
    expect(cleared.actions[0]).not.toHaveProperty("comment")
  })

  it("does not disturb the action itself", () => {
    const doc = docWith(HEADERS)
    const commented = setComment(doc, doc.actions[0].id, "note")
    expect(commented.actions[0].action).toEqual(HEADERS)
    expect(commented.cursor).toBe(doc.cursor)
  })
})

describe("loadRecipe", () => {
  it("replaces the actions and applies all of them, keeping the source", () => {
    const recipe = docWith(HEADERS, FILL).actions
    const loaded = loadRecipe(emptyDoc(source), recipe)

    expect(loaded.source).toBe(source)
    expect(loaded.cursor).toBe(2)
    expect(replay(source, appliedActions(loaded))).toEqual(replay(source, [HEADERS, FILL]))
  })

  it("survives a JSON round-trip, which is what a recipe file is", () => {
    const recipe = JSON.parse(JSON.stringify(docWith(HEADERS, FILL).actions))
    const loaded = loadRecipe(emptyDoc(source), recipe)
    expect(replay(source, appliedActions(loaded))).toEqual(replay(source, [HEADERS, FILL]))
  })
})
