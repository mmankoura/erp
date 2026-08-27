import { describe, it, expect } from "vitest"
import { emptyDoc, record, undo, removeAction, loadRecipe } from "./doc"
import { replay } from "./apply"
import { appliedActions } from "./doc"
import {
  deriveSteps,
  currentStep,
  canRunStep,
  commitBlockers,
  skippedByRecipe,
  type StepId,
} from "./steps"
import { detectStructure } from "./detect"
import type { GridAction, WizardDoc, WizardSource } from "./types"
import ats9353 from "./__fixtures__/aegis-ats9353.json"

const source = ats9353 as WizardSource
const NONE: ReadonlySet<StepId> = new Set()

let seq = 0
const add = (doc: WizardDoc, action: GridAction) =>
  record(doc, action, { id: `s${++seq}`, recorded_at: "2026-08-26T00:00:00.000Z" })

const gridOf = (doc: WizardDoc) => replay(doc.source, appliedActions(doc))

const steps = (doc: WizardDoc | null, skipped: ReadonlySet<StepId> = NONE, mergeNeeded?: boolean) =>
  deriveSteps({ doc, grid: doc ? gridOf(doc) : null, skipped, mergeNeeded })

const statusOf = (doc: WizardDoc | null, id: StepId, skipped: ReadonlySet<StepId> = NONE) =>
  steps(doc, skipped).find((s) => s.id === id)?.status

const PLAN = detectStructure(source).actions
const [HEADERS, MERGE, MAPPING] = PLAN

describe("walking the AEGIS file through the steps", () => {
  it("starts on Set headers with the file already open", () => {
    const doc = emptyDoc(source)
    expect(statusOf(doc, "file")).toBe("done")
    expect(currentStep(steps(doc))).toBe("headers")
  })

  it("has no steps at all before a file is open", () => {
    expect(currentStep(steps(null))).toBe("file")
  })

  it("advances one step at a time as the actions are recorded", () => {
    let doc = emptyDoc(source)
    expect(currentStep(steps(doc))).toBe("headers")

    doc = add(doc, HEADERS)
    expect(currentStep(steps(doc))).toBe("merge")

    doc = add(doc, MERGE)
    expect(currentStep(steps(doc))).toBe("mapping")

    doc = add(doc, MAPPING)
    expect(currentStep(steps(doc))).toBe("commit")
  })

  it("lets the user act on the current step and on what is already done", () => {
    const doc = add(emptyDoc(source), HEADERS)
    const s = steps(doc)
    expect(canRunStep(s, "headers")).toBe(true) // done — go back and change it
    expect(canRunStep(s, "merge")).toBe(true) // current
    expect(canRunStep(s, "mapping")).toBe(false) // locked
    expect(canRunStep(s, "commit")).toBe(false)
  })
})

describe("what satisfies each step", () => {
  it("reads Set headers off the grid, so an undo un-completes it", () => {
    const doc = add(emptyDoc(source), HEADERS)
    expect(statusOf(doc, "headers")).toBe("done")
    expect(statusOf(undo(doc), "headers")).toBe("current")
  })

  it("walks back to Merge when its step is deleted from the recorder", () => {
    let doc = add(add(emptyDoc(source), HEADERS), MERGE)
    expect(currentStep(steps(doc))).toBe("mapping")

    doc = removeAction(doc, doc.actions[1].id)
    expect(currentStep(steps(doc))).toBe("merge")
  })

  it("keeps a tick earned later even when the flow walks back", () => {
    let doc = emptyDoc(source)
    for (const action of PLAN) doc = add(doc, action)
    const rewound = undo(undo(doc)) // back past merge and mapping

    expect(statusOf(rewound, "headers")).toBe("done")
    expect(currentStep(steps(rewound))).toBe("merge")
  })

  it("needs a mapping that actually resolves, not merely a mapping action", () => {
    let doc = add(add(emptyDoc(source), HEADERS), MERGE)
    doc = add(doc, { type: "set_column_mapping", mapping: { F3: "reference_designators" } })

    expect(statusOf(doc, "mapping")).toBe("current")
    expect(commitBlockers(gridOf(doc))).toEqual([
      "Internal Part Number is not mapped to a column",
      "Quantity Required is not mapped to a column",
    ])
  })

  it("names nothing once the required fields resolve", () => {
    let doc = emptyDoc(source)
    for (const action of PLAN) doc = add(doc, action)
    expect(commitBlockers(gridOf(doc))).toEqual([])
  })

  it("does not credit a mapping onto a column this file does not have", () => {
    let doc = add(emptyDoc(source), HEADERS)
    doc = add(doc, {
      type: "set_column_mapping",
      mapping: { F99: "internal_part_number", F98: "quantity_required" },
    })
    expect(statusOf(doc, "mapping")).not.toBe("done")
  })
})

describe("skipping", () => {
  it("moves past a skipped step", () => {
    const doc = emptyDoc(source)
    expect(currentStep(steps(doc, new Set(["headers"])))).toBe("merge")
  })

  it("counts a step done as done, even if it was skipped first", () => {
    const doc = add(emptyDoc(source), HEADERS)
    expect(statusOf(doc, "headers", new Set(["headers"]))).toBe("done")
  })

  it("marks Merge not needed when nothing would collapse", () => {
    const doc = add(emptyDoc(source), HEADERS)
    const s = steps(doc, NONE, false)
    expect(s.find((x) => x.id === "merge")?.status).toBe("not-needed")
    expect(currentStep(s)).toBe("mapping")
  })

  it("still offers Merge when it would collapse something", () => {
    const doc = add(emptyDoc(source), HEADERS)
    expect(currentStep(steps(doc, NONE, true))).toBe("merge")
  })
})

describe("loading a recipe", () => {
  it("lands on Commit when the recipe satisfies everything", () => {
    const recipe = PLAN.map((action, i) => ({
      id: `r${i}`,
      action,
      recorded_at: "2026-08-26T00:00:00.000Z",
    }))
    const doc = loadRecipe(emptyDoc(source), recipe)
    expect(currentStep(steps(doc, skippedByRecipe(PLAN)))).toBe("commit")
  })

  it("passes over the optional steps a recipe leaves out, rather than parking on them", () => {
    const actions: GridAction[] = [HEADERS, MAPPING]
    const recipe = actions.map((action, i) => ({
      id: `r${i}`,
      action,
      recorded_at: "2026-08-26T00:00:00.000Z",
    }))
    const doc = loadRecipe(emptyDoc(source), recipe)
    const s = steps(doc, skippedByRecipe(actions))
    expect(s.find((x) => x.id === "merge")?.status).toBe("skipped")
    expect(currentStep(s)).toBe("commit")
  })

  it("stops honestly at Map columns when the recipe's mapping does not fit this file", () => {
    const actions: GridAction[] = [HEADERS, { type: "set_column_mapping", mapping: {} }]
    const recipe = actions.map((action, i) => ({
      id: `r${i}`,
      action,
      recorded_at: "2026-08-26T00:00:00.000Z",
    }))
    const doc = loadRecipe(emptyDoc(source), recipe)
    expect(currentStep(steps(doc, skippedByRecipe(actions)))).toBe("mapping")
  })
})

describe("steps that have no UI", () => {
  it("is unaffected by an action with no step of its own", () => {
    let doc = add(emptyDoc(source), HEADERS)
    doc = add(doc, { type: "delete_rows", rows: [5] })
    expect(currentStep(steps(doc))).toBe("merge")
  })
})
