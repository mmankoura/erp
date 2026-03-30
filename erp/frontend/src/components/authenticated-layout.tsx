"use client"

import { usePathname } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { AppNavbar } from "@/components/app-navbar"
import { AppHeader } from "@/components/app-header"
import { Toaster } from "@/components/ui/sonner"

export function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()
  const pathname = usePathname()

  // Show loading state while checking auth
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
        <Toaster />
      </div>
    )
  }

  // Login page doesn't need the navbar
  if (pathname === "/login") {
    return (
      <>
        {children}
        <Toaster />
      </>
    )
  }

  // Not authenticated - children will handle redirect
  if (!isAuthenticated) {
    return (
      <>
        {children}
        <Toaster />
      </>
    )
  }

  // Authenticated - show full layout with top navbar
  return (
    <div className="flex flex-col min-h-screen">
      <AppNavbar />
      <AppHeader />
      <main className="flex-1 overflow-auto p-4">
        {children}
      </main>
      <Toaster />
    </div>
  )
}
