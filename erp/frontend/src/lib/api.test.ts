import { describe, it, expect, beforeEach, vi } from "vitest"
import { api, ApiError } from "./api"

describe("ApiError", () => {
  it("captures status, statusText, and a default message", () => {
    const err = new ApiError(404, "Not Found")
    expect(err.status).toBe(404)
    expect(err.statusText).toBe("Not Found")
    expect(err.message).toBe("API Error: 404 Not Found")
    expect(err.name).toBe("ApiError")
  })

  it("uses custom message when provided", () => {
    const err = new ApiError(500, "Internal", "Database down")
    expect(err.message).toBe("Database down")
  })

  it("is an instance of Error", () => {
    expect(new ApiError(400, "Bad")).toBeInstanceOf(Error)
  })
})

describe("api client", () => {
  let fetchMock: ReturnType<typeof vi.fn>

  const buildResponse = (init: {
    ok?: boolean
    status?: number
    statusText?: string
    body?: any
    text?: string
  }): Response => {
    const { ok = true, status = 200, statusText = "OK", body, text } = init
    return {
      ok,
      status,
      statusText,
      json: vi.fn().mockResolvedValue(body),
      text: vi.fn().mockResolvedValue(text ?? JSON.stringify(body ?? "")),
    } as unknown as Response
  }

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
  })

  describe("get", () => {
    it("calls fetch with /api prefix and credentials: include", async () => {
      fetchMock.mockResolvedValue(buildResponse({ body: { ok: 1 } }))
      await api.get("/customers")
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/customers",
        expect.objectContaining({
          method: "GET",
          credentials: "include",
        })
      )
    })

    it("returns parsed JSON body on 2xx", async () => {
      fetchMock.mockResolvedValue(buildResponse({ body: { id: "x" } }))
      const out = await api.get<{ id: string }>("/x")
      expect(out).toEqual({ id: "x" })
    })

    it("throws ApiError with parsed message on 4xx", async () => {
      fetchMock.mockResolvedValue(
        buildResponse({
          ok: false,
          status: 404,
          statusText: "Not Found",
          text: JSON.stringify({ message: "Customer not found" }),
        })
      )
      await expect(api.get("/customers/x")).rejects.toMatchObject({
        status: 404,
        message: "Customer not found",
      })
    })

    it("falls back to error.error field if message missing", async () => {
      fetchMock.mockResolvedValue(
        buildResponse({
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
          text: JSON.stringify({ error: "boom" }),
        })
      )
      await expect(api.get("/x")).rejects.toMatchObject({ message: "boom" })
    })

    it("falls back to raw text when error body is not JSON", async () => {
      fetchMock.mockResolvedValue(
        buildResponse({
          ok: false,
          status: 503,
          statusText: "Service Unavailable",
          text: "<html>down</html>",
        })
      )
      await expect(api.get("/x")).rejects.toMatchObject({
        status: 503,
        message: "<html>down</html>",
      })
    })

    it("returns undefined for 204 No Content", async () => {
      fetchMock.mockResolvedValue(buildResponse({ status: 204 }))
      const out = await api.get("/x")
      expect(out).toBeUndefined()
    })

    it("merges custom headers with defaults", async () => {
      fetchMock.mockResolvedValue(buildResponse({ body: {} }))
      await api.get("/x", { headers: { "X-Trace": "abc" } })
      const opts = fetchMock.mock.calls[0][1]
      expect(opts.headers).toMatchObject({
        "Content-Type": "application/json",
        "X-Trace": "abc",
      })
    })
  })

  describe("post", () => {
    it("serializes body to JSON", async () => {
      fetchMock.mockResolvedValue(buildResponse({ body: {} }))
      await api.post("/x", { a: 1 })
      const opts = fetchMock.mock.calls[0][1]
      expect(opts.method).toBe("POST")
      expect(opts.body).toBe(JSON.stringify({ a: 1 }))
    })

    it("omits body when no data passed", async () => {
      fetchMock.mockResolvedValue(buildResponse({ body: {} }))
      await api.post("/x")
      const opts = fetchMock.mock.calls[0][1]
      expect(opts.body).toBeUndefined()
    })
  })

  describe("put / patch / delete", () => {
    it.each([
      ["put", "PUT"],
      ["patch", "PATCH"],
    ] as const)("%s sends correct method + body", async (verb, method) => {
      fetchMock.mockResolvedValue(buildResponse({ body: {} }))
      await api[verb]("/x", { a: 1 })
      expect(fetchMock.mock.calls[0][1].method).toBe(method)
      expect(fetchMock.mock.calls[0][1].body).toBe(JSON.stringify({ a: 1 }))
    })

    it("delete sends DELETE without a body", async () => {
      fetchMock.mockResolvedValue(buildResponse({ body: {} }))
      await api.delete("/x")
      const opts = fetchMock.mock.calls[0][1]
      expect(opts.method).toBe("DELETE")
      expect(opts.body).toBeUndefined()
    })
  })
})
