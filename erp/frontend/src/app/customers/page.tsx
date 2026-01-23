"use client"

import { useApi, useMutation } from "@/hooks/use-api"
import { api, type Customer } from "@/lib/api"
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
import { Plus, Pencil, Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

interface CustomerFormData {
  name: string
  code: string
  email: string
  phone: string
  address: string
  notes: string
}

const defaultFormData: CustomerFormData = {
  name: "",
  code: "",
  email: "",
  phone: "",
  address: "",
  notes: "",
}

function CustomerDialog({
  customer,
  onSuccess,
  trigger,
}: {
  customer?: Customer
  onSuccess: () => void
  trigger: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [formData, setFormData] = useState<CustomerFormData>(
    customer
      ? {
          name: customer.name,
          code: customer.code,
          email: customer.email || "",
          phone: customer.phone || "",
          address: customer.address || "",
          notes: customer.notes || "",
        }
      : defaultFormData
  )

  const createMutation = useMutation(
    (data: CustomerFormData) => api.post<Customer>("/customers", data),
    {
      onSuccess: () => {
        toast.success("Customer created successfully")
        setOpen(false)
        setFormData(defaultFormData)
        onSuccess()
      },
      onError: (error) => {
        toast.error(error.message || "Failed to create customer")
      },
    }
  )

  const updateMutation = useMutation(
    (data: CustomerFormData) => api.patch<Customer>(`/customers/${customer?.id}`, data),
    {
      onSuccess: () => {
        toast.success("Customer updated successfully")
        setOpen(false)
        onSuccess()
      },
      onError: (error) => {
        toast.error(error.message || "Failed to update customer")
      },
    }
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (customer) {
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
            <DialogTitle>{customer ? "Edit Customer" : "Add Customer"}</DialogTitle>
            <DialogDescription>
              {customer
                ? "Update the customer information below."
                : "Enter the details for the new customer."}
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
                  placeholder="e.g., Acme Corp"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="code">Code *</Label>
                <Input
                  id="code"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  placeholder="e.g., ACME"
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
                  placeholder="contact@example.com"
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
              {isLoading ? "Saving..." : customer ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default function CustomersPage() {
  const { data: customers, isLoading, refetch } = useApi<Customer[]>("/customers")

  const deleteMutation = useMutation(
    (id: string) => api.delete(`/customers/${id}`),
    {
      onSuccess: () => {
        toast.success("Customer deleted successfully")
        refetch()
      },
      onError: (error) => {
        toast.error(error.message || "Failed to delete customer")
      },
    }
  )

  const columns: Column<Customer>[] = [
    {
      key: "code",
      header: "Code",
      cell: (customer) => <span className="font-medium">{customer.code}</span>,
    },
    {
      key: "name",
      header: "Name",
      cell: (customer) => customer.name,
    },
    {
      key: "email",
      header: "Email",
      cell: (customer) => customer.email || "-",
    },
    {
      key: "phone",
      header: "Phone",
      cell: (customer) => customer.phone || "-",
    },
    {
      key: "actions",
      header: "",
      className: "w-[100px]",
      cell: (customer) => (
        <div className="flex items-center gap-1">
          <CustomerDialog
            customer={customer}
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
              if (confirm("Are you sure you want to delete this customer?")) {
                deleteMutation.mutate(customer.id)
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
          <h1 className="text-3xl font-bold tracking-tight">Customers</h1>
          <p className="text-muted-foreground">
            Manage your customer accounts
          </p>
        </div>
        <CustomerDialog
          onSuccess={refetch}
          trigger={
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Customer
            </Button>
          }
        />
      </div>

      <DataTable
        data={customers}
        columns={columns}
        isLoading={isLoading}
        searchKey="name"
        searchPlaceholder="Search by name..."
        emptyMessage="No customers found. Add your first customer to get started."
      />
    </div>
  )
}
