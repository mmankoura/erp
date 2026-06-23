import { describe, it, expect } from "vitest"
import { cn } from "./utils"

describe("cn (Tailwind class merger)", () => {
  it("joins simple class strings", () => {
    expect(cn("a", "b", "c")).toBe("a b c")
  })

  it("filters out falsy entries", () => {
    expect(cn("a", null, undefined, false, "b")).toBe("a b")
  })

  it("merges conflicting Tailwind utility classes (later wins)", () => {
    // tailwind-merge is responsible: bg-red-500 should be replaced by bg-blue-500
    expect(cn("bg-red-500", "bg-blue-500")).toBe("bg-blue-500")
  })

  it("supports conditional object syntax via clsx", () => {
    expect(cn("base", { active: true, disabled: false })).toBe("base active")
  })

  it("flattens arrays", () => {
    expect(cn(["a", "b"], ["c"])).toBe("a b c")
  })

  it("returns empty string for no input", () => {
    expect(cn()).toBe("")
  })

  it("preserves non-conflicting Tailwind classes", () => {
    expect(cn("text-sm", "font-bold")).toBe("text-sm font-bold")
  })
})
