import { describe, it, expect } from "vitest"
import { parseRowSpec, formatRowSpec } from "./row-spec"

const rowsOf = (spec: string) => {
  const out = parseRowSpec(spec)
  if ("error" in out) throw new Error(out.error)
  return out.rows
}

describe("parseRowSpec", () => {
  it("reads a single row, one-based as the gutter shows it", () => {
    expect(rowsOf("1")).toEqual([0])
  })

  it("reads a run", () => {
    expect(rowsOf("1-6")).toEqual([0, 1, 2, 3, 4, 5])
  })

  it("reads a list of runs and singles together", () => {
    expect(rowsOf("1-3, 7, 9-10")).toEqual([0, 1, 2, 6, 8, 9])
  })

  it("tolerates loose spacing", () => {
    expect(rowsOf("  1 - 3 ,7 ")).toEqual([0, 1, 2, 6])
  })

  it("deduplicates overlapping runs", () => {
    expect(rowsOf("1-5, 3-7")).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it("is empty for an empty spec, rather than an error", () => {
    expect(rowsOf("")).toEqual([])
    expect(rowsOf("   ")).toEqual([])
  })

  it("refuses a backwards run rather than silently swapping it", () => {
    expect(parseRowSpec("8-3")).toEqual({ error: '"8-3" runs backwards' })
  })

  it("refuses row zero, because the gutter starts at one", () => {
    expect(parseRowSpec("0")).toEqual({ error: 'Rows start at 1, not "0"' })
  })

  it("refuses anything that is not a row or a range", () => {
    expect(parseRowSpec("abc")).toEqual({ error: '"abc" is not a row or a range' })
    expect(parseRowSpec("1-")).toEqual({ error: '"1-" is not a row or a range' })
  })
})

describe("formatRowSpec", () => {
  it("collapses a run back to the shorthand", () => {
    expect(formatRowSpec([0, 1, 2, 3, 4, 5])).toBe("1-6")
  })

  it("keeps separate rows separate", () => {
    expect(formatRowSpec([0, 2, 4])).toBe("1, 3, 5")
  })

  it("mixes runs and singles", () => {
    expect(formatRowSpec([0, 1, 2, 6, 8, 9])).toBe("1-3, 7, 9-10")
  })

  it("says nothing about nothing", () => {
    expect(formatRowSpec([])).toBe("")
  })

  it("round-trips what parseRowSpec produced", () => {
    expect(formatRowSpec(rowsOf("1-6, 12"))).toBe("1-6, 12")
  })
})
