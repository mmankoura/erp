"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Package,
  Box,
  ShieldCheck,
  Warehouse,
  ClipboardCheck,
  PackageCheck,
  RotateCcw,
  ClipboardList,
  TrendingDown,
  Truck,
  FileText,
  Users,
  Factory,
  History,
  Settings,
  UserCog,
  LogOut,
  ChevronDown,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useAuth, UserRole } from "@/contexts/auth-context"
import { cn } from "@/lib/utils"

interface NavItem {
  title: string
  url: string
  icon: React.ComponentType<{ className?: string }>
}

interface NavGroup {
  label: string
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    label: "Catalog",
    items: [
      { title: "Materials", url: "/materials", icon: Package },
      { title: "Products", url: "/products", icon: Box },
      { title: "AML", url: "/aml", icon: ShieldCheck },
    ],
  },
  {
    label: "Warehouse",
    items: [
      { title: "Inventory", url: "/inventory", icon: Warehouse },
      { title: "Receiving", url: "/receiving", icon: ClipboardCheck },
      { title: "Customer Supplied", url: "/customer-supplied", icon: Package },
      { title: "Kitting", url: "/kitting", icon: PackageCheck },
      { title: "Return to Stock", url: "/return-to-stock", icon: RotateCcw },
    ],
  },
  {
    label: "Purchasing",
    items: [
      { title: "Supplier Purchase Orders", url: "/purchase-orders", icon: ClipboardList },
      { title: "MRP / Shortages", url: "/mrp", icon: TrendingDown },
      { title: "Suppliers", url: "/suppliers", icon: Truck },
    ],
  },
  {
    label: "Production",
    items: [
      { title: "Customer Orders", url: "/orders", icon: FileText },
      { title: "Customers", url: "/customers", icon: Users },
      { title: "WIP Tracking", url: "/production", icon: Factory },
    ],
  },
]

const settingsItems: NavItem[] = [
  { title: "Users", url: "/settings/users", icon: UserCog },
  { title: "Audit Log", url: "/audit", icon: History },
  { title: "Settings", url: "/settings", icon: Settings },
]

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

export function AppNavbar() {
  const pathname = usePathname()
  const { user, logout, canManageUsers, canAccessSettings } = useAuth()

  const isGroupActive = (group: NavGroup) =>
    group.items.some((item) =>
      item.url === "/" ? pathname === "/" : pathname.startsWith(item.url)
    )

  const isItemActive = (url: string) =>
    url === "/" ? pathname === "/" : pathname.startsWith(url)

  const handleLogout = async () => {
    await logout()
  }

  return (
    <nav className="flex h-12 shrink-0 items-center border-b bg-background px-4 gap-1">
      {/* Logo */}
      <Link href="/" className="flex items-center gap-2 mr-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Box className="h-4 w-4" />
        </div>
        <span className="font-semibold text-sm hidden sm:inline">ERP</span>
      </Link>

      {/* Nav groups */}
      <div className="flex items-center gap-0.5 flex-1">
        {navGroups.map((group) => (
          <DropdownMenu key={group.label}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "h-8 px-3 text-sm gap-1",
                  isGroupActive(group) && "bg-accent text-accent-foreground"
                )}
              >
                {group.label}
                <ChevronDown className="h-3 w-3 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {group.items.map((item) => (
                <DropdownMenuItem key={item.url} asChild>
                  <Link
                    href={item.url}
                    className={cn(
                      "flex items-center gap-2 cursor-pointer",
                      isItemActive(item.url) && "bg-accent"
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.title}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ))}

        {/* Settings dropdown — role-gated */}
        {(canManageUsers() || canAccessSettings()) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "h-8 px-3 text-sm gap-1",
                  settingsItems.some((i) => isItemActive(i.url)) && "bg-accent text-accent-foreground"
                )}
              >
                Settings
                <ChevronDown className="h-3 w-3 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              {settingsItems.map((item) => {
                if (item.url === "/settings/users" && !canManageUsers()) return null
                if (item.url === "/settings" && !canAccessSettings()) return null
                return (
                  <DropdownMenuItem key={item.url} asChild>
                    <Link
                      href={item.url}
                      className={cn(
                        "flex items-center gap-2 cursor-pointer",
                        isItemActive(item.url) && "bg-accent"
                      )}
                    >
                      <item.icon className="h-4 w-4" />
                      {item.title}
                    </Link>
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* User info + logout */}
      {user && (
        <div className="flex items-center gap-3 ml-auto">
          <div className="hidden md:flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">{user.full_name}</span>
            <Badge variant={roleBadgeVariants[user.role]} className="text-[10px] px-1.5 py-0">
              {roleDisplayNames[user.role]}
            </Badge>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleLogout} title="Sign Out">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      )}
    </nav>
  )
}
