"use client"

import { usePathname } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
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

  // Login page doesn't need the sidebar
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

  // Authenticated - show full layout with sidebar
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <AppHeader />
        <main className="flex-1 overflow-auto p-4">
          {children}
        </main>
      </SidebarInset>
      <Toaster />
    </SidebarProvider>
  )
}
