/**
 * The path the UI actually takes: record actions onto a doc, one at a time, and
 * read the grid back as a fold. The engine's own tests replay a hand-built
 * action array; this one goes through `doc.ts` the way the toolbar does, so a
 * bug in cursor handling cannot hide behind a correct engine.
 */

import { describe, it, expect } from "vitest"
import { emptyDoc, record, appliedActions, undo, removeAction } from "./doc"
import { replay, columnFor } from "./apply"
import type { GridAction, WizardSource } from "./types"
import ats9353 from "./__fixtures__/aegis-ats9353.json"

const source = ats9353 as WizardSource

const ITEM = "F1", QTY = "F2", REF = "F3", IPN = "F5", RES = "F7"

/** Exactly what a user clicks through in the toolbar for an AEGIS file. */
const STEPS: GridAction[] = [
  { type: "map_row_to_headers", row: 0, deleteRow: true },
  { type: "fill_down", columns: [ITEM, QTY, "F4", IPN, "F6", RES, "F8"], anchorColumn: ITEM },
  {
    type: "merge_references",
    keyColumns: [ITEM],
    mergeColumn: REF,
    separator: ",",
    joinWith: ", ",
    dedupe: false,
  },
  {
    type: "set_column_mapping",
    mapping: {
      [IPN]: "internal_part_number",
      [QTY]: "quantity_required",
      [REF]: "reference_designators",
      [RES]: "resource_type",
    },
  },
]

let seq = 0
const clickThrough = (steps: GridAction[]) =>
  steps.reduce(
    (doc, action) =>
      record(doc, action, { id: `s${++seq}`, recorded_at: "2026-08-12T00:00:00.000Z" }),
    emptyDoc(source)
  )

const gridOf = (doc: ReturnType<typeof clickThrough>) => replay(doc.source, appliedActions(doc))

describe("driving the AEGIS file through the doc layer", () => {
  it("recovers 199 parts from 374 data rows", () => {
    expect(gridOf(clickThrough(STEPS)).rows).toHaveLength(199)
  })

  it("names the columns from the header row", () => {
    const grid = gridOf(clickThrough(STEPS))
    expect(grid.columns.find((c) => c.id === ITEM)?.label).toBe("Item")
    expect(grid.columns.find((c) => c.id === REF)?.label).toBe("Reference")
  })

  it("carries the mapping through to columnFor, which the commit will use", () => {
    const grid = gridOf(clickThrough(STEPS))
    expect(columnFor(grid, "internal_part_number")).toBe(IPN)
    expect(columnFor(grid, "quantity_required")).toBe(QTY)
  })

  it("marks merged rows with their source rows, which is what the grid stripes", () => {
    const grid = gridOf(clickThrough(STEPS))
    const merged = grid.rows.filter((r) => r.mergedFrom?.length)
    expect(merged.length).toBeGreaterThan(0)

    // mergedFrom lists the rows folded *in*, excluding the lead row — so a lead
    // plus one continuation reports 1, not 2. The grid's tooltip has to add the
    // lead back to report an honest count.
    expect(Math.min(...merged.map((r) => r.mergedFrom!.length))).toBe(1)
    expect(merged.every((r) => !r.mergedFrom!.includes(r.srcIndex))).toBe(true)
  })

  it("undoing the merge puts the un-collapsed rows back", () => {
    const full = clickThrough(STEPS)
    // Two undos: past the mapping, past the merge.
    const beforeMerge = undo(undo(full))
    expect(gridOf(beforeMerge).rows.length).toBeGreaterThan(199)
    expect(gridOf(full).rows).toHaveLength(199)
  })

  it("removing the merge step leaves the continuation rows un-collapsed", () => {
    const full = clickThrough(STEPS)
    const withoutMerge = removeAction(full, full.actions[2].id)

    expect(withoutMerge.actions).toHaveLength(3)
    expect(withoutMerge.cursor).toBe(3)
    expect(gridOf(withoutMerge).rows.length).toBeGreaterThan(199)
    // The mapping, recorded after the merge, still applies.
    expect(columnFor(gridOf(withoutMerge), "internal_part_number")).toBe(IPN)
  })

  /**
   * Pins a surprise worth knowing: for this file shape, Fill Down changes
   * nothing at all. `merge_references` absorbs keyless continuation rows into
   * the lead row, and the lead already holds the values Fill Down would have
   * propagated — so filling them in first is redundant.
   *
   * Kept as a test rather than a comment because it is a property of how the
   * two actions interact. If merge ever stops absorbing keyless rows, Fill Down
   * becomes load-bearing again and this fails loudly instead of silently
   * changing what every saved AEGIS recipe produces.
   */
  it("Fill Down is redundant once Merge absorbs the keyless rows", () => {
    const full = clickThrough(STEPS)
    const withoutFill = removeAction(full, full.actions[1].id)

    expect(withoutFill.actions).toHaveLength(3)
    expect(gridOf(withoutFill)).toEqual(gridOf(full))
  })

  it("is unchanged by a JSON round-trip of the recorded actions", () => {
    const full = clickThrough(STEPS)
    const reloaded = JSON.parse(JSON.stringify(full)) as typeof full
    expect(gridOf(reloaded)).toEqual(gridOf(full))
  })
})
