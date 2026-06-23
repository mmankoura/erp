import { describe, it, expect, beforeEach, vi } from "vitest"
import { renderHook, waitFor, act } from "@testing-library/react"
import { useApi, useMutation } from "./use-api"

vi.mock("@/lib/api", () => {
  return {
    api: {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    },
    ApiError: class extends Error {},
  }
})

import { api } from "@/lib/api"

describe("useApi", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("starts in loading state and resolves with data", async () => {
    ;(api.get as any).mockResolvedValue({ id: "x" })
    const { result } = renderHook(() => useApi<{ id: string }>("/x"))
    expect(result.current.isLoading).toBe(true)
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data).toEqual({ id: "x" })
    expect(result.current.error).toBeNull()
  })

  it("captures errors thrown by api.get", async () => {
    ;(api.get as any).mockRejectedValue(new Error("boom"))
    const { result } = renderHook(() => useApi("/x"))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.error?.message).toBe("boom")
    expect(result.current.data).toBeNull()
  })

  it("does not fetch when enabled=false", async () => {
    const { result } = renderHook(() => useApi("/x", { enabled: false }))
    expect(result.current.isLoading).toBe(false)
    expect(api.get).not.toHaveBeenCalled()
  })

  it("supports initialData", async () => {
    ;(api.get as any).mockResolvedValue({ id: "fresh" })
    const { result } = renderHook(() =>
      useApi<{ id: string }>("/x", { initialData: { id: "stale" } })
    )
    expect(result.current.data).toEqual({ id: "stale" })
    await waitFor(() => expect(result.current.data?.id).toBe("fresh"))
  })

  it("refetch() re-runs the request", async () => {
    ;(api.get as any).mockResolvedValueOnce({ id: "1" }).mockResolvedValueOnce({ id: "2" })
    const { result } = renderHook(() => useApi<{ id: string }>("/x"))
    await waitFor(() => expect(result.current.data?.id).toBe("1"))
    await act(async () => {
      await result.current.refetch()
    })
    expect(result.current.data?.id).toBe("2")
  })

  it("mutate() locally replaces data without re-fetching", async () => {
    ;(api.get as any).mockResolvedValue({ id: "server" })
    const { result } = renderHook(() => useApi<{ id: string }>("/x"))
    await waitFor(() => expect(result.current.data?.id).toBe("server"))
    act(() => {
      result.current.mutate({ id: "client" })
    })
    expect(result.current.data?.id).toBe("client")
    expect((api.get as any).mock.calls).toHaveLength(1)
  })
})

describe("useMutation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("calls the mutation fn and exposes the result", async () => {
    const fn = vi.fn().mockResolvedValue({ id: "out" })
    const { result } = renderHook(() => useMutation<any, any>(fn))
    let resolved: any
    await act(async () => {
      resolved = await result.current.mutate({ x: 1 })
    })
    expect(fn).toHaveBeenCalledWith({ x: 1 })
    expect(resolved).toEqual({ id: "out" })
    expect(result.current.data).toEqual({ id: "out" })
    expect(result.current.error).toBeNull()
  })

  it("invokes onSuccess with data + variables", async () => {
    const onSuccess = vi.fn()
    const fn = vi.fn().mockResolvedValue("ok")
    const { result } = renderHook(() => useMutation<any, any>(fn, { onSuccess }))
    await act(async () => {
      await result.current.mutate({ payload: 1 })
    })
    expect(onSuccess).toHaveBeenCalledWith("ok", { payload: 1 })
  })

  it("invokes onError when mutation fails and stores the error", async () => {
    const onError = vi.fn()
    const fn = vi.fn().mockRejectedValue(new Error("nope"))
    const { result } = renderHook(() => useMutation<any, any>(fn, { onError }))
    await act(async () => {
      const out = await result.current.mutate({})
      expect(out).toBeUndefined()
    })
    expect(onError).toHaveBeenCalled()
    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.error?.message).toBe("nope")
    expect(result.current.data).toBeNull()
  })

  it("reset() clears the state", async () => {
    const fn = vi.fn().mockResolvedValue("hello")
    const { result } = renderHook(() => useMutation<any, any>(fn))
    await act(async () => {
      await result.current.mutate({})
    })
    expect(result.current.data).toBe("hello")
    act(() => result.current.reset())
    expect(result.current.data).toBeNull()
    expect(result.current.error).toBeNull()
    expect(result.current.isLoading).toBe(false)
  })

  it("wraps non-Error throws into Error", async () => {
    const fn = vi.fn().mockRejectedValue("string-error")
    const { result } = renderHook(() => useMutation<any, any>(fn))
    await act(async () => {
      await result.current.mutate({})
    })
    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.error?.message).toBe("string-error")
  })
})
