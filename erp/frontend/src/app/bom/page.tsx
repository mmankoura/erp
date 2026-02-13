"use client"

import { useApi } from "@/hooks/use-api"
import {
  api,
  type BomRevision,
  type BomItem,
  type BomDiff,
  type Product,
} from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  FileText,
  CheckCircle,
  Search,
  GitCompare,
  Eye,
  X,
  Plus,
  Minus,
  RefreshCw,
  ArrowRight,
  ExternalLink,
  FileCheck,
  Filter,
} from "lucide-react"
import { useState, useMemo, useEffect } from "react"
import Link from "next/link"

export default function BomViewerPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [productFilter, setProductFilter] = useState<string>("all")
  const [selectedRevision, setSelectedRevision] = useState<BomRevision | null>(null)
  const [compareMode, setCompareMode] = useState(false)
  const [revision1Id, setRevision1Id] = useState<string>("")
  const [revision2Id, setRevision2Id] = useState<string>("")
  const [showDiffDialog, setShowDiffDialog] = useState(false)
  const [diffResult, setDiffResult] = useState<BomDiff | null>(null)
  const [loadingDiff, setLoadingDiff] = useState(false)
  const [bomItemSearch, setBomItemSearch] = useState("")

  const { data: revisions, isLoading: loadingRevisions } = useApi<BomRevision[]>("/bom/revisions")
  const { data: products } = useApi<Product[]>("/products")

  // Fetch full revision with items when selected
  const { data: revisionDetails } = useApi<BomRevision>(
    selectedRevision ? `/bom/revision/${selectedRevision.id}` : "",
    { enabled: !!selectedRevision }
  )

  // Clear BOM item search when switching revisions
  useEffect(() => {
    setBomItemSearch("")
  }, [selectedRevision?.id])

  // Filter and search revisions
  const filteredRevisions = useMemo(() => {
    if (!revisions) return []

    return revisions.filter((rev) => {
      // Product filter
      if (productFilter !== "all" && rev.product_id !== productFilter) {
        return false
      }

      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        const productName = rev.product?.part_number?.toLowerCase() || ""
        const revNumber = rev.revision_number.toLowerCase()
        const changeSummary = rev.change_summary?.toLowerCase() || ""

        return (
          productName.includes(query) ||
          revNumber.includes(query) ||
          changeSummary.includes(query)
        )
      }

      return true
    })
  }, [revisions, productFilter, searchQuery])

  // Get revisions for the selected product (for comparison dropdown)
  const comparableRevisions = useMemo(() => {
    if (!revisions || productFilter === "all") return revisions || []
    return revisions.filter((rev) => rev.product_id === productFilter)
  }, [revisions, productFilter])

  // Filter BOM items by IPN or Ref Des
  const filteredBomItems = useMemo(() => {
    if (!revisionDetails?.items) return []
    if (!bomItemSearch.trim()) {
      return revisionDetails.items.sort((a, b) => (a.line_number || 0) - (b.line_number || 0))
    }

    const query = bomItemSearch.toLowerCase().trim()
    return revisionDetails.items
      .filter((item) => {
        const ipn = item.material?.internal_part_number?.toLowerCase() || ""
        const refDes = item.reference_designators?.toLowerCase() || ""
        return ipn.includes(query) || refDes.includes(query)
      })
      .sort((a, b) => (a.line_number || 0) - (b.line_number || 0))
  }, [revisionDetails?.items, bomItemSearch])

  const handleCompare = async () => {
    if (!revision1Id || !revision2Id) return

    setLoadingDiff(true)
    try {
      const diff = await api.get<BomDiff>(`/bom/revision/${revision1Id}/diff/${revision2Id}`)
      setDiffResult(diff)
      setShowDiffDialog(true)
    } catch (error) {
      console.error("Failed to compare revisions:", error)
    } finally {
      setLoadingDiff(false)
    }
  }

  const getSourceBadge = (source: string) => {
    switch (source) {
      case "MANUAL":
        return <Badge variant="outline">Manual</Badge>
      case "IMPORT_CLIENT":
        return <Badge variant="secondary">Client Import</Badge>
      case "IMPORT_INTERNAL":
        return <Badge variant="secondary">Internal Import</Badge>
      default:
        return <Badge variant="outline">{source}</Badge>
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">BOM Viewer</h1>
          <p className="text-muted-foreground">
            View and compare bill of materials revisions
          </p>
        </div>
        <Button asChild>
          <Link href="/bom/validate">
            <FileCheck className="h-4 w-4 mr-2" />
            Validate BOM
          </Link>
        </Button>
      </div>

      {/* Filters and Compare Mode */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 items-center gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search revisions..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={productFilter} onValueChange={setProductFilter}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Filter by product" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Products</SelectItem>
                  {products?.map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.part_number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant={compareMode ? "default" : "outline"}
              onClick={() => {
                setCompareMode(!compareMode)
                if (!compareMode) {
                  setRevision1Id("")
                  setRevision2Id("")
                }
              }}
            >
              <GitCompare className="h-4 w-4 mr-2" />
              {compareMode ? "Exit Compare" : "Compare Revisions"}
            </Button>
          </div>
        </CardHeader>

        {/* Compare Mode UI */}
        {compareMode && (
          <CardContent className="border-t pt-4">
            <div className="flex items-end gap-4">
              <div className="flex-1 space-y-2">
                <label className="text-sm font-medium">Revision 1</label>
                <Select value={revision1Id} onValueChange={setRevision1Id}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select first revision" />
                  </SelectTrigger>
                  <SelectContent>
                    {comparableRevisions?.map((rev) => (
                      <SelectItem key={rev.id} value={rev.id} disabled={rev.id === revision2Id}>
                        {rev.product?.part_number} - {rev.revision_number}
                        {rev.is_active && " (Active)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground mb-2" />
              <div className="flex-1 space-y-2">
                <label className="text-sm font-medium">Revision 2</label>
                <Select value={revision2Id} onValueChange={setRevision2Id}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select second revision" />
                  </SelectTrigger>
                  <SelectContent>
                    {comparableRevisions?.map((rev) => (
                      <SelectItem key={rev.id} value={rev.id} disabled={rev.id === revision1Id}>
                        {rev.product?.part_number} - {rev.revision_number}
                        {rev.is_active && " (Active)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={handleCompare}
                disabled={!revision1Id || !revision2Id || loadingDiff}
              >
                {loadingDiff ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <GitCompare className="h-4 w-4 mr-2" />
                )}
                Compare
              </Button>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Main Content */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Revisions List */}
        <Card>
          <CardHeader>
            <CardTitle>Revisions</CardTitle>
            <CardDescription>
              {filteredRevisions.length} revision{filteredRevisions.length !== 1 ? "s" : ""} found
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingRevisions ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : filteredRevisions.length > 0 ? (
              <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {filteredRevisions.map((revision) => (
                  <div
                    key={revision.id}
                    className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedRevision?.id === revision.id
                        ? "border-primary bg-primary/5"
                        : "hover:bg-muted/50"
                    }`}
                    onClick={() => setSelectedRevision(revision)}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/products/${revision.product_id}`}
                          className="font-medium hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {revision.product?.part_number || "Unknown Product"}
                        </Link>
                        <span className="text-muted-foreground">-</span>
                        <span className="font-mono">{revision.revision_number}</span>
                        {revision.is_active && (
                          <Badge variant="default" className="text-xs">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Active
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>{new Date(revision.revision_date).toLocaleDateString()}</span>
                        {getSourceBadge(revision.source)}
                        {revision.source_filename && (
                          <span className="truncate max-w-[150px]" title={revision.source_filename}>
                            {revision.source_filename}
                          </span>
                        )}
                      </div>
                      {revision.change_summary && (
                        <p className="text-sm text-muted-foreground truncate max-w-[300px]">
                          {revision.change_summary}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedRevision(revision)
                      }}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No revisions found</p>
                <p className="text-sm">Try adjusting your filters</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Revision Details */}
        <Card>
          <CardHeader>
            <CardTitle>
              {selectedRevision ? (
                <div className="flex items-center justify-between">
                  <span>
                    {selectedRevision.product?.part_number} - {selectedRevision.revision_number}
                  </span>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/products/${selectedRevision.product_id}`}>
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Open Product
                    </Link>
                  </Button>
                </div>
              ) : (
                "Revision Details"
              )}
            </CardTitle>
            {selectedRevision && (
              <CardDescription>
                {bomItemSearch
                  ? `${filteredBomItems.length} of ${revisionDetails?.items?.length || 0} items`
                  : `${revisionDetails?.items?.length || 0} items in this revision`}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            {selectedRevision ? (
              <Tabs defaultValue="items">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="items">BOM Items</TabsTrigger>
                  <TabsTrigger value="info">Revision Info</TabsTrigger>
                </TabsList>
                <TabsContent value="items" className="mt-4">
                  {/* Search for BOM Items */}
                  {revisionDetails?.items && revisionDetails.items.length > 0 && (
                    <div className="mb-4">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          placeholder="Search by IPN or Ref Des..."
                          value={bomItemSearch}
                          onChange={(e) => setBomItemSearch(e.target.value)}
                          className="pl-10 pr-10"
                        />
                        {bomItemSearch && (
                          <button
                            onClick={() => setBomItemSearch("")}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                  {revisionDetails?.items && revisionDetails.items.length > 0 ? (
                    filteredBomItems.length > 0 ? (
                    <div className="max-h-[500px] overflow-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[50px]">Line</TableHead>
                            <TableHead>Internal P/N</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead className="w-[80px]">Qty</TableHead>
                            <TableHead>Ref Des</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredBomItems.map((item) => (
                              <TableRow key={item.id}>
                                <TableCell className="font-mono text-sm">
                                  {item.line_number || "-"}
                                </TableCell>
                                <TableCell className="font-medium">
                                  {item.material?.internal_part_number || "-"}
                                </TableCell>
                                <TableCell className="text-sm max-w-[200px] truncate">
                                  {item.material?.description || "-"}
                                </TableCell>
                                <TableCell className="font-mono">
                                  {item.quantity_required}
                                </TableCell>
                                <TableCell className="text-sm font-mono max-w-[100px] truncate" title={item.reference_designators || ""}>
                                  {item.reference_designators || "-"}
                                </TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <p>No items match your search</p>
                        <p className="text-sm">Try a different IPN or Ref Des</p>
                      </div>
                    )
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <p>No items in this revision</p>
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="info" className="mt-4 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">
                        Revision Number
                      </label>
                      <p className="font-mono">{selectedRevision.revision_number}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">
                        Revision Date
                      </label>
                      <p>{new Date(selectedRevision.revision_date).toLocaleDateString()}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">
                        Source
                      </label>
                      <div className="mt-1">{getSourceBadge(selectedRevision.source)}</div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">
                        Status
                      </label>
                      <div className="mt-1">
                        {selectedRevision.is_active ? (
                          <Badge variant="default">Active</Badge>
                        ) : (
                          <Badge variant="outline">Inactive</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  {selectedRevision.source_filename && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">
                        Source Filename
                      </label>
                      <p className="text-sm">{selectedRevision.source_filename}</p>
                    </div>
                  )}
                  {selectedRevision.change_summary && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">
                        Change Summary
                      </label>
                      <p className="text-sm">{selectedRevision.change_summary}</p>
                    </div>
                  )}
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">
                      Created At
                    </label>
                    <p className="text-sm">
                      {new Date(selectedRevision.created_at).toLocaleString()}
                    </p>
                  </div>
                </TabsContent>
              </Tabs>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Eye className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Select a revision to view details</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Diff Dialog */}
      <Dialog open={showDiffDialog} onOpenChange={setShowDiffDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>BOM Comparison</DialogTitle>
            <DialogDescription>
              Comparing changes between revisions
            </DialogDescription>
          </DialogHeader>
          {diffResult && (
            <div className="flex-1 overflow-auto space-y-4">
              {/* Summary */}
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

              {/* Added Items */}
              {diffResult.added.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2 text-green-600 dark:text-green-400">
                    Added Items
                  </h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Internal P/N</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Qty</TableHead>
                        <TableHead>Ref Des</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {diffResult.added.map((item) => (
                        <TableRow key={item.id} className="bg-green-50 dark:bg-green-950/20">
                          <TableCell className="font-medium">
                            {item.material?.internal_part_number || "-"}
                          </TableCell>
                          <TableCell>{item.material?.description || "-"}</TableCell>
                          <TableCell className="font-mono">{item.quantity_required}</TableCell>
                          <TableCell className="font-mono text-sm">
                            {item.reference_designators || "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Removed Items */}
              {diffResult.removed.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2 text-red-600 dark:text-red-400">
                    Removed Items
                  </h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Internal P/N</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Qty</TableHead>
                        <TableHead>Ref Des</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {diffResult.removed.map((item) => (
                        <TableRow key={item.id} className="bg-red-50 dark:bg-red-950/20">
                          <TableCell className="font-medium">
                            {item.material?.internal_part_number || "-"}
                          </TableCell>
                          <TableCell>{item.material?.description || "-"}</TableCell>
                          <TableCell className="font-mono">{item.quantity_required}</TableCell>
                          <TableCell className="font-mono text-sm">
                            {item.reference_designators || "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Changed Items */}
              {diffResult.changed.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2 text-blue-600 dark:text-blue-400">
                    Changed Items
                  </h4>
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
                          <TableCell className="font-medium">
                            {change.old.material?.internal_part_number || "-"}
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              {change.changes.map((c, idx) => (
                                <div key={idx} className="text-sm">
                                  <span className="text-muted-foreground">{c}</span>
                                </div>
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* No Changes */}
              {diffResult.added.length === 0 &&
                diffResult.removed.length === 0 &&
                diffResult.changed.length === 0 && (
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
