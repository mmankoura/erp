import { describe, it, expect, beforeEach, vi } from "vitest"
import { renderHook, act, waitFor } from "@testing-library/react"
import React from "react"
import { AuthProvider, useAuth, UserRole } from "./auth-context"

const pushMock = vi.fn()
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => "/",
}))

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

import { api } from "@/lib/api"

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
)

const buildUser = (role: UserRole = UserRole.ADMIN) => ({
  id: "u1",
  username: "alice",
  email: "alice@example.com",
  full_name: "Alice",
  role,
  is_active: true,
  last_login_at: null,
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
})

describe("useAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("throws if used outside of AuthProvider", () => {
    expect(() => renderHook(() => useAuth())).toThrow(/AuthProvider/)
  })

  it("initializes with isLoading=true, fetches user, then settles", async () => {
    ;(api.get as any).mockResolvedValue(buildUser())
    const { result } = renderHook(() => useAuth(), { wrapper })
    expect(result.current.isLoading).toBe(true)
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.user?.username).toBe("alice")
    expect(result.current.isAuthenticated).toBe(true)
  })

  it("treats /auth/me errors as logged-out state", async () => {
    ;(api.get as any).mockRejectedValue(new Error("401"))
    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.user).toBeNull()
    expect(result.current.isAuthenticated).toBe(false)
  })

  describe("permission helpers", () => {
    it("hasRole returns false when no user", async () => {
      ;(api.get as any).mockRejectedValue(new Error("nope"))
      const { result } = renderHook(() => useAuth(), { wrapper })
      await waitFor(() => expect(result.current.isLoading).toBe(false))
      expect(result.current.hasRole(UserRole.ADMIN)).toBe(false)
    })

    it("ADMIN: all helpers return true", async () => {
      ;(api.get as any).mockResolvedValue(buildUser(UserRole.ADMIN))
      const { result } = renderHook(() => useAuth(), { wrapper })
      await waitFor(() => expect(result.current.user).not.toBeNull())
      expect(result.current.canManageUsers()).toBe(true)
      expect(result.current.canAccessSettings()).toBe(true)
      expect(result.current.canEdit()).toBe(true)
      expect(result.current.canPerformInventoryOps()).toBe(true)
    })

    it("MANAGER: edit + inventory yes; settings/users no", async () => {
      ;(api.get as any).mockResolvedValue(buildUser(UserRole.MANAGER))
      const { result } = renderHook(() => useAuth(), { wrapper })
      await waitFor(() => expect(result.current.user).not.toBeNull())
      expect(result.current.canManageUsers()).toBe(false)
      expect(result.current.canAccessSettings()).toBe(false)
      expect(result.current.canEdit()).toBe(true)
      expect(result.current.canPerformInventoryOps()).toBe(true)
    })

    it("WAREHOUSE_CLERK: only inventory ops", async () => {
      ;(api.get as any).mockResolvedValue(buildUser(UserRole.WAREHOUSE_CLERK))
      const { result } = renderHook(() => useAuth(), { wrapper })
      await waitFor(() => expect(result.current.user).not.toBeNull())
      expect(result.current.canEdit()).toBe(false)
      expect(result.current.canManageUsers()).toBe(false)
      expect(result.current.canPerformInventoryOps()).toBe(true)
    })

    it("OPERATOR: nothing privileged", async () => {
      ;(api.get as any).mockResolvedValue(buildUser(UserRole.OPERATOR))
      const { result } = renderHook(() => useAuth(), { wrapper })
      await waitFor(() => expect(result.current.user).not.toBeNull())
      expect(result.current.canEdit()).toBe(false)
      expect(result.current.canManageUsers()).toBe(false)
      expect(result.current.canPerformInventoryOps()).toBe(false)
    })
  })

  describe("login / logout", () => {
    it("login posts credentials, sets user, navigates to /", async () => {
      ;(api.get as any).mockResolvedValue(null)
      ;(api.post as any).mockResolvedValue({ user: buildUser(), message: "ok" })
      const { result } = renderHook(() => useAuth(), { wrapper })
      await waitFor(() => expect(result.current.isLoading).toBe(false))

      await act(async () => {
        await result.current.login("alice", "pwd")
      })
      expect(api.post).toHaveBeenCalledWith("/auth/login", {
        username: "alice",
        password: "pwd",
      })
      expect(result.current.user?.username).toBe("alice")
      expect(pushMock).toHaveBeenCalledWith("/")
    })

    it("logout clears user and routes to /login (even if api throws)", async () => {
      ;(api.get as any).mockResolvedValue(buildUser())
      ;(api.post as any).mockRejectedValueOnce(new Error("network"))
      const { result } = renderHook(() => useAuth(), { wrapper })
      await waitFor(() => expect(result.current.user).not.toBeNull())

      // logout() uses try/finally — the error rethrows, but the finally
      // block still clears state and navigates.
      await act(async () => {
        await expect(result.current.logout()).rejects.toThrow("network")
      })
      expect(result.current.user).toBeNull()
      expect(pushMock).toHaveBeenCalledWith("/login")
    })

    it("logout clears user and routes to /login on success path", async () => {
      ;(api.get as any).mockResolvedValue(buildUser())
      ;(api.post as any).mockResolvedValue({})
      const { result } = renderHook(() => useAuth(), { wrapper })
      await waitFor(() => expect(result.current.user).not.toBeNull())
      await act(async () => {
        await result.current.logout()
      })
      expect(result.current.user).toBeNull()
      expect(pushMock).toHaveBeenCalledWith("/login")
    })
  })
})
