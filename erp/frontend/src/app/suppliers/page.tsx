"use client"

import { useApi, useMutation } from "@/hooks/use-api"
import { api, type Supplier } from "@/lib/api"
import { DataTable, type Column } from "@/components/data-table"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Plus, Pencil, Trash2, X } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface SupplierFormData {
  name: string
  code: string
  email: string
  phone: string
  address: string
  notes: string
}

const defaultFormData: SupplierFormData = {
  name: "",
  code: "",
  email: "",
  phone: "",
  address: "",
  notes: "",
}

function SupplierDialog({
  supplier,
  onSuccess,
  trigger,
}: {
  supplier?: Supplier
  onSuccess: () => void
  trigger: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [formData, setFormData] = useState<SupplierFormData>(
    supplier
      ? {
          name: supplier.name,
          code: supplier.code,
          email: supplier.email || "",
          phone: supplier.phone || "",
          address: supplier.address || "",
          notes: supplier.notes || "",
        }
      : defaultFormData
  )

  const createMutation = useMutation(
    (data: SupplierFormData) => api.post<Supplier>("/suppliers", data),
    {
      onSuccess: () => {
        toast.success("Supplier created successfully")
        setOpen(false)
        setFormData(defaultFormData)
        onSuccess()
      },
      onError: (error) => {
        toast.error(error.message || "Failed to create supplier")
      },
    }
  )

  const updateMutation = useMutation(
    (data: SupplierFormData) => api.patch<Supplier>(`/suppliers/${supplier?.id}`, data),
    {
      onSuccess: () => {
        toast.success("Supplier updated successfully")
        setOpen(false)
        onSuccess()
      },
      onError: (error) => {
        toast.error(error.message || "Failed to update supplier")
      },
    }
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (supplier) {
      updateMutation.mutate(formData)
    } else {
      createMutation.mutate(formData)
    }
  }

  const isLoading = createMutation.isLoading || updateMutation.isLoading

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{supplier ? "Edit Supplier" : "Add Supplier"}</DialogTitle>
            <DialogDescription>
              {supplier
                ? "Update the supplier information below."
                : "Enter the details for the new supplier."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Digi-Key"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="code">Code *</Label>
                <Input
                  id="code"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  placeholder="e.g., DK"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="orders@supplier.com"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+1 (555) 123-4567"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="address">Address</Label>
              <Textarea
                id="address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="Street address, city, state, zip"
                rows={2}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Additional notes..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Saving..." : supplier ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default function SuppliersPage() {
  const { data: suppliers, isLoading, refetch } = useApi<Supplier[]>("/suppliers")
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  const deleteMutation = useMutation(
    (id: string) => api.delete(`/suppliers/${id}`),
    {
      onSuccess: () => {
        toast.success("Supplier deleted successfully")
        refetch()
      },
      onError: (error) => {
        toast.error(error.message || "Failed to delete supplier")
      },
    }
  )

  const bulkDeleteMutation = useMutation(
    async (ids: string[]) => {
      for (const id of ids) {
        await api.delete(`/suppliers/${id}`)
      }
    },
    {
      onSuccess: () => {
        toast.success(`${selectedIds.length} supplier(s) deleted successfully`)
        setSelectedIds([])
        setShowDeleteDialog(false)
        refetch()
      },
      onError: (error) => {
        toast.error(error.message || "Failed to delete suppliers")
        setShowDeleteDialog(false)
        refetch()
      },
    }
  )

  const handleBulkDelete = () => {
    if (selectedIds.length === 0) return
    setShowDeleteDialog(true)
  }

  const confirmBulkDelete = () => {
    bulkDeleteMutation.mutate(selectedIds)
  }

  const columns: Column<Supplier>[] = [
    {
      key: "code",
      header: "Code",
      cell: (supplier) => <span className="font-medium">{supplier.code}</span>,
    },
    {
      key: "name",
      header: "Name",
      cell: (supplier) => supplier.name,
    },
    {
      key: "email",
      header: "Email",
      cell: (supplier) => supplier.email || "-",
    },
    {
      key: "phone",
      header: "Phone",
      cell: (supplier) => supplier.phone || "-",
    },
    {
      key: "actions",
      header: "",
      className: "w-[100px]",
      cell: (supplier) => (
        <div className="flex items-center gap-1">
          <SupplierDialog
            supplier={supplier}
            onSuccess={refetch}
            trigger={
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Pencil className="h-4 w-4" />
              </Button>
            }
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation()
              if (confirm("Are you sure you want to delete this supplier?")) {
                deleteMutation.mutate(supplier.id)
              }
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Suppliers</h1>
          <p className="text-muted-foreground">
            Manage your supplier accounts
          </p>
        </div>
        <SupplierDialog
          onSuccess={refetch}
          trigger={
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Supplier
            </Button>
          }
        />
      </div>

      {selectedIds.length > 0 && (
        <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg border">
          <span className="text-sm font-medium">
            {selectedIds.length} selected
          </span>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleBulkDelete}
            disabled={bulkDeleteMutation.isLoading}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {bulkDeleteMutation.isLoading ? "Deleting..." : "Delete Selected"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedIds([])}
          >
            <X className="h-4 w-4 mr-2" />
            Clear Selection
          </Button>
        </div>
      )}

      <DataTable
        data={suppliers}
        columns={columns}
        isLoading={isLoading}
        searchKey="name"
        searchPlaceholder="Search by name..."
        emptyMessage="No suppliers found. Add your first supplier to get started."
        selectable
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
      />

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.length} supplier(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The selected suppliers will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmBulkDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkDeleteMutation.isLoading ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
