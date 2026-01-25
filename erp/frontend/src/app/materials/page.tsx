"use client"

import { useApi, useMutation } from "@/hooks/use-api"
import { api, type Material } from "@/lib/api"
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

const uomOptions = ["EA", "FT", "IN", "M", "CM", "MM", "KG", "G", "LB", "OZ", "L", "ML", "GAL"]
const categoryOptions = ["Resistors", "Capacitors", "Inductors", "ICs", "Connectors", "PCBs", "Mechanical", "Labels", "Other"]

interface MaterialFormData {
  internal_part_number: string
  manufacturer_pn: string
  manufacturer: string
  description: string
  category: string
  uom: string
}

const defaultFormData: MaterialFormData = {
  internal_part_number: "",
  manufacturer_pn: "",
  manufacturer: "",
  description: "",
  category: "",
  uom: "EA",
}

function MaterialDialog({
  material,
  onSuccess,
  trigger,
}: {
  material?: Material
  onSuccess: () => void
  trigger: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [formData, setFormData] = useState<MaterialFormData>(
    material
      ? {
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
  const { data: materials, isLoading, refetch } = useApi<Material[]>("/materials")
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

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
      key: "internal_part_number",
      header: "IPN",
      cell: (material) => (
        <span className="font-medium">{material.internal_part_number}</span>
      ),
    },
    {
      key: "manufacturer_pn",
      header: "Manufacturer P/N",
      cell: (material) => material.manufacturer_pn || "-",
    },
    {
      key: "manufacturer",
      header: "Manufacturer",
      cell: (material) => material.manufacturer || "-",
    },
    {
      key: "description",
      header: "Description",
      cell: (material) => (
        <span className="max-w-[200px] truncate block" title={material.description || ""}>
          {material.description || "-"}
        </span>
      ),
    },
    {
      key: "category",
      header: "Category",
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
      cell: (material) => material.uom,
    },
    {
      key: "actions",
      header: "",
      className: "w-[100px]",
      cell: (material) => (
        <div className="flex items-center gap-1">
          <MaterialDialog
            material={material}
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
          onSuccess={refetch}
          trigger={
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Material
            </Button>
          }
        />
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
        data={materials}
        columns={columns}
        isLoading={isLoading}
        searchKey="internal_part_number"
        searchPlaceholder="Search by IPN..."
        emptyMessage="No materials found. Add your first material to get started."
        selectable
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
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
