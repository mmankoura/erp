"use client"

import { useApi, useMutation } from "@/hooks/use-api"
import {
  api,
  type Product,
  type BomRevision,
  type BomItem,
  type Material,
  type CreateBomRevisionDto,
  type CreateBomItemDto,
  type ResourceType,
} from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Separator } from "@/components/ui/separator"
import {
  ArrowLeft,
  Plus,
  FileText,
  CheckCircle,
  Pencil,
  Trash2,
  Copy,
  RotateCcw,
} from "lucide-react"
import { useState, useEffect } from "react"
import { toast } from "sonner"
import Link from "next/link"
import { useParams } from "next/navigation"

const resourceTypeLabels: Record<ResourceType, string> = {
  SMT: "SMT",
  TH: "Through-Hole",
  MECH: "Mechanical",
  PCB: "PCB",
  DNP: "Do Not Place",
}

export default function ProductDetailPage() {
  const params = useParams()
  const productId = params.id as string

  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(null)
  const [showNewRevisionDialog, setShowNewRevisionDialog] = useState(false)
  const [showAddItemDialog, setShowAddItemDialog] = useState(false)

  const { data: product, isLoading: loadingProduct, refetch: refetchProduct } = useApi<Product>(`/products/${productId}`)
  const { data: revisions, isLoading: loadingRevisions, refetch: refetchRevisions } = useApi<BomRevision[]>(`/bom/product/${productId}`)
  const { data: materials } = useApi<Material[]>("/materials")

  // Get selected revision with items
  const { data: selectedRevision, refetch: refetchSelectedRevision } = useApi<BomRevision>(
    selectedRevisionId ? `/bom/revision/${selectedRevisionId}` : "",
    { enabled: !!selectedRevisionId }
  )

  // Set initial selected revision to active one
  useEffect(() => {
    if (revisions && revisions.length > 0 && !selectedRevisionId) {
      const activeRevision = revisions.find(r => r.is_active) || revisions[0]
      setSelectedRevisionId(activeRevision.id)
    }
  }, [revisions, selectedRevisionId])

  // Refetch revision when selection changes
  useEffect(() => {
    if (selectedRevisionId) {
      refetchSelectedRevision()
    }
  }, [selectedRevisionId, refetchSelectedRevision])

  const activateMutation = useMutation(
    (revisionId: string) => api.post<BomRevision>(`/bom/revision/${revisionId}/activate`, {}),
    {
      onSuccess: () => {
        toast.success("BOM revision activated")
        refetchRevisions()
        refetchProduct()
      },
      onError: (error) => toast.error(error.message || "Failed to activate revision"),
    }
  )

  const deleteRevisionMutation = useMutation(
    (revisionId: string) => api.delete(`/bom/revision/${revisionId}`),
    {
      onSuccess: () => {
        toast.success("BOM revision deleted")
        setSelectedRevisionId(null)
        refetchRevisions()
      },
      onError: (error) => toast.error(error.message || "Failed to delete revision"),
    }
  )

  const copyRevisionMutation = useMutation(
    (revisionId: string) => api.post<BomRevision>(`/bom/revision/${revisionId}/copy`, {}),
    {
      onSuccess: (newRevision) => {
        toast.success(`Created copy: ${newRevision.revision_number}`)
        refetchRevisions()
        setSelectedRevisionId(newRevision.id)
      },
      onError: (error) => toast.error(error.message || "Failed to copy revision"),
    }
  )

  const deleteItemMutation = useMutation(
    (itemId: string) => api.delete(`/bom/item/${itemId}`),
    {
      onSuccess: () => {
        toast.success("Item removed from BOM")
        refetchSelectedRevision()
      },
      onError: (error) => toast.error(error.message || "Failed to remove item"),
    }
  )

  if (loadingProduct) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (!product) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold">Product not found</h2>
        <Button asChild className="mt-4">
          <Link href="/products">Back to Products</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/products">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{product.part_number}</h1>
              {product.active_bom_revision_id && (
                <Badge variant="secondary" className="gap-1">
                  <FileText className="h-3 w-3" />
                  BOM Active
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground">{product.name}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Product Info */}
        <Card>
          <CardHeader>
            <CardTitle>Product Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-muted-foreground">Part Number</Label>
              <p className="font-medium">{product.part_number}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Name</Label>
              <p className="font-medium">{product.name}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Description</Label>
              <p className="text-sm">{product.description || "-"}</p>
            </div>
            <Separator />
            <div className="text-sm text-muted-foreground space-y-1">
              <p>Created: {new Date(product.created_at).toLocaleDateString()}</p>
              <p>Updated: {new Date(product.updated_at).toLocaleDateString()}</p>
            </div>
          </CardContent>
        </Card>

        {/* BOM Revisions */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>BOM Revisions</CardTitle>
              <CardDescription>Manage bill of materials for this product</CardDescription>
            </div>
            <NewRevisionDialog
              productId={productId}
              open={showNewRevisionDialog}
              onOpenChange={setShowNewRevisionDialog}
              onSuccess={() => {
                refetchRevisions()
                setShowNewRevisionDialog(false)
              }}
            />
          </CardHeader>
          <CardContent>
            {loadingRevisions ? (
              <div className="text-center py-4">Loading revisions...</div>
            ) : revisions && revisions.length > 0 ? (
              <div className="space-y-2">
                {revisions.map((revision) => (
                  <div
                    key={revision.id}
                    className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedRevisionId === revision.id
                        ? "border-primary bg-primary/5"
                        : "hover:bg-muted/50"
                    }`}
                    onClick={() => setSelectedRevisionId(revision.id)}
                  >
                    <div className="flex items-center gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{revision.revision_number}</span>
                          {revision.is_active && (
                            <Badge variant="default" className="text-xs">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Active
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {new Date(revision.revision_date).toLocaleDateString()}
                          {revision.change_summary && ` - ${revision.change_summary}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {!revision.is_active && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            activateMutation.mutate(revision.id)
                          }}
                          title="Set as active"
                        >
                          <CheckCircle className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          copyRevisionMutation.mutate(revision.id)
                        }}
                        title="Copy revision"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      {!revision.is_active && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive"
                              onClick={(e) => e.stopPropagation()}
                              title="Delete revision"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete BOM Revision?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete revision {revision.revision_number} and all its items.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteRevisionMutation.mutate(revision.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No BOM revisions yet</p>
                <p className="text-sm">Create a revision to define the bill of materials</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* BOM Items */}
      {selectedRevision && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>BOM Items - {selectedRevision.revision_number}</CardTitle>
              <CardDescription>
                {selectedRevision.items?.length || 0} items in this revision
              </CardDescription>
            </div>
            <AddItemDialog
              revisionId={selectedRevision.id}
              materials={materials || []}
              existingMaterialIds={selectedRevision.items?.map(i => i.material_id) || []}
              open={showAddItemDialog}
              onOpenChange={setShowAddItemDialog}
              onSuccess={() => {
                refetchSelectedRevision()
                setShowAddItemDialog(false)
              }}
            />
          </CardHeader>
          <CardContent>
            {selectedRevision.items && selectedRevision.items.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[60px]">Line</TableHead>
                    <TableHead>Material</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="w-[80px]">Qty</TableHead>
                    <TableHead className="w-[100px]">Type</TableHead>
                    <TableHead>Reference Designators</TableHead>
                    <TableHead className="w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedRevision.items
                    .sort((a, b) => (a.line_number || 0) - (b.line_number || 0))
                    .map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-mono text-sm">
                          {item.line_number || "-"}
                        </TableCell>
                        <TableCell>
                          <span className="font-medium">
                            {item.material?.internal_part_number || item.material_id}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                          {item.material?.description || "-"}
                        </TableCell>
                        <TableCell className="font-mono">
                          {item.quantity_required}
                        </TableCell>
                        <TableCell>
                          {item.resource_type ? (
                            <Badge variant="outline" className="text-xs">
                              {resourceTypeLabels[item.resource_type]}
                            </Badge>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell className="text-sm font-mono max-w-[200px] truncate" title={item.reference_designators || ""}>
                          {item.reference_designators || "-"}
                        </TableCell>
                        <TableCell>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Remove Item?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Remove {item.material?.internal_part_number} from this BOM revision?
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteItemMutation.mutate(item.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Remove
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <p>No items in this BOM revision</p>
                <p className="text-sm">Add materials to define the bill of materials</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// New Revision Dialog Component
function NewRevisionDialog({
  productId,
  open,
  onOpenChange,
  onSuccess,
}: {
  productId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}) {
  const [formData, setFormData] = useState({
    revision_number: "",
    revision_date: new Date().toISOString().split("T")[0],
    change_summary: "",
    is_active: false,
  })

  const createMutation = useMutation(
    (data: CreateBomRevisionDto) => api.post<BomRevision>("/bom/revision", data),
    {
      onSuccess: () => {
        toast.success("BOM revision created")
        setFormData({
          revision_number: "",
          revision_date: new Date().toISOString().split("T")[0],
          change_summary: "",
          is_active: false,
        })
        onSuccess()
      },
      onError: (error) => toast.error(error.message || "Failed to create revision"),
    }
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate({
      product_id: productId,
      revision_number: formData.revision_number,
      revision_date: formData.revision_date,
      change_summary: formData.change_summary || undefined,
      is_active: formData.is_active,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          New Revision
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create BOM Revision</DialogTitle>
            <DialogDescription>
              Create a new bill of materials revision for this product
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="revision_number">Revision Number *</Label>
                <Input
                  id="revision_number"
                  value={formData.revision_number}
                  onChange={(e) => setFormData({ ...formData, revision_number: e.target.value })}
                  placeholder="e.g., A, B, 1.0"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="revision_date">Revision Date *</Label>
                <Input
                  id="revision_date"
                  type="date"
                  value={formData.revision_date}
                  onChange={(e) => setFormData({ ...formData, revision_date: e.target.value })}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="change_summary">Change Summary</Label>
              <Textarea
                id="change_summary"
                value={formData.change_summary}
                onChange={(e) => setFormData({ ...formData, change_summary: e.target.value })}
                placeholder="Describe the changes in this revision..."
                rows={3}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_active"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                className="h-4 w-4"
              />
              <Label htmlFor="is_active">Set as active revision</Label>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isLoading}>
              {createMutation.isLoading ? "Creating..." : "Create Revision"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// Add Item Dialog Component
function AddItemDialog({
  revisionId,
  materials,
  existingMaterialIds,
  open,
  onOpenChange,
  onSuccess,
}: {
  revisionId: string
  materials: Material[]
  existingMaterialIds: string[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}) {
  const [formData, setFormData] = useState({
    material_id: "",
    quantity_required: 1,
    reference_designators: "",
    resource_type: "" as ResourceType | "",
    notes: "",
  })

  const availableMaterials = materials.filter(m => !existingMaterialIds.includes(m.id))

  const createMutation = useMutation(
    (data: CreateBomItemDto) => api.post<BomItem>(`/bom/revision/${revisionId}/items`, data),
    {
      onSuccess: () => {
        toast.success("Item added to BOM")
        setFormData({
          material_id: "",
          quantity_required: 1,
          reference_designators: "",
          resource_type: "",
          notes: "",
        })
        onSuccess()
      },
      onError: (error) => toast.error(error.message || "Failed to add item"),
    }
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate({
      material_id: formData.material_id,
      quantity_required: Number(formData.quantity_required),
      reference_designators: formData.reference_designators || undefined,
      resource_type: formData.resource_type || undefined,
      notes: formData.notes || undefined,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Add Item
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add BOM Item</DialogTitle>
            <DialogDescription>
              Add a material to this BOM revision
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="material">Material *</Label>
              <Select
                value={formData.material_id}
                onValueChange={(value) => setFormData({ ...formData, material_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a material" />
                </SelectTrigger>
                <SelectContent>
                  {availableMaterials.map((material) => (
                    <SelectItem key={material.id} value={material.id}>
                      {material.internal_part_number} - {material.description || "No description"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="quantity_required">Quantity *</Label>
                <Input
                  id="quantity_required"
                  type="number"
                  min={0.0001}
                  step="any"
                  value={formData.quantity_required}
                  onChange={(e) => setFormData({ ...formData, quantity_required: parseFloat(e.target.value) || 0 })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="resource_type">Resource Type</Label>
                <Select
                  value={formData.resource_type}
                  onValueChange={(value) => setFormData({ ...formData, resource_type: value as ResourceType })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SMT">SMT</SelectItem>
                    <SelectItem value="TH">Through-Hole</SelectItem>
                    <SelectItem value="MECH">Mechanical</SelectItem>
                    <SelectItem value="PCB">PCB</SelectItem>
                    <SelectItem value="DNP">Do Not Place</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reference_designators">Reference Designators</Label>
              <Input
                id="reference_designators"
                value={formData.reference_designators}
                onChange={(e) => setFormData({ ...formData, reference_designators: e.target.value })}
                placeholder="e.g., R1, R2, R3"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Any special notes..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isLoading || !formData.material_id}>
              {createMutation.isLoading ? "Adding..." : "Add Item"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
