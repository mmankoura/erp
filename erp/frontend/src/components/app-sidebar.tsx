"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Package,
  Box,
  Users,
  FileText,
  ClipboardList,
  Warehouse,
  TrendingDown,
  Truck,
  ClipboardCheck,
  ShieldCheck,
  History,
  Settings,
  Layers,
  Factory,
  ClipboardPen,
  LogOut,
  UserCog,
} from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { useAuth, UserRole } from "@/contexts/auth-context"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

const navigation = {
  main: [
    {
      title: "Dashboard",
      url: "/",
      icon: LayoutDashboard,
    },
  ],
  catalog: [
    {
      title: "Materials",
      url: "/materials",
      icon: Package,
    },
    {
      title: "Products",
      url: "/products",
      icon: Box,
    },
    {
      title: "BOMs",
      url: "/bom",
      icon: Layers,
    },
    {
      title: "Customers",
      url: "/customers",
      icon: Users,
    },
    {
      title: "Suppliers",
      url: "/suppliers",
      icon: Truck,
    },
  ],
  operations: [
    {
      title: "Orders",
      url: "/orders",
      icon: FileText,
    },
    {
      title: "Production",
      url: "/production",
      icon: Factory,
    },
    {
      title: "Purchase Orders",
      url: "/purchase-orders",
      icon: ClipboardList,
    },
    {
      title: "Inventory",
      url: "/inventory",
      icon: Warehouse,
    },
    {
      title: "MRP / Shortages",
      url: "/mrp",
      icon: TrendingDown,
    },
  ],
  quality: [
    {
      title: "Receiving",
      url: "/receiving",
      icon: ClipboardCheck,
    },
    {
      title: "Cycle Counts",
      url: "/cycle-counts",
      icon: ClipboardPen,
    },
    {
      title: "AML",
      url: "/aml",
      icon: ShieldCheck,
    },
  ],
  system: [
    {
      title: "Audit Log",
      url: "/audit",
      icon: History,
    },
  ],
  admin: [
    {
      title: "Users",
      url: "/settings/users",
      icon: UserCog,
    },
    {
      title: "Settings",
      url: "/settings",
      icon: Settings,
    },
  ],
}

// Role display names and colors
const roleDisplayNames: Record<UserRole, string> = {
  [UserRole.ADMIN]: "Admin",
  [UserRole.MANAGER]: "Manager",
  [UserRole.WAREHOUSE_CLERK]: "Warehouse",
  [UserRole.OPERATOR]: "Operator",
}

const roleBadgeVariants: Record<UserRole, "default" | "secondary" | "outline"> = {
  [UserRole.ADMIN]: "default",
  [UserRole.MANAGER]: "secondary",
  [UserRole.WAREHOUSE_CLERK]: "outline",
  [UserRole.OPERATOR]: "outline",
}

export function AppSidebar() {
  const pathname = usePathname()
  const { user, logout, canManageUsers, canAccessSettings } = useAuth()

  const isActive = (url: string) => {
    if (url === "/") {
      return pathname === "/"
    }
    return pathname.startsWith(url)
  }

  const handleLogout = async () => {
    await logout()
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Box className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">ERP System</span>
                  <span className="truncate text-xs text-muted-foreground">Manufacturing</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigation.main.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                    <Link href={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Catalog</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigation.catalog.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                    <Link href={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Operations</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigation.operations.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                    <Link href={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Quality</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigation.quality.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                    <Link href={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>System</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigation.system.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                    <Link href={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              {/* Admin-only items */}
              {(canManageUsers() || canAccessSettings()) && navigation.admin.map((item) => {
                // Show Users link only for admins
                if (item.url === "/settings/users" && !canManageUsers()) return null
                // Show Settings link only for admins
                if (item.url === "/settings" && !canAccessSettings()) return null
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                      <Link href={item.url}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        {user && (
          <div className="px-2 py-2 group-data-[collapsible=icon]:hidden">
            <div className="flex items-center gap-2 mb-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user.full_name}</p>
                <p className="text-xs text-muted-foreground truncate">{user.username}</p>
              </div>
              <Badge variant={roleBadgeVariants[user.role]} className="text-xs">
                {roleDisplayNames[user.role]}
              </Badge>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={handleLogout}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </Button>
          </div>
        )}
        <SidebarMenu className="group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:flex-col hidden">
          <SidebarMenuItem>
            <SidebarMenuButton size="sm" tooltip="Sign Out" onClick={handleLogout}>
              <LogOut />
              <span>Sign Out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
