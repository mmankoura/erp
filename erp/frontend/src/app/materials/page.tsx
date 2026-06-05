"use client"

import { useApi, useMutation } from "@/hooks/use-api"
import { api, type Material, type Customer } from "@/lib/api"
import { VirtualGrid, type VirtualGridColumn } from "@/components/virtual-grid"
import { RelationalFilterBuilder, type FilterGroup } from "@/components/relational-filter-builder"
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
import { Plus, Pencil, Trash2, X, Filter, Eye, ChevronDown, ChevronUp } from "lucide-react"
import { useState, useMemo, useEffect } from "react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"

const uomOptions = ["EA", "FT", "IN", "M", "CM", "MM", "KG", "G", "LB", "OZ", "L", "ML", "GAL"]
const categoryOptions = ["Resistors", "Capacitors", "Inductors", "ICs", "Connectors", "PCBs", "Mechanical", "Labels", "Other"]
const resourceTypeOptions = ["SMT", "TH", "MECH", "PCB", "DNP"] as const

interface MaterialFormData {
  customer_id: string
  internal_part_number: string
  manufacturer_pn: string
  manufacturer: string
  description: string
  category: string
  uom: string
  resource_type: string
}

const defaultFormData: MaterialFormData = {
  customer_id: "",
  internal_part_number: "",
  manufacturer_pn: "",
  manufacturer: "",
  description: "",
  category: "",
  uom: "EA",
  resource_type: "",
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
  const [formData, setFormData] = useState<MaterialFormData>(defaultFormData)

  // Reset form data when dialog opens
  useEffect(() => {
    if (open) {
      setFormData(
        material
          ? {
              customer_id: material.customer_id || "",
              internal_part_number: material.internal_part_number,
              manufacturer_pn: material.manufacturer_pn || "",
              manufacturer: material.manufacturer || "",
              description: material.description || "",
              category: material.category || "",
              uom: material.uom,
              resource_type: material.resource_type || "",
            }
          : defaultFormData
      )
    }
  }, [open, material])

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
    const payload = {
      ...formData,
      resource_type: formData.resource_type || null,
    }
    if (material) {
      updateMutation.mutate(payload as MaterialFormData)
    } else {
      createMutation.mutate(payload as MaterialFormData)
    }
  }

  const isLoading = createMutation.isLoading || updateMutation.isLoading

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        className="sm:max-w-[500px]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
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
            <div className="grid grid-cols-3 gap-4">
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
                <Label htmlFor="resource_type">Resource Type</Label>
                <Select
                  value={formData.resource_type}
                  onValueChange={(value) => setFormData({ ...formData, resource_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {resourceTypeOptions.map((rt) => (
                      <SelectItem key={rt} value={rt}>
                        {rt}
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
  const { canEdit } = useAuth()
  const { data: materials, isLoading, refetch } = useApi<Material[]>("/materials")
  const { data: customers } = useApi<Customer[]>("/customers")

  const [customerFilter, setCustomerFilter] = useState<string>("all")
  const [ipnFilter, setIpnFilter] = useState("")
  const [mpnFilter, setMpnFilter] = useState("")
  const [descriptionFilter, setDescriptionFilter] = useState("")
  const [showFilters, setShowFilters] = useState(false)

  // Relational filter state
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  const [relationalFilterIds, setRelationalFilterIds] = useState<Set<string> | null>(null)
  const [activeRelationalFilterCount, setActiveRelationalFilterCount] = useState(0)

  const handleRelationalApply = async (filters: FilterGroup[], logic: "AND" | "OR") => {
    try {
      const result = await api.post<Material[]>("/materials/filter", { filters, logic })
      const ids = new Set(result.map((m) => m.id))
      setRelationalFilterIds(ids)
      setActiveRelationalFilterCount(filters.length)
    } catch {
      setRelationalFilterIds(null)
      setActiveRelationalFilterCount(0)
    }
  }

  const handleRelationalClear = () => {
    setRelationalFilterIds(null)
    setActiveRelationalFilterCount(0)
  }

  const filteredMaterials = useMemo(() => {
    if (!materials) return null

    return materials.filter((material) => {
      if (relationalFilterIds !== null && !relationalFilterIds.has(material.id)) {
        return false
      }
      if (customerFilter !== "all" && material.customer_id !== customerFilter) {
        return false
      }
      if (ipnFilter && !material.internal_part_number.toLowerCase().includes(ipnFilter.toLowerCase())) {
        return false
      }
      if (mpnFilter && !(material.manufacturer_pn?.toLowerCase().includes(mpnFilter.toLowerCase()) ?? false)) {
        return false
      }
      if (descriptionFilter && !(material.description?.toLowerCase().includes(descriptionFilter.toLowerCase()) ?? false)) {
        return false
      }
      return true
    })
  }, [materials, customerFilter, ipnFilter, mpnFilter, descriptionFilter, relationalFilterIds])

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

  const columns: VirtualGridColumn<Material>[] = [
    {
      id: "customer",
      header: "Customer",
      size: 140,
      sortable: true,
      filterable: true,
      accessorFn: (m) => m.customer?.name || "",
      filterAccessor: (m) => m.customer?.name || "-",
      cell: (m) => m.customer?.name || "-",
    },
    {
      id: "internal_part_number",
      header: "IPN",
      size: 150,
      sortable: true,
      accessorFn: (m) => m.internal_part_number,
      cell: (m) => <span className="font-medium">{m.internal_part_number}</span>,
    },
    {
      id: "manufacturer_pn",
      header: "Manufacturer P/N",
      size: 160,
      sortable: true,
      accessorFn: (m) => m.manufacturer_pn || "",
      cell: (m) => m.manufacturer_pn || "-",
    },
    {
      id: "manufacturer",
      header: "Manufacturer",
      size: 140,
      sortable: true,
      filterable: true,
      accessorFn: (m) => m.manufacturer || "",
      filterAccessor: (m) => m.manufacturer || "-",
      cell: (m) => m.manufacturer || "-",
    },
    {
      id: "description",
      header: "Description",
      size: 250,
      sortable: true,
      accessorFn: (m) => m.description || "",
      cell: (m) => (
        <span className="truncate block" title={m.description || ""}>
          {m.description || "-"}
        </span>
      ),
    },
    {
      id: "resource_type",
      header: "Type",
      size: 80,
      sortable: true,
      filterable: true,
      accessorFn: (m) => m.resource_type || "",
      filterAccessor: (m) => m.resource_type || "-",
      cell: (m) =>
        m.resource_type ? <Badge variant="outline">{m.resource_type}</Badge> : "-",
    },
    {
      id: "category",
      header: "Category",
      size: 100,
      sortable: true,
      filterable: true,
      accessorFn: (m) => m.category || "",
      filterAccessor: (m) => m.category || "-",
      cell: (m) =>
        m.category ? <Badge variant="secondary">{m.category}</Badge> : "-",
    },
    {
      id: "uom",
      header: "UOM",
      size: 80,
      sortable: true,
      filterable: true,
      accessorFn: (m) => m.uom,
      filterAccessor: (m) => m.uom,
      cell: (m) => m.uom,
    },
    {
      id: "actions",
      header: "",
      size: 130,
      sortable: false,
      filterable: false,
      accessorFn: () => "",
      cell: (m) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={(e) => {
              e.stopPropagation()
              router.push(`/materials/${m.id}`)
            }}
            title="View details"
          >
            <Eye className="h-4 w-4" />
          </Button>
          {canEdit() && (
            <>
              <MaterialDialog
                material={m}
                customers={customers || []}
                onSuccess={refetch}
                trigger={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={(e) => e.stopPropagation()}
                  >
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
                    deleteMutation.mutate(m.id)
                  }
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
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
        {canEdit() && (
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
        )}
      </div>

      {/* Filters */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
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

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="h-4 w-4 mr-1" />
              Clear filters
            </Button>
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

        {/* Advanced Relational Filters */}
        <div>
          <button
            type="button"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
          >
            {showAdvancedFilters ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            Advanced Filters
            {activeRelationalFilterCount > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs">
                {activeRelationalFilterCount} active
              </Badge>
            )}
          </button>
          {showAdvancedFilters && (
            <div className="mt-2 p-4 bg-muted/30 rounded-lg border">
              <RelationalFilterBuilder
                onApply={handleRelationalApply}
                onClear={handleRelationalClear}
                activeFilterCount={activeRelationalFilterCount}
              />
            </div>
          )}
        </div>
      </div>

      <VirtualGrid
        data={filteredMaterials}
        columns={columns}
        isLoading={isLoading}
        searchPlaceholder="Search by IPN, MPN, manufacturer, or description..."
        searchFn={(m, q) =>
          m.internal_part_number.toLowerCase().includes(q) ||
          (m.manufacturer_pn?.toLowerCase().includes(q) ?? false) ||
          (m.manufacturer?.toLowerCase().includes(q) ?? false) ||
          (m.description?.toLowerCase().includes(q) ?? false) ||
          (m.customer?.name?.toLowerCase().includes(q) ?? false)
        }
      />
    </div>
  )
}
