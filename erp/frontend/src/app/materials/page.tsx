"use client"

import { useApi, useMutation } from "@/hooks/use-api"
import { api, type Material, type Customer } from "@/lib/api"
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
import { Plus, Pencil, Trash2, X, Search, Filter, Eye } from "lucide-react"
import { useState, useMemo } from "react"
import { toast } from "sonner"
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

const uomOptions = ["EA", "FT", "IN", "M", "CM", "MM", "KG", "G", "LB", "OZ", "L", "ML", "GAL"]
const categoryOptions = ["Resistors", "Capacitors", "Inductors", "ICs", "Connectors", "PCBs", "Mechanical", "Labels", "Other"]

interface MaterialFormData {
  customer_id: string
  internal_part_number: string
  manufacturer_pn: string
  manufacturer: string
  description: string
  category: string
  uom: string
}

const defaultFormData: MaterialFormData = {
  customer_id: "",
  internal_part_number: "",
  manufacturer_pn: "",
  manufacturer: "",
  description: "",
  category: "",
  uom: "EA",
}

function MaterialDialog({
  material,
  customers,
  onSuccess,
  trigger,
}: {
  material?: Material
  customers: Customer[]
  onSuccess: () => void
  trigger: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [formData, setFormData] = useState<MaterialFormData>(
    material
      ? {
          customer_id: material.customer_id || "",
          internal_part_number: material.internal_part_number,
          manufacturer_pn: material.manufacturer_pn || "",
          manufacturer: material.manufacturer || "",
          description: material.description || "",
          category: material.category || "",
          uom: material.uom,
        }
      : defaultFormData
  )

  const createMutation = useMutation(
    (data: MaterialFormData) => api.post<Material>("/materials", data),
    {
      onSuccess: () => {
        toast.success("Material created successfully")
        setOpen(false)
        setFormData(defaultFormData)
        onSuccess()
      },
      onError: (error) => {
        toast.error(error.message || "Failed to create material")
      },
    }
  )

  const updateMutation = useMutation(
    (data: MaterialFormData) => api.patch<Material>(`/materials/${material?.id}`, data),
    {
      onSuccess: () => {
        toast.success("Material updated successfully")
        setOpen(false)
        onSuccess()
      },
      onError: (error) => {
        toast.error(error.message || "Failed to update material")
      },
    }
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (material) {
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
            <DialogTitle>{material ? "Edit Material" : "Add Material"}</DialogTitle>
            <DialogDescription>
              {material
                ? "Update the material information below."
                : "Enter the details for the new material."}
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
              <Label htmlFor="internal_part_number">Internal Part Number *</Label>
              <Input
                id="internal_part_number"
                value={formData.internal_part_number}
                onChange={(e) =>
                  setFormData({ ...formData, internal_part_number: e.target.value })
                }
                placeholder="e.g., RES-10K-0402"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="manufacturer">Manufacturer</Label>
                <Input
                  id="manufacturer"
                  value={formData.manufacturer}
                  onChange={(e) =>
                    setFormData({ ...formData, manufacturer: e.target.value })
                  }
                  placeholder="e.g., Yageo"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="manufacturer_pn">Manufacturer P/N</Label>
                <Input
                  id="manufacturer_pn"
                  value={formData.manufacturer_pn}
                  onChange={(e) =>
                    setFormData({ ...formData, manufacturer_pn: e.target.value })
                  }
                  placeholder="e.g., RC0402FR-0710KL"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="e.g., 10K Ohm 1% 0402 Resistor"
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="category">Category</Label>
                <Select
                  value={formData.category}
                  onValueChange={(value) =>
                    setFormData({ ...formData, category: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categoryOptions.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="uom">Unit of Measure *</Label>
                <Select
                  value={formData.uom}
                  onValueChange={(value) => setFormData({ ...formData, uom: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select UOM" />
                  </SelectTrigger>
                  <SelectContent>
                    {uomOptions.map((uom) => (
                      <SelectItem key={uom} value={uom}>
                        {uom}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Saving..." : material ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default function MaterialsPage() {
  const router = useRouter()
  const { data: materials, isLoading, refetch } = useApi<Material[]>("/materials")
  const { data: customers } = useApi<Customer[]>("/customers")
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  // Search and filter state
  const [search, setSearch] = useState("")
  const [customerFilter, setCustomerFilter] = useState<string>("all")
  const [ipnFilter, setIpnFilter] = useState("")
  const [mpnFilter, setMpnFilter] = useState("")
  const [descriptionFilter, setDescriptionFilter] = useState("")
  const [showFilters, setShowFilters] = useState(false)

  // Filter materials based on search and filters
  const filteredMaterials = useMemo(() => {
    if (!materials) return null

    return materials.filter((material) => {
      // Search across IPN, MPN, and description
      if (search) {
        const searchLower = search.toLowerCase()
        const matchesSearch =
          material.internal_part_number.toLowerCase().includes(searchLower) ||
          (material.manufacturer_pn?.toLowerCase().includes(searchLower) ?? false) ||
          (material.description?.toLowerCase().includes(searchLower) ?? false)
        if (!matchesSearch) return false
      }

      // Filter by customer
      if (customerFilter !== "all" && material.customer_id !== customerFilter) {
        return false
      }

      // Filter by IPN
      if (ipnFilter && !material.internal_part_number.toLowerCase().includes(ipnFilter.toLowerCase())) {
        return false
      }

      // Filter by MPN
      if (mpnFilter && !(material.manufacturer_pn?.toLowerCase().includes(mpnFilter.toLowerCase()) ?? false)) {
        return false
      }

      // Filter by description
      if (descriptionFilter && !(material.description?.toLowerCase().includes(descriptionFilter.toLowerCase()) ?? false)) {
        return false
      }

      return true
    })
  }, [materials, search, customerFilter, ipnFilter, mpnFilter, descriptionFilter])

  const hasActiveFilters = customerFilter !== "all" || ipnFilter || mpnFilter || descriptionFilter

  const clearFilters = () => {
    setCustomerFilter("all")
    setIpnFilter("")
    setMpnFilter("")
    setDescriptionFilter("")
  }

  const deleteMutation = useMutation(
    (id: string) => api.delete(`/materials/${id}`),
    {
      onSuccess: () => {
        toast.success("Material deleted successfully")
        refetch()
      },
      onError: (error) => {
        toast.error(error.message || "Failed to delete material")
      },
    }
  )

  const bulkDeleteMutation = useMutation(
    async (ids: string[]) => {
      // Delete sequentially to avoid overwhelming the server
      for (const id of ids) {
        await api.delete(`/materials/${id}`)
      }
    },
    {
      onSuccess: () => {
        toast.success(`${selectedIds.length} material(s) deleted successfully`)
        setSelectedIds([])
        setShowDeleteDialog(false)
        refetch()
      },
      onError: (error) => {
        toast.error(error.message || "Failed to delete materials")
        setShowDeleteDialog(false)
        refetch() // Refetch to show current state after partial failure
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

  const columns: Column<Material>[] = [
    {
      key: "customer",
      header: "Customer",
      defaultWidth: 140,
      cell: (material) => material.customer?.name || "-",
    },
    {
      key: "internal_part_number",
      header: "IPN",
      defaultWidth: 150,
      cell: (material) => (
        <span className="font-medium">{material.internal_part_number}</span>
      ),
    },
    {
      key: "manufacturer_pn",
      header: "Manufacturer P/N",
      defaultWidth: 160,
      cell: (material) => material.manufacturer_pn || "-",
    },
    {
      key: "manufacturer",
      header: "Manufacturer",
      defaultWidth: 140,
      cell: (material) => material.manufacturer || "-",
    },
    {
      key: "description",
      header: "Description",
      defaultWidth: 250,
      cell: (material) => (
        <span className="truncate block" title={material.description || ""}>
          {material.description || "-"}
        </span>
      ),
    },
    {
      key: "category",
      header: "Category",
      defaultWidth: 100,
      cell: (material) =>
        material.category ? (
          <Badge variant="secondary">{material.category}</Badge>
        ) : (
          "-"
        ),
    },
    {
      key: "uom",
      header: "UOM",
      defaultWidth: 80,
      cell: (material) => material.uom,
    },
    {
      key: "actions",
      header: "",
      defaultWidth: 100,
      resizable: false,
      className: "w-[100px]",
      cell: (material) => (
        <div className="flex items-center gap-1">
          <MaterialDialog
            material={material}
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
              if (confirm("Are you sure you want to delete this material?")) {
                deleteMutation.mutate(material.id)
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
          <h1 className="text-3xl font-bold tracking-tight">Materials</h1>
          <p className="text-muted-foreground">
            Manage your inventory of raw materials and components
          </p>
        </div>
        <MaterialDialog
          customers={customers || []}
          onSuccess={refetch}
          trigger={
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Material
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
              placeholder="Search by IPN, MPN, or description..."
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
                {[customerFilter !== "all", ipnFilter, mpnFilter, descriptionFilter].filter(Boolean).length}
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
          {(search || hasActiveFilters) && filteredMaterials && (
            <span className="text-sm text-muted-foreground">
              {filteredMaterials.length} result{filteredMaterials.length !== 1 ? "s" : ""}
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
            <div className="space-y-2">
              <Label htmlFor="filter-ipn" className="text-sm font-medium">IPN</Label>
              <Input
                id="filter-ipn"
                placeholder="Filter by IPN..."
                value={ipnFilter}
                onChange={(e) => setIpnFilter(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="filter-mpn" className="text-sm font-medium">Manufacturer P/N</Label>
              <Input
                id="filter-mpn"
                placeholder="Filter by MPN..."
                value={mpnFilter}
                onChange={(e) => setMpnFilter(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="filter-description" className="text-sm font-medium">Description</Label>
              <Input
                id="filter-description"
                placeholder="Filter by description..."
                value={descriptionFilter}
                onChange={(e) => setDescriptionFilter(e.target.value)}
              />
            </div>
          </div>
        )}
      </div>

      {/* Selection toolbar */}
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
        data={filteredMaterials}
        columns={columns}
        isLoading={isLoading}
        emptyMessage="No materials found. Add your first material to get started."
        selectable
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        onRowClick={(material) => router.push(`/materials/${material.id}`)}
        storageKey="materials"
      />

      {/* Bulk delete confirmation dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.length} material(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The selected materials will be permanently deleted.
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
