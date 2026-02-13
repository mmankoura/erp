"use client"

import { useEffect, useState } from "react"
import { api, ApiError } from "@/lib/api"
import { useAuth, UserRole, User } from "@/contexts/auth-context"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Plus, Pencil, UserCog } from "lucide-react"
import { useRouter } from "next/navigation"

interface CreateUserDto {
  email?: string
  username: string
  password: string
  full_name: string
  role?: UserRole
  is_active?: boolean
}

interface UpdateUserDto {
  email?: string
  username?: string
  password?: string
  full_name?: string
  role?: UserRole
  is_active?: boolean
}

const roleOptions = [
  { value: UserRole.ADMIN, label: "Admin", description: "Full access including user management" },
  { value: UserRole.MANAGER, label: "Manager", description: "Full access except user management" },
  { value: UserRole.WAREHOUSE_CLERK, label: "Warehouse Clerk", description: "Inventory operations only" },
  { value: UserRole.OPERATOR, label: "Operator", description: "View only access" },
]

const roleBadgeVariants: Record<UserRole, "default" | "secondary" | "outline"> = {
  [UserRole.ADMIN]: "default",
  [UserRole.MANAGER]: "secondary",
  [UserRole.WAREHOUSE_CLERK]: "outline",
  [UserRole.OPERATOR]: "outline",
}

export default function UsersPage() {
  const router = useRouter()
  const { canManageUsers, user: currentUser } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Form state for create
  const [createForm, setCreateForm] = useState<CreateUserDto>({
    email: "",
    username: "",
    password: "",
    full_name: "",
    role: UserRole.OPERATOR,
    is_active: true,
  })

  // Form state for edit
  const [editForm, setEditForm] = useState<UpdateUserDto>({})

  // Check if user has permission to view this page
  useEffect(() => {
    if (!canManageUsers()) {
      router.push("/")
      toast.error("Access denied. Admin privileges required.")
    }
  }, [canManageUsers, router])

  // Fetch users
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const data = await api.get<User[]>("/auth/users")
        setUsers(data)
      } catch (error) {
        const message = error instanceof ApiError ? error.message : "Failed to load users"
        toast.error(message)
      } finally {
        setIsLoading(false)
      }
    }

    if (canManageUsers()) {
      fetchUsers()
    }
  }, [canManageUsers])

  // Create user
  const handleCreate = async () => {
    if (!createForm.username || !createForm.password || !createForm.full_name) {
      toast.error("Please fill in all required fields")
      return
    }

    setIsSubmitting(true)
    try {
      // Only include email if provided
      const { email, ...rest } = createForm
      const payload = email ? { ...rest, email } : rest
      const newUser = await api.post<User>("/auth/users", payload)
      setUsers([newUser, ...users])
      setIsCreateDialogOpen(false)
      setCreateForm({
        email: "",
        username: "",
        password: "",
        full_name: "",
        role: UserRole.OPERATOR,
        is_active: true,
      })
      toast.success("User created successfully")
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Failed to create user"
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Edit user
  const handleEdit = async () => {
    if (!selectedUser) return

    setIsSubmitting(true)
    try {
      const updatedUser = await api.patch<User>(`/auth/users/${selectedUser.id}`, editForm)
      setUsers(users.map(u => u.id === updatedUser.id ? updatedUser : u))
      setIsEditDialogOpen(false)
      setSelectedUser(null)
      setEditForm({})
      toast.success("User updated successfully")
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Failed to update user"
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Open edit dialog
  const openEditDialog = (user: User) => {
    setSelectedUser(user)
    setEditForm({
      email: user.email,
      username: user.username,
      full_name: user.full_name,
      role: user.role,
      is_active: user.is_active,
    })
    setIsEditDialogOpen(true)
  }

  if (!canManageUsers()) {
    return null
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading users...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <UserCog className="h-6 w-6" />
            User Management
          </h1>
          <p className="text-muted-foreground">Manage user accounts and permissions</p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add User
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New User</DialogTitle>
              <DialogDescription>
                Add a new user to the system. They will be able to log in with the credentials you provide.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="full_name">Full Name *</Label>
                <Input
                  id="full_name"
                  value={createForm.full_name}
                  onChange={(e) => setCreateForm({ ...createForm, full_name: e.target.value })}
                  placeholder="John Doe"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email (optional)</Label>
                <Input
                  id="email"
                  type="email"
                  value={createForm.email}
                  onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                  placeholder="john@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="username">Username *</Label>
                <Input
                  id="username"
                  value={createForm.username}
                  onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
                  placeholder="johnd"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password *</Label>
                <Input
                  id="password"
                  type="password"
                  value={createForm.password}
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                  placeholder="Minimum 8 characters"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <Select
                  value={createForm.role}
                  onValueChange={(value: UserRole) => setCreateForm({ ...createForm, role: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    {roleOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        <div>
                          <div>{option.label}</div>
                          <div className="text-xs text-muted-foreground">{option.description}</div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={isSubmitting}>
                {isSubmitting ? "Creating..." : "Create User"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Username</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last Login</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">{user.full_name}</TableCell>
                <TableCell>{user.username}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>
                  <Badge variant={roleBadgeVariants[user.role]}>
                    {roleOptions.find(r => r.value === user.role)?.label || user.role}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={user.is_active ? "default" : "secondary"}>
                    {user.is_active ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell>
                  {user.last_login_at
                    ? new Date(user.last_login_at).toLocaleDateString()
                    : "Never"}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openEditDialog(user)}
                    disabled={user.id === currentUser?.id}
                    title={user.id === currentUser?.id ? "Cannot edit your own account" : "Edit user"}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {users.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  No users found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Edit User Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Update user information. Leave password blank to keep current password.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit_full_name">Full Name</Label>
              <Input
                id="edit_full_name"
                value={editForm.full_name || ""}
                onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_email">Email</Label>
              <Input
                id="edit_email"
                type="email"
                value={editForm.email || ""}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_username">Username</Label>
              <Input
                id="edit_username"
                value={editForm.username || ""}
                onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_password">New Password (optional)</Label>
              <Input
                id="edit_password"
                type="password"
                value={editForm.password || ""}
                onChange={(e) => setEditForm({ ...editForm, password: e.target.value || undefined })}
                placeholder="Leave blank to keep current"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_role">Role</Label>
              <Select
                value={editForm.role}
                onValueChange={(value: UserRole) => setEditForm({ ...editForm, role: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {roleOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <div>
                        <div>{option.label}</div>
                        <div className="text-xs text-muted-foreground">{option.description}</div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="edit_is_active"
                checked={editForm.is_active}
                onCheckedChange={(checked) => setEditForm({ ...editForm, is_active: checked === true })}
              />
              <Label htmlFor="edit_is_active">Account Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEdit} disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
