import { describe, it, expect } from "vitest"
import { frozenOffsets } from "./types"

const widths = [150, 100, 200, 120]
const gutterWidth = 44

describe("frozenOffsets", () => {
  it("freezes nothing when the count is zero", () => {
    expect(frozenOffsets({ count: 0, widths, gutterWidth, viewportWidth: 1000 })).toEqual([
      null,
      null,
      null,
      null,
    ])
  })

  it("pins the first column just right of the gutter", () => {
    const offsets = frozenOffsets({ count: 1, widths, gutterWidth, viewportWidth: 1000 })
    expect(offsets).toEqual([44, null, null, null])
  })

  it("stacks each frozen column after the ones before it", () => {
    const offsets = frozenOffsets({ count: 3, widths, gutterWidth, viewportWidth: 2000 })
    // 44, then 44+150, then 44+150+100
    expect(offsets).toEqual([44, 194, 294, null])
  })

  it("does not run past the end of the columns", () => {
    const offsets = frozenOffsets({ count: 99, widths: [100], gutterWidth, viewportWidth: 2000 })
    expect(offsets).toEqual([44])
  })

  it("stops freezing once the block would pass 60% of the viewport", () => {
    // Budget = 500*0.6 - 44 = 256. 150 fits (150), +100 fits (250), +200 doesn't.
    const offsets = frozenOffsets({ count: 4, widths, gutterWidth, viewportWidth: 500 })
    expect(offsets).toEqual([44, 194, null, null])
  })

  it("always pins the first column even when it alone blows the budget", () => {
    // A 400px identity column in a 300px viewport: pinning it is still better
    // than pinning nothing.
    const offsets = frozenOffsets({ count: 2, widths: [400, 100], gutterWidth, viewportWidth: 300 })
    expect(offsets).toEqual([44, null])
  })

  it("honours the request before the viewport has been measured", () => {
    // width 0 on the first render must not collapse the freeze for a frame.
    const offsets = frozenOffsets({ count: 2, widths, gutterWidth, viewportWidth: 0 })
    expect(offsets).toEqual([44, 194, null, null])
  })

  it("accounts for a grid with no gutter", () => {
    expect(frozenOffsets({ count: 2, widths, gutterWidth: 0, viewportWidth: 2000 })).toEqual([
      0,
      150,
      null,
      null,
    ])
  })

  it("takes a custom ratio", () => {
    // Budget = 1000*0.2 - 44 = 156, so only the 150 fits.
    const offsets = frozenOffsets({
      count: 3,
      widths,
      gutterWidth,
      viewportWidth: 1000,
      maxRatio: 0.2,
    })
    expect(offsets).toEqual([44, null, null, null])
  })

  it("returns one entry per column, never a short array", () => {
    const offsets = frozenOffsets({ count: 2, widths, gutterWidth, viewportWidth: 1000 })
    expect(offsets).toHaveLength(widths.length)
  })
})
