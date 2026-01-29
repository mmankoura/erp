"use client"

import { useApi, useMutation } from "@/hooks/use-api"
import { api, type Product, type Customer } from "@/lib/api"
import { DataTable, type Column } from "@/components/data-table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Plus, Pencil, Trash2, FileText, Eye, X, Search, Filter } from "lucide-react"
import { useState, useMemo } from "react"
import { toast } from "sonner"
import Link from "next/link"
import { useRouter } from "next/navigation"
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

interface ProductFormData {
  customer_id: string
  part_number: string
  name: string
  description: string
}

const defaultFormData: ProductFormData = {
  customer_id: "",
  part_number: "",
  name: "",
  description: "",
}

function ProductDialog({
  product,
  customers,
  onSuccess,
  trigger,
}: {
  product?: Product
  customers: Customer[]
  onSuccess: () => void
  trigger: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [formData, setFormData] = useState<ProductFormData>(
    product
      ? {
          customer_id: product.customer_id,
          part_number: product.part_number,
          name: product.name,
          description: product.description || "",
        }
      : defaultFormData
  )

  const createMutation = useMutation(
    (data: ProductFormData) => api.post<Product>("/products", data),
    {
      onSuccess: () => {
        toast.success("Product created successfully")
        setOpen(false)
        setFormData(defaultFormData)
        onSuccess()
      },
      onError: (error) => {
        toast.error(error.message || "Failed to create product")
      },
    }
  )

  const updateMutation = useMutation(
    (data: ProductFormData) => api.patch<Product>(`/products/${product?.id}`, data),
    {
      onSuccess: () => {
        toast.success("Product updated successfully")
        setOpen(false)
        onSuccess()
      },
      onError: (error) => {
        toast.error(error.message || "Failed to update product")
      },
    }
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (product) {
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
            <DialogTitle>{product ? "Edit Product" : "Add Product"}</DialogTitle>
            <DialogDescription>
              {product
                ? "Update the product information below."
                : "Enter the details for the new product."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="customer_id">Customer *</Label>
              <Select
                value={formData.customer_id}
                onValueChange={(value) =>
                  setFormData({ ...formData, customer_id: value })
                }
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select customer" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="part_number">Part Number *</Label>
              <Input
                id="part_number"
                value={formData.part_number}
                onChange={(e) => setFormData({ ...formData, part_number: e.target.value })}
                placeholder="e.g., PROD-001"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Circuit Board Assembly"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Product description..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Saving..." : product ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default function ProductsPage() {
  const router = useRouter()
  const { data: products, isLoading, refetch } = useApi<Product[]>("/products")
  const { data: customers } = useApi<Customer[]>("/customers")
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  // Search and filter state
  const [search, setSearch] = useState("")
  const [customerFilter, setCustomerFilter] = useState<string>("all")
  const [showFilters, setShowFilters] = useState(false)

  // Filter products based on search and filters
  const filteredProducts = useMemo(() => {
    if (!products) return null

    return products.filter((product) => {
      // Search across part number, name, and description
      if (search) {
        const searchLower = search.toLowerCase()
        const matchesSearch =
          product.part_number.toLowerCase().includes(searchLower) ||
          product.name.toLowerCase().includes(searchLower) ||
          (product.description?.toLowerCase().includes(searchLower) ?? false)
        if (!matchesSearch) return false
      }

      // Filter by customer
      if (customerFilter !== "all" && product.customer_id !== customerFilter) {
        return false
      }

      return true
    })
  }, [products, search, customerFilter])

  const hasActiveFilters = customerFilter !== "all"

  const clearFilters = () => {
    setCustomerFilter("all")
  }

  const deleteMutation = useMutation(
    (id: string) => api.delete(`/products/${id}`),
    {
      onSuccess: () => {
        toast.success("Product deleted successfully")
        refetch()
      },
      onError: (error) => {
        toast.error(error.message || "Failed to delete product")
      },
    }
  )

  const bulkDeleteMutation = useMutation(
    async (ids: string[]) => {
      for (const id of ids) {
        await api.delete(`/products/${id}`)
      }
    },
    {
      onSuccess: () => {
        toast.success(`${selectedIds.length} product(s) deleted successfully`)
        setSelectedIds([])
        setShowDeleteDialog(false)
        refetch()
      },
      onError: (error) => {
        toast.error(error.message || "Failed to delete products")
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

  const columns: Column<Product>[] = [
    {
      key: "customer",
      header: "Customer",
      cell: (product) => product.customer?.name || "-",
    },
    {
      key: "part_number",
      header: "Part Number",
      cell: (product) => <span className="font-medium">{product.part_number}</span>,
    },
    {
      key: "name",
      header: "Name",
      cell: (product) => product.name,
    },
    {
      key: "description",
      header: "Description",
      cell: (product) => (
        <span className="max-w-[200px] truncate block" title={product.description || ""}>
          {product.description || "-"}
        </span>
      ),
    },
    {
      key: "bom",
      header: "BOM",
      cell: (product) =>
        product.active_bom_revision_id ? (
          <Badge variant="secondary" className="gap-1">
            <FileText className="h-3 w-3" />
            Active
          </Badge>
        ) : (
          <span className="text-muted-foreground text-sm">No BOM</span>
        ),
    },
    {
      key: "actions",
      header: "",
      className: "w-[130px]",
      cell: (product) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={(e) => {
              e.stopPropagation()
              router.push(`/products/${product.id}`)
            }}
            title="View BOM"
          >
            <Eye className="h-4 w-4" />
          </Button>
          <ProductDialog
            product={product}
            customers={customers || []}
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
              if (confirm("Are you sure you want to delete this product?")) {
                deleteMutation.mutate(product.id)
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
          <h1 className="text-3xl font-bold tracking-tight">Products</h1>
          <p className="text-muted-foreground">
            Manage finished products and their BOMs
          </p>
        </div>
        <ProductDialog
          customers={customers || []}
          onSuccess={refetch}
          trigger={
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Product
            </Button>
          }
        />
      </div>

      {/* Search and Filters */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          {/* Search box */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by part number, name, or description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>

          {/* Filter toggle button */}
          <Button
            variant={showFilters || hasActiveFilters ? "secondary" : "outline"}
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="h-4 w-4 mr-2" />
            Filters
            {hasActiveFilters && (
              <Badge variant="default" className="ml-2 h-5 w-5 p-0 flex items-center justify-center text-xs">
                1
              </Badge>
            )}
          </Button>

          {/* Clear filters */}
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="h-4 w-4 mr-1" />
              Clear filters
            </Button>
          )}

          {/* Results count */}
          {(search || hasActiveFilters) && filteredProducts && (
            <span className="text-sm text-muted-foreground">
              {filteredProducts.length} result{filteredProducts.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* Filter panel */}
        {showFilters && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-muted/30 rounded-lg border">
            <div className="space-y-2">
              <Label htmlFor="filter-customer" className="text-sm font-medium">Customer</Label>
              <Select value={customerFilter} onValueChange={setCustomerFilter}>
                <SelectTrigger id="filter-customer">
                  <SelectValue placeholder="All customers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All customers</SelectItem>
                  {customers?.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
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
        data={filteredProducts}
        columns={columns}
        isLoading={isLoading}
        emptyMessage="No products found. Add your first product to get started."
        onRowClick={(product) => router.push(`/products/${product.id}`)}
        selectable
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
      />

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.length} product(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The selected products will be permanently deleted.
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
