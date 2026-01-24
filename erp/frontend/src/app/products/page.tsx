"use client"

import { useApi, useMutation } from "@/hooks/use-api"
import { api, type Product } from "@/lib/api"
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
import { Plus, Pencil, Trash2, FileText, Eye } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import Link from "next/link"
import { useRouter } from "next/navigation"

interface ProductFormData {
  part_number: string
  name: string
  description: string
}

const defaultFormData: ProductFormData = {
  part_number: "",
  name: "",
  description: "",
}

function ProductDialog({
  product,
  onSuccess,
  trigger,
}: {
  product?: Product
  onSuccess: () => void
  trigger: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [formData, setFormData] = useState<ProductFormData>(
    product
      ? {
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

  const columns: Column<Product>[] = [
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
        <span className="max-w-[300px] truncate block" title={product.description || ""}>
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
          onSuccess={refetch}
          trigger={
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Product
            </Button>
          }
        />
      </div>

      <DataTable
        data={products}
        columns={columns}
        isLoading={isLoading}
        searchKey="part_number"
        searchPlaceholder="Search by part number..."
        emptyMessage="No products found. Add your first product to get started."
        onRowClick={(product) => router.push(`/products/${product.id}`)}
      />
    </div>
  )
}
