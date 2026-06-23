import { describe, it, expect, beforeEach, vi } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { useIsMobile } from "./use-mobile"

describe("useIsMobile", () => {
  let mqlListeners: Array<() => void>
  let mockMql: any

  beforeEach(() => {
    mqlListeners = []
    mockMql = {
      addEventListener: vi.fn((_event: string, cb: () => void) => {
        mqlListeners.push(cb)
      }),
      removeEventListener: vi.fn((_event: string, cb: () => void) => {
        mqlListeners = mqlListeners.filter((l) => l !== cb)
      }),
      matches: false,
    }
    vi.stubGlobal("matchMedia", vi.fn(() => mockMql))
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: 1024,
    })
  })

  it("returns false for desktop widths", () => {
    window.innerWidth = 1200
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(false)
  })

  it("returns true when window.innerWidth is below 768", () => {
    window.innerWidth = 500
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(true)
  })

  it("registers a media query listener using the 768px breakpoint", () => {
    renderHook(() => useIsMobile())
    expect((globalThis as any).matchMedia).toHaveBeenCalledWith(
      "(max-width: 767px)"
    )
    expect(mockMql.addEventListener).toHaveBeenCalledWith(
      "change",
      expect.any(Function)
    )
  })

  it("updates state when the media query fires", () => {
    window.innerWidth = 1200
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(false)

    act(() => {
      window.innerWidth = 600
      mqlListeners.forEach((cb) => cb())
    })
    expect(result.current).toBe(true)
  })

  it("cleans up the listener on unmount", () => {
    const { unmount } = renderHook(() => useIsMobile())
    unmount()
    expect(mockMql.removeEventListener).toHaveBeenCalled()
  })
})
