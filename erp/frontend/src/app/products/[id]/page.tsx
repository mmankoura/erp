"use client"

import { useApi, useMutation } from "@/hooks/use-api"
import {
  api,
  type Product,
  type BomRevision,
  type BomItem,
  type BomDiff,
  type Material,
  type CreateBomRevisionDto,
  type CreateBomItemDto,
  type UpdateBomItemDto,
  type UpdateBomRevisionDto,
  type ResourceType,
} from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
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
  Trash2,
  Copy,
  Upload,
  Pencil,
  Archive,
  ArchiveRestore,
  GitCompare,
  RefreshCw,
  ArrowRight,
  Minus,
} from "lucide-react"
import { useState, useEffect, useMemo } from "react"
import { toast } from "sonner"
import Link from "next/link"
import { useParams } from "next/navigation"
import { BomImportWizard } from "@/components/bom-import-wizard"
import { useAuth, UserRole } from "@/contexts/auth-context"
import { VirtualGrid, type VirtualGridColumn } from "@/components/virtual-grid"
import { textCol, monoCol, numCol } from "@/components/grid/columns"

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
  const { hasRole } = useAuth()
  const isAdmin = hasRole(UserRole.ADMIN)
  const canEditBom = hasRole(UserRole.ADMIN, UserRole.MANAGER)

  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(null)
  const [showNewRevisionDialog, setShowNewRevisionDialog] = useState(false)
  const [showAddItemDialog, setShowAddItemDialog] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [showImportWizard, setShowImportWizard] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [editingItem, setEditingItem] = useState<BomItem | null>(null)
  const [editingRevision, setEditingRevision] = useState<BomRevision | null>(null)

  // Diff comparison state
  const [compareMode, setCompareMode] = useState(false)
  const [revision1Id, setRevision1Id] = useState("")
  const [revision2Id, setRevision2Id] = useState("")
  const [showDiffDialog, setShowDiffDialog] = useState(false)
  const [diffResult, setDiffResult] = useState<BomDiff | null>(null)
  const [loadingDiff, setLoadingDiff] = useState(false)

  const { data: product, isLoading: loadingProduct, refetch: refetchProduct } = useApi<Product>(`/products/${productId}`)
  const { data: revisions, isLoading: loadingRevisions, refetch: refetchRevisions } = useApi<BomRevision[]>(
    `/bom/product/${productId}?includeArchived=${showArchived}`
  )
  const { data: materials } = useApi<Material[]>("/materials")

  // Refetch revisions when showArchived changes
  useEffect(() => {
    refetchRevisions()
  }, [showArchived, refetchRevisions])

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

  // Sorted BOM items for the BOM grid
  const sortedBomItems = useMemo(() => {
    if (!selectedRevision?.items) return null
    return [...selectedRevision.items].sort((a, b) => (a.line_number || 0) - (b.line_number || 0))
  }, [selectedRevision?.items])

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

  const archiveMutation = useMutation(
    (revisionId: string) => api.post<BomRevision>(`/bom/revision/${revisionId}/archive`, {}),
    {
      onSuccess: () => {
        toast.success("Revision archived")
        refetchRevisions()
      },
      onError: (error) => toast.error(error.message || "Failed to archive revision"),
    }
  )

  const unarchiveMutation = useMutation(
    (revisionId: string) => api.post<BomRevision>(`/bom/revision/${revisionId}/unarchive`, {}),
    {
      onSuccess: () => {
        toast.success("Revision unarchived")
        refetchRevisions()
      },
      onError: (error) => toast.error(error.message || "Failed to unarchive revision"),
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

  const handleCompare = async () => {
    if (!revision1Id || !revision2Id) return
    setLoadingDiff(true)
    try {
      const diff = await api.get<BomDiff>(`/bom/revision/${revision1Id}/diff/${revision2Id}`)
      setDiffResult(diff)
      setShowDiffDialog(true)
    } catch {
      toast.error("Failed to compare revisions")
    } finally {
      setLoadingDiff(false)
    }
  }

  // BOM item columns for VirtualGrid
  const bomItemColumns = useMemo((): VirtualGridColumn<BomItem>[] => {
    const altText = (item: BomItem): string => {
      const alts = item.alternates ?? []
      if (alts.length > 0) {
        return alts.map((a) => a.material?.internal_part_number ?? a.material_id).join(", ")
      }
      return item.alternate_ipn ?? ""
    }

    // This grid wrapped its long cells rather than clipping them, which is what
    // kept it off a fixed row height. It now clips like the rest of the sheets:
    // every column that can overflow carries the full value as its tooltip, and
    // Ctrl+C copies the whole thing regardless of what fits on screen. Ref Des
    // is the column this matters most for — a part with 39 designators is one
    // line here and a full list on hover.
    const cols: VirtualGridColumn<BomItem>[] = [
      numCol("line_number", "Line", (item) => item.line_number ?? null, {
        size: 70,
        decimals: 0,
      }),
      monoCol("ipn", "Internal P/N", (item) => item.material?.internal_part_number, {
        size: 140,
        cell: (item) =>
          item.material?.internal_part_number ? (
            <span className="font-medium">{item.material.internal_part_number}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      }),
      {
        id: "alternate_ipn",
        header: "Alternates",
        size: 180,
        accessorFn: (item) => altText(item),
        filterAccessor: (item) => altText(item) || "—",
        copyValue: (item) => altText(item),
        // Was one row per alternate; now one comma-separated line, which is
        // what `altText` already produced for sorting and filtering.
        cell: (item) => {
          const text = altText(item)
          return text ? (
            <span className="font-medium" title={text}>
              {text}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )
        },
      },
      textCol("manufacturer", "Manufacturer", (item) => item.material?.manufacturer, {
        size: 140,
      }),
      monoCol("manufacturer_pn", "Manufacturer P/N", (item) => item.material?.manufacturer_pn, {
        size: 150,
      }),
      numCol("quantity_required", "Qty Per", (item) => item.quantity_required, { size: 90 }),
      textCol(
        "resource_type",
        "Type",
        (item) => {
          const rt = item.material?.resource_type
          return rt ? resourceTypeLabels[rt] || rt : null
        },
        { size: 100 }
      ),
      {
        ...textCol<BomItem>(
          "reference_designators",
          "Ref Des",
          (item) => item.reference_designators,
          { size: 220 }
        ),
        cell: (item) =>
          item.reference_designators ? (
            <span className="font-mono" title={item.reference_designators}>
              {item.reference_designators}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        ...textCol<BomItem>("notes", "Notes", (item) => item.notes, { size: 160 }),
        cell: (item) =>
          item.notes ? (
            <span title={item.notes}>{item.notes}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
    ]

    if (canEditBom && editMode) {
      cols.push({
        id: "actions",
        header: "",
        size: 90,
        sortable: false,
        filterable: false,
        accessorFn: () => "",
        copyValue: () => "",
        // Shrunk to fit the 26px sheet row.
        cell: (item) => (
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              onClick={() => setEditingItem(item)}
              title="Edit item"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
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
          </div>
        ),
      })
    }

    return cols
  }, [canEditBom, editMode, deleteItemMutation])

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
            <div className="flex items-center gap-2">
              <BomImportWizard
                productId={productId}
                open={showImportWizard}
                onOpenChange={setShowImportWizard}
                onSuccess={() => {
                  refetchRevisions()
                  refetchProduct()
                }}
              />
              <NewRevisionDialog
                productId={productId}
                open={showNewRevisionDialog}
                onOpenChange={setShowNewRevisionDialog}
                onSuccess={() => {
                  refetchRevisions()
                  setShowNewRevisionDialog(false)
                }}
              />
            </div>
          </CardHeader>
          <CardContent>
            {/* Show Archived toggle + Compare button */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="show-archived"
                  checked={showArchived}
                  onCheckedChange={(checked) => setShowArchived(checked === true)}
                />
                <Label htmlFor="show-archived" className="text-sm cursor-pointer">Show Archived</Label>
              </div>
              <Button
                variant={compareMode ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setCompareMode(!compareMode)
                  if (!compareMode) {
                    setRevision1Id("")
                    setRevision2Id("")
                  }
                }}
              >
                <GitCompare className="h-4 w-4 mr-2" />
                {compareMode ? "Exit Compare" : "Compare"}
              </Button>
            </div>

            {/* Compare Mode UI */}
            {compareMode && revisions && (
              <div className="flex items-end gap-3 mb-4 p-3 bg-muted/30 rounded-lg border">
                <div className="flex-1 space-y-1">
                  <label className="text-xs font-medium">Revision 1</label>
                  <Select value={revision1Id} onValueChange={setRevision1Id}>
                    <SelectTrigger className="h-8">
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      {revisions.map((rev) => (
                        <SelectItem key={rev.id} value={rev.id} disabled={rev.id === revision2Id}>
                          {rev.revision_number}{rev.is_active ? " (Active)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground mb-2 shrink-0" />
                <div className="flex-1 space-y-1">
                  <label className="text-xs font-medium">Revision 2</label>
                  <Select value={revision2Id} onValueChange={setRevision2Id}>
                    <SelectTrigger className="h-8">
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      {revisions.map((rev) => (
                        <SelectItem key={rev.id} value={rev.id} disabled={rev.id === revision1Id}>
                          {rev.revision_number}{rev.is_active ? " (Active)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  size="sm"
                  onClick={handleCompare}
                  disabled={!revision1Id || !revision2Id || loadingDiff}
                >
                  {loadingDiff ? <RefreshCw className="h-4 w-4 animate-spin" /> : "Compare"}
                </Button>
              </div>
            )}

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
                        : revision.is_active
                          ? "border-green-300 bg-green-50/50 dark:border-green-800 dark:bg-green-950/20 hover:bg-green-50 dark:hover:bg-green-950/30"
                          : revision.is_archived
                            ? "opacity-60 hover:bg-muted/50"
                            : "hover:bg-muted/50"
                    }`}
                    onClick={() => setSelectedRevisionId(revision.id)}
                  >
                    <div className="flex items-center gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{revision.revision_number}</span>
                          {revision.is_active && (
                            <Badge variant="default" className="text-xs bg-green-600">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Active
                            </Badge>
                          )}
                          {revision.is_archived && (
                            <Badge variant="outline" className="text-xs text-muted-foreground">
                              <Archive className="h-3 w-3 mr-1" />
                              Archived
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
                      {!revision.is_active && !revision.is_archived && (
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
                      {/* Edit revision - admin/manager only */}
                      {canEditBom && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            setEditingRevision(revision)
                          }}
                          title="Edit revision"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      {/* Archive/Unarchive - admin only, not for active revision */}
                      {isAdmin && !revision.is_active && (
                        revision.is_archived ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              unarchiveMutation.mutate(revision.id)
                            }}
                            title="Unarchive revision"
                          >
                            <ArchiveRestore className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              archiveMutation.mutate(revision.id)
                            }}
                            title="Archive revision"
                          >
                            <Archive className="h-4 w-4" />
                          </Button>
                        )
                      )}
                      {/* Delete - admin only, only for archived revisions */}
                      {isAdmin && !revision.is_active && revision.is_archived && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive"
                              onClick={(e) => e.stopPropagation()}
                              title="Delete revision permanently"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete BOM Revision?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete revision {revision.revision_number} and all its items.
                                If orders reference this revision, deletion will be blocked.
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
            <div className="flex items-center gap-2">
              {canEditBom && !editMode && (
                <Button variant="outline" onClick={() => setEditMode(true)}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit BOM
                </Button>
              )}
              {canEditBom && editMode && (
                <>
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
                  <Button variant="outline" onClick={() => setEditMode(false)}>
                    Done
                  </Button>
                </>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <VirtualGrid
              data={sortedBomItems}
              columns={bomItemColumns}
              searchPlaceholder="Search by IPN, Ref Des, manufacturer, or notes..."
              searchFn={(item, q) => {
                const ipn = item.material?.internal_part_number?.toLowerCase() || ""
                const altIpn = item.alternate_ipn?.toLowerCase() || ""
                const altList = (item.alternates ?? []).map((a) => a.material?.internal_part_number?.toLowerCase() || "").join(" ")
                const refDes = item.reference_designators?.toLowerCase() || ""
                const mfr = item.material?.manufacturer?.toLowerCase() || ""
                const mpn = item.material?.manufacturer_pn?.toLowerCase() || ""
                const notes = item.notes?.toLowerCase() || ""
                return ipn.includes(q) || altIpn.includes(q) || altList.includes(q) || refDes.includes(q) || mfr.includes(q) || mpn.includes(q) || notes.includes(q)
              }}
              spreadsheet
              bare
              storageKey="bom-items"
              getRowId={(item) => item.id}
            />
          </CardContent>
        </Card>
      )}

      {/* Edit BOM Item Dialog */}
      <EditItemDialog
        item={editingItem}
        materials={materials || []}
        existingMaterialIds={selectedRevision?.items?.filter((i) => i.id !== editingItem?.id).map((i) => i.material_id) || []}
        open={!!editingItem}
        onOpenChange={(open) => { if (!open) setEditingItem(null) }}
        onSuccess={() => {
          setEditingItem(null)
          refetchSelectedRevision()
        }}
      />

      {/* Edit Revision Dialog */}
      <EditRevisionDialog
        revision={editingRevision}
        open={!!editingRevision}
        onOpenChange={(open) => { if (!open) setEditingRevision(null) }}
        onSuccess={() => {
          setEditingRevision(null)
          refetchRevisions()
        }}
      />

      {/* Diff Dialog */}
      <Dialog open={showDiffDialog} onOpenChange={setShowDiffDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>BOM Comparison</DialogTitle>
            <DialogDescription>Comparing changes between revisions</DialogDescription>
          </DialogHeader>
          {diffResult && (
            <div className="flex-1 overflow-auto space-y-4">
              <div className="flex gap-4">
                <Badge variant="default" className="gap-1">
                  <Plus className="h-3 w-3" />
                  {diffResult.added.length} Added
                </Badge>
                <Badge variant="destructive" className="gap-1">
                  <Minus className="h-3 w-3" />
                  {diffResult.removed.length} Removed
                </Badge>
                <Badge variant="secondary" className="gap-1">
                  <RefreshCw className="h-3 w-3" />
                  {diffResult.changed.length} Changed
                </Badge>
              </div>

              {diffResult.added.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2 text-green-600 dark:text-green-400">Added Items</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[130px]">Internal P/N</TableHead>
                        <TableHead className="w-[200px]">Description</TableHead>
                        <TableHead className="w-[60px]">Qty</TableHead>
                        <TableHead className="min-w-[150px]">Ref Des</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {diffResult.added.map((item) => (
                        <TableRow key={item.id} className="bg-green-50 dark:bg-green-950/20">
                          <TableCell className="font-medium">{item.material?.internal_part_number || "-"}</TableCell>
                          <TableCell>{item.material?.description || "-"}</TableCell>
                          <TableCell className="font-mono">{item.quantity_required}</TableCell>
                          <TableCell className="font-mono text-sm whitespace-normal break-all">{item.reference_designators || "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {diffResult.removed.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2 text-red-600 dark:text-red-400">Removed Items</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[130px]">Internal P/N</TableHead>
                        <TableHead className="w-[200px]">Description</TableHead>
                        <TableHead className="w-[60px]">Qty</TableHead>
                        <TableHead className="min-w-[150px]">Ref Des</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {diffResult.removed.map((item) => (
                        <TableRow key={item.id} className="bg-red-50 dark:bg-red-950/20">
                          <TableCell className="font-medium">{item.material?.internal_part_number || "-"}</TableCell>
                          <TableCell>{item.material?.description || "-"}</TableCell>
                          <TableCell className="font-mono">{item.quantity_required}</TableCell>
                          <TableCell className="font-mono text-sm whitespace-normal break-all">{item.reference_designators || "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {diffResult.changed.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2 text-blue-600 dark:text-blue-400">Changed Items</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Internal P/N</TableHead>
                        <TableHead>Changes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {diffResult.changed.map((change) => (
                        <TableRow key={change.old.id} className="bg-blue-50 dark:bg-blue-950/20">
                          <TableCell className="font-medium">{change.old.material?.internal_part_number || "-"}</TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              {change.changes.map((c, idx) => (
                                <div key={idx} className="text-sm text-muted-foreground">{c}</div>
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {diffResult.added.length === 0 && diffResult.removed.length === 0 && diffResult.changed.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No differences found between these revisions</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
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
    alternate_ipn: "",
    quantity_required: 1,
    reference_designators: "",
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
          alternate_ipn: "",
          quantity_required: 1,
          reference_designators: "",
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
      alternate_ipn: formData.alternate_ipn || undefined,
      quantity_required: Number(formData.quantity_required),
      reference_designators: formData.reference_designators || undefined,
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
              <Label htmlFor="material">Internal Part Number *</Label>
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
            <div className="space-y-2">
              <Label htmlFor="alternate_ipn">Alternate Internal P/N</Label>
              <Input
                id="alternate_ipn"
                value={formData.alternate_ipn}
                onChange={(e) => setFormData({ ...formData, alternate_ipn: e.target.value })}
                placeholder="Optional alternate part number"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quantity_required">Qty Per *</Label>
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

// Edit BOM Item Dialog Component
function EditItemDialog({
  item,
  materials,
  existingMaterialIds,
  open,
  onOpenChange,
  onSuccess,
}: {
  item: BomItem | null
  materials: Material[]
  existingMaterialIds: string[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}) {
  const [formData, setFormData] = useState({
    material_id: "",
    quantity_required: 1,
    alternate_ipn: "",
    reference_designators: "",
    notes: "",
  })
  const [newAlternateIpn, setNewAlternateIpn] = useState("")
  const [alternateError, setAlternateError] = useState<string | null>(null)
  const [addingAlternate, setAddingAlternate] = useState(false)

  // Fetch current alternates for this item
  const { data: alternates, refetch: refetchAlternates } = useApi<
    Array<{ id: string; material_id: string; material?: { internal_part_number: string; description: string | null }; priority: number }>
  >(
    item ? `/bom/item/${item.id}/alternates` : "",
    { enabled: !!item }
  )

  // Pre-populate form when item changes
  useEffect(() => {
    if (item) {
      setFormData({
        material_id: item.material_id,
        quantity_required: item.quantity_required,
        alternate_ipn: item.alternate_ipn || "",
        reference_designators: item.reference_designators || "",
        notes: item.notes || "",
      })
    }
  }, [item])

  const updateMutation = useMutation(
    (data: UpdateBomItemDto) => api.patch<BomItem>(`/bom/item/${item!.id}`, data),
    {
      onSuccess: () => {
        toast.success("BOM item updated")
        onSuccess()
      },
      onError: (error) => toast.error(error.message || "Failed to update item"),
    }
  )

  const handleAddAlternate = async () => {
    if (!newAlternateIpn.trim() || !item) return
    setAlternateError(null)
    setAddingAlternate(true)
    try {
      await api.post(`/bom/item/${item.id}/alternates`, { ipn: newAlternateIpn.trim() })
      setNewAlternateIpn("")
      refetchAlternates()
      onSuccess() // refresh parent BOM data
      toast.success(`Alternate ${newAlternateIpn.trim()} added`)
    } catch (err: unknown) {
      setAlternateError(err instanceof Error ? err.message : "Failed to add alternate")
    } finally {
      setAddingAlternate(false)
    }
  }

  const handleRemoveAlternate = async (alternateId: string) => {
    try {
      await api.delete(`/bom/alternate/${alternateId}`)
      refetchAlternates()
      onSuccess()
      toast.success("Alternate removed")
    } catch {
      toast.error("Failed to remove alternate")
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    updateMutation.mutate({
      material_id: formData.material_id,
      quantity_required: Number(formData.quantity_required),
      alternate_ipn: formData.alternate_ipn || undefined,
      reference_designators: formData.reference_designators || undefined,
      notes: formData.notes || undefined,
    })
  }

  const selectableMaterials = useMemo(
    () => materials.filter((m) => !existingMaterialIds.includes(m.id)),
    [materials, existingMaterialIds],
  )

  if (!item) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit BOM Item</DialogTitle>
            <DialogDescription>
              Edit item: {item.material?.internal_part_number || "Unknown"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit_material_id">Internal Part Number *</Label>
              <Select
                value={formData.material_id}
                onValueChange={(value) => setFormData({ ...formData, material_id: value })}
              >
                <SelectTrigger id="edit_material_id">
                  <SelectValue placeholder="Select a material" />
                </SelectTrigger>
                <SelectContent>
                  {selectableMaterials.map((material) => (
                    <SelectItem key={material.id} value={material.id}>
                      {material.internal_part_number} - {material.description || "No description"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Alternates management */}
            <div className="space-y-2">
              <Label>Alternates</Label>
              {alternates && alternates.length > 0 ? (
                <div className="space-y-1">
                  {alternates.map((alt) => (
                    <div key={alt.id} className="flex items-center justify-between bg-muted/50 rounded px-2 py-1">
                      <span className="text-sm font-medium">{alt.material?.internal_part_number ?? alt.material_id}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-destructive hover:text-destructive"
                        onClick={() => handleRemoveAlternate(alt.id)}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No alternates</p>
              )}
              <div className="flex gap-2">
                <Input
                  value={newAlternateIpn}
                  onChange={(e) => { setNewAlternateIpn(e.target.value); setAlternateError(null) }}
                  placeholder="Enter alternate IPN"
                  className="flex-1"
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddAlternate() } }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddAlternate}
                  disabled={addingAlternate || !newAlternateIpn.trim()}
                >
                  {addingAlternate ? "Adding..." : "Add"}
                </Button>
              </div>
              {alternateError && (
                <p className="text-sm text-red-600">{alternateError}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_quantity_required">Qty Per *</Label>
              <Input
                id="edit_quantity_required"
                type="number"
                min={0.0001}
                step="any"
                value={formData.quantity_required}
                onChange={(e) => setFormData({ ...formData, quantity_required: parseFloat(e.target.value) || 0 })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_reference_designators">Reference Designators</Label>
              <Input
                id="edit_reference_designators"
                value={formData.reference_designators}
                onChange={(e) => setFormData({ ...formData, reference_designators: e.target.value })}
                placeholder="e.g., R1, R2, R3"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_notes">Notes</Label>
              <Textarea
                id="edit_notes"
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
            <Button type="submit" disabled={updateMutation.isLoading}>
              {updateMutation.isLoading ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// Edit Revision Dialog Component
function EditRevisionDialog({
  revision,
  open,
  onOpenChange,
  onSuccess,
}: {
  revision: BomRevision | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}) {
  const [formData, setFormData] = useState({
    revision_number: "",
    revision_date: "",
    change_summary: "",
  })

  // Pre-populate form when revision changes
  useEffect(() => {
    if (revision) {
      setFormData({
        revision_number: revision.revision_number,
        revision_date: revision.revision_date.split("T")[0],
        change_summary: revision.change_summary || "",
      })
    }
  }, [revision])

  const updateMutation = useMutation(
    (data: UpdateBomRevisionDto) => api.patch<BomRevision>(`/bom/revision/${revision!.id}`, data),
    {
      onSuccess: () => {
        toast.success("BOM revision updated")
        onSuccess()
      },
      onError: (error) => toast.error(error.message || "Failed to update revision"),
    }
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    updateMutation.mutate({
      revision_number: formData.revision_number,
      revision_date: formData.revision_date,
      change_summary: formData.change_summary || undefined,
    })
  }

  if (!revision) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit BOM Revision</DialogTitle>
            <DialogDescription>
              Update revision metadata
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit_revision_number">Revision Number *</Label>
                <Input
                  id="edit_revision_number"
                  value={formData.revision_number}
                  onChange={(e) => setFormData({ ...formData, revision_number: e.target.value })}
                  placeholder="e.g., A, B, 1.0"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_revision_date">Revision Date *</Label>
                <Input
                  id="edit_revision_date"
                  type="date"
                  value={formData.revision_date}
                  onChange={(e) => setFormData({ ...formData, revision_date: e.target.value })}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_change_summary">Change Summary</Label>
              <Textarea
                id="edit_change_summary"
                value={formData.change_summary}
                onChange={(e) => setFormData({ ...formData, change_summary: e.target.value })}
                placeholder="Describe the changes in this revision..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateMutation.isLoading}>
              {updateMutation.isLoading ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
