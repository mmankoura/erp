"use client"

import React, { createContext, useContext, useEffect, useState, useCallback } from "react"
import { useRouter, usePathname } from "next/navigation"
import { api } from "@/lib/api"

// User role enum - must match backend
export enum UserRole {
  ADMIN = "ADMIN",
  MANAGER = "MANAGER",
  WAREHOUSE_CLERK = "WAREHOUSE_CLERK",
  OPERATOR = "OPERATOR",
}

// User type matching backend entity
export interface User {
  id: string
  email: string
  username: string
  full_name: string
  role: UserRole
  is_active: boolean
  last_login_at: string | null
  created_at: string
  updated_at: string
}

interface AuthContextType {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
  // Permission helpers
  hasRole: (...roles: UserRole[]) => boolean
  canEdit: () => boolean
  canManageUsers: () => boolean
  canAccessSettings: () => boolean
  canPerformInventoryOps: () => boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()
  const pathname = usePathname()

  // Fetch current user from session
  const fetchUser = useCallback(async () => {
    try {
      const response = await api.get<User>("/auth/me")
      setUser(response)
      return response
    } catch {
      setUser(null)
      return null
    }
  }, [])

  // Initialize auth state on mount
  useEffect(() => {
    const initAuth = async () => {
      setIsLoading(true)
      await fetchUser()
      setIsLoading(false)
    }
    initAuth()
  }, [fetchUser])

  // Redirect to login if not authenticated and not on login page
  useEffect(() => {
    if (!isLoading && !user && pathname !== "/login") {
      router.push("/login")
    }
  }, [isLoading, user, pathname, router])

  // Login function
  const login = async (username: string, password: string) => {
    const response = await api.post<{ user: User; message: string }>("/auth/login", {
      username,
      password,
    })
    setUser(response.user)
    router.push("/")
  }

  // Logout function
  const logout = async () => {
    try {
      await api.post("/auth/logout")
    } finally {
      setUser(null)
      router.push("/login")
    }
  }

  // Refresh user data
  const refreshUser = async () => {
    await fetchUser()
  }

  // Permission helpers
  const hasRole = (...roles: UserRole[]) => {
    return user !== null && roles.includes(user.role)
  }

  const canManageUsers = () => hasRole(UserRole.ADMIN)

  const canAccessSettings = () => hasRole(UserRole.ADMIN)

  const canEdit = () => hasRole(UserRole.ADMIN, UserRole.MANAGER)

  const canPerformInventoryOps = () =>
    hasRole(UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE_CLERK)

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: user !== null,
    login,
    logout,
    refreshUser,
    hasRole,
    canEdit,
    canManageUsers,
    canAccessSettings,
    canPerformInventoryOps,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
