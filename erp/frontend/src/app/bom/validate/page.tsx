"use client"

import { useState, useMemo } from "react"
import * as XLSX from "xlsx"
import { useApi } from "@/hooks/use-api"
import {
  api,
  type BomRevision,
  type BomItem,
  type Product,
  type BomImportField,
  type ColumnMapping,
} from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import {
  ArrowLeft,
  ArrowRight,
  Upload,
  FileUp,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Plus,
  Minus,
  RefreshCw,
  FileCheck,
  Loader2,
} from "lucide-react"
import { toast } from "sonner"
import Link from "next/link"

const BOM_FIELDS: { value: BomImportField; label: string }[] = [
  { value: "internal_part_number", label: "Internal Part Number *" },
  { value: "quantity_required", label: "Quantity Required *" },
  { value: "reference_designators", label: "Reference Designators" },
  { value: "manufacturer", label: "Manufacturer" },
  { value: "manufacturer_pn", label: "Manufacturer P/N" },
  { value: "line_number", label: "Line Number" },
  { value: "notes", label: "Notes" },
  { value: "ignore", label: "-- Ignore --" },
]

interface ParsedBomItem {
  internal_part_number: string
  quantity_required: number
  reference_designators?: string
  manufacturer?: string
  manufacturer_pn?: string
  line_number?: number
  notes?: string
}

interface ValidationResult {
  matched: Array<{
    stored: BomItem
    uploaded: ParsedBomItem
    differences: string[]
  }>
  added: ParsedBomItem[]
  removed: BomItem[]
  summary: {
    total_stored: number
    total_uploaded: number
    matched_count: number
    matched_with_differences: number
    added_count: number
    removed_count: number
  }
}

type Step = "select" | "upload" | "mapping" | "results"

export default function BomValidatePage() {
  const [step, setStep] = useState<Step>("select")
  const [selectedProductId, setSelectedProductId] = useState<string>("")
  const [selectedRevisionId, setSelectedRevisionId] = useState<string>("")
  const [fileName, setFileName] = useState<string>("")
  const [fileData, setFileData] = useState<string[][]>([])
  const [hasHeaderRow, setHasHeaderRow] = useState(true)
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([])
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const { data: products } = useApi<Product[]>("/products")
  const { data: revisions } = useApi<BomRevision[]>(
    selectedProductId ? `/bom/product/${selectedProductId}` : "",
    { enabled: !!selectedProductId }
  )
  const { data: selectedRevision } = useApi<BomRevision>(
    selectedRevisionId ? `/bom/revision/${selectedRevisionId}` : "",
    { enabled: !!selectedRevisionId }
  )

  const headers = useMemo(() => {
    if (fileData.length === 0) return []
    return hasHeaderRow ? fileData[0] : fileData[0].map((_, i) => `Column ${i + 1}`)
  }, [fileData, hasHeaderRow])

  const dataRows = useMemo(() => {
    if (fileData.length === 0) return []
    return hasHeaderRow ? fileData.slice(1) : fileData
  }, [fileData, hasHeaderRow])

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setFileName(file.name)
    const fileExtension = file.name.split(".").pop()?.toLowerCase()

    try {
      if (fileExtension === "xlsx" || fileExtension === "xls") {
        const reader = new FileReader()
        reader.onload = (event) => {
          const data = new Uint8Array(event.target?.result as ArrayBuffer)
          const workbook = XLSX.read(data, { type: "array" })
          const firstSheetName = workbook.SheetNames[0]
          const worksheet = workbook.Sheets[firstSheetName]
          const jsonData = XLSX.utils.sheet_to_json<string[]>(worksheet, { header: 1 })
          setFileData(jsonData.filter(row => row.some(cell => cell)))
        }
        reader.readAsArrayBuffer(file)
      } else {
        const reader = new FileReader()
        reader.onload = (event) => {
          const content = event.target?.result as string
          const rows = parseCSV(content)
          setFileData(rows)
        }
        reader.readAsText(file)
      }
    } catch (error) {
      toast.error("Failed to parse file")
      console.error(error)
    }
  }

  const parseCSV = (content: string): string[][] => {
    const lines = content.split(/\r?\n/).filter(line => line.trim())
    return lines.map(line => {
      const result: string[] = []
      let current = ""
      let inQuotes = false

      for (let i = 0; i < line.length; i++) {
        const char = line[i]
        const nextChar = line[i + 1]

        if (inQuotes) {
          if (char === '"' && nextChar === '"') {
            current += '"'
            i++
          } else if (char === '"') {
            inQuotes = false
          } else {
            current += char
          }
        } else {
          if (char === '"') {
            inQuotes = true
          } else if (char === ",") {
            result.push(current.trim())
            current = ""
          } else {
            current += char
          }
        }
      }
      result.push(current.trim())
      return result
    })
  }

  const initializeMappings = () => {
    const mappings: ColumnMapping[] = headers.map((header) => {
      const lowerHeader = header.toString().toLowerCase().trim()
      let targetField: BomImportField = "ignore"

      if (lowerHeader.includes("ipn") || lowerHeader.includes("internal") || lowerHeader.includes("part number") || lowerHeader === "pn") {
        targetField = "internal_part_number"
      } else if (lowerHeader.includes("qty") || lowerHeader.includes("quantity")) {
        targetField = "quantity_required"
      } else if (lowerHeader.includes("ref") || lowerHeader.includes("designator")) {
        targetField = "reference_designators"
      } else if (lowerHeader === "manufacturer" || lowerHeader === "mfr" || lowerHeader === "mfg") {
        targetField = "manufacturer"
      } else if (lowerHeader.includes("mpn") || lowerHeader.includes("manufacturer p")) {
        targetField = "manufacturer_pn"
      } else if (lowerHeader === "line" || lowerHeader.includes("line number")) {
        targetField = "line_number"
      } else if (lowerHeader.includes("note")) {
        targetField = "notes"
      }

      return { source_column: header.toString(), target_field: targetField }
    })
    setColumnMappings(mappings)
    setStep("mapping")
  }

  const updateMapping = (index: number, targetField: BomImportField) => {
    const newMappings = [...columnMappings]
    newMappings[index] = { ...newMappings[index], target_field: targetField }
    setColumnMappings(newMappings)
  }

  const runValidation = () => {
    if (!selectedRevision?.items) {
      toast.error("No stored BOM items to compare against")
      return
    }

    const ipnMapped = columnMappings.some(m => m.target_field === "internal_part_number")
    if (!ipnMapped) {
      toast.error("Please map at least one column to 'Internal Part Number'")
      return
    }

    setIsLoading(true)

    try {
      // Build column index map
      const columnIndexMap = new Map<string, number>()
      columnMappings.forEach((mapping, index) => {
        if (mapping.target_field !== "ignore") {
          columnIndexMap.set(mapping.target_field, index)
        }
      })

      // Parse uploaded items
      const uploadedItems: ParsedBomItem[] = []
      for (const row of dataRows) {
        const getValue = (field: string): string | undefined => {
          const index = columnIndexMap.get(field)
          if (index !== undefined && index < row.length) {
            const value = row[index]?.toString().trim()
            return value || undefined
          }
          return undefined
        }

        const ipn = getValue("internal_part_number")
        if (!ipn) continue

        const qtyStr = getValue("quantity_required")
        const qty = qtyStr ? parseFloat(qtyStr) : 1

        uploadedItems.push({
          internal_part_number: ipn,
          quantity_required: isNaN(qty) ? 1 : qty,
          reference_designators: getValue("reference_designators"),
          manufacturer: getValue("manufacturer"),
          manufacturer_pn: getValue("manufacturer_pn"),
          line_number: getValue("line_number") ? parseInt(getValue("line_number")!) : undefined,
          notes: getValue("notes"),
        })
      }

      // Compare against stored BOM
      const storedItems = selectedRevision.items
      const storedByIpn = new Map<string, BomItem>()
      storedItems.forEach(item => {
        const ipn = item.material?.internal_part_number?.toLowerCase()
        if (ipn) storedByIpn.set(ipn, item)
      })

      const uploadedByIpn = new Map<string, ParsedBomItem>()
      uploadedItems.forEach(item => {
        uploadedByIpn.set(item.internal_part_number.toLowerCase(), item)
      })

      const matched: ValidationResult["matched"] = []
      const added: ParsedBomItem[] = []
      const removed: BomItem[] = []

      // Find matched and added items
      for (const uploaded of uploadedItems) {
        const ipnLower = uploaded.internal_part_number.toLowerCase()
        const stored = storedByIpn.get(ipnLower)

        if (stored) {
          const differences: string[] = []

          // Check quantity
          if (Math.abs(stored.quantity_required - uploaded.quantity_required) > 0.0001) {
            differences.push(`Qty: ${stored.quantity_required} → ${uploaded.quantity_required}`)
          }

          // Check reference designators
          const storedRefDes = stored.reference_designators?.trim() || ""
          const uploadedRefDes = uploaded.reference_designators?.trim() || ""
          if (storedRefDes.toLowerCase() !== uploadedRefDes.toLowerCase() && (storedRefDes || uploadedRefDes)) {
            differences.push(`Ref Des changed`)
          }

          matched.push({ stored, uploaded, differences })
        } else {
          added.push(uploaded)
        }
      }

      // Find removed items
      for (const stored of storedItems) {
        const ipn = stored.material?.internal_part_number?.toLowerCase()
        if (ipn && !uploadedByIpn.has(ipn)) {
          removed.push(stored)
        }
      }

      const result: ValidationResult = {
        matched,
        added,
        removed,
        summary: {
          total_stored: storedItems.length,
          total_uploaded: uploadedItems.length,
          matched_count: matched.length,
          matched_with_differences: matched.filter(m => m.differences.length > 0).length,
          added_count: added.length,
          removed_count: removed.length,
        },
      }

      setValidationResult(result)
      setStep("results")
    } catch (error) {
      toast.error("Validation failed")
      console.error(error)
    } finally {
      setIsLoading(false)
    }
  }

  const resetValidation = () => {
    setStep("select")
    setSelectedProductId("")
    setSelectedRevisionId("")
    setFileName("")
    setFileData([])
    setColumnMappings([])
    setValidationResult(null)
  }

  const isMatch = validationResult &&
    validationResult.added.length === 0 &&
    validationResult.removed.length === 0 &&
    validationResult.summary.matched_with_differences === 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/bom">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">BOM Validation</h1>
            <p className="text-muted-foreground">
              Compare an uploaded BOM against a stored revision
            </p>
          </div>
        </div>
        {step !== "select" && (
          <Button variant="outline" onClick={resetValidation}>
            Start Over
          </Button>
        )}
      </div>

      {/* Progress indicator */}
      <div className="flex items-center justify-center gap-2">
        {(["select", "upload", "mapping", "results"] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center">
            <div
              className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                step === s
                  ? "bg-primary text-primary-foreground"
                  : (["select", "upload", "mapping", "results"].indexOf(step) > i)
                  ? "bg-primary/20 text-primary"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {(["select", "upload", "mapping", "results"].indexOf(step) > i) ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                i + 1
              )}
            </div>
            {i < 3 && (
              <div
                className={`w-8 h-1 mx-1 ${
                  (["select", "upload", "mapping", "results"].indexOf(step) > i)
                    ? "bg-primary/20"
                    : "bg-muted"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Select Baseline */}
      {step === "select" && (
        <Card>
          <CardHeader>
            <CardTitle>Step 1: Select Baseline BOM</CardTitle>
            <CardDescription>
              Choose the product and revision to compare against
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Product</Label>
                <Select value={selectedProductId} onValueChange={(v) => {
                  setSelectedProductId(v)
                  setSelectedRevisionId("")
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a product" />
                  </SelectTrigger>
                  <SelectContent>
                    {products?.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.part_number} - {product.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Revision</Label>
                <Select
                  value={selectedRevisionId}
                  onValueChange={setSelectedRevisionId}
                  disabled={!selectedProductId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a revision" />
                  </SelectTrigger>
                  <SelectContent>
                    {revisions?.map((rev) => (
                      <SelectItem key={rev.id} value={rev.id}>
                        {rev.revision_number}
                        {rev.is_active && " (Active)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {selectedRevision && (
              <div className="p-4 bg-muted rounded-lg">
                <p className="font-medium">Selected: {selectedRevision.revision_number}</p>
                <p className="text-sm text-muted-foreground">
                  {selectedRevision.items?.length || 0} items
                  {selectedRevision.change_summary && ` - ${selectedRevision.change_summary}`}
                </p>
              </div>
            )}

            <div className="flex justify-end">
              <Button
                onClick={() => setStep("upload")}
                disabled={!selectedRevisionId}
              >
                Next: Upload File
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Upload File */}
      {step === "upload" && (
        <Card>
          <CardHeader>
            <CardTitle>Step 2: Upload BOM File</CardTitle>
            <CardDescription>
              Upload the BOM file to compare against {selectedRevision?.revision_number}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border-2 border-dashed rounded-lg p-8 text-center">
              <FileUp className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <div className="space-y-2">
                <Label
                  htmlFor="file-upload"
                  className="text-primary cursor-pointer hover:underline"
                >
                  Click to upload or drag and drop
                </Label>
                <p className="text-sm text-muted-foreground">CSV or Excel files (.csv, .xlsx, .xls)</p>
              </div>
              <Input
                id="file-upload"
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            {fileName && (
              <div className="flex items-center gap-2 p-2 bg-muted rounded">
                <FileUp className="h-4 w-4" />
                <span className="text-sm">{fileName}</span>
                <span className="text-sm text-muted-foreground">
                  ({dataRows.length} data rows)
                </span>
              </div>
            )}

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="has_header"
                checked={hasHeaderRow}
                onChange={(e) => setHasHeaderRow(e.target.checked)}
                className="h-4 w-4"
              />
              <Label htmlFor="has_header">File has header row</Label>
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep("select")}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <Button
                onClick={initializeMappings}
                disabled={fileData.length === 0}
              >
                Next: Map Columns
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Column Mapping */}
      {step === "mapping" && (
        <Card>
          <CardHeader>
            <CardTitle>Step 3: Map Columns</CardTitle>
            <CardDescription>
              Map your file columns to BOM fields
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              {columnMappings.map((mapping, index) => (
                <div key={index} className="flex items-center gap-4">
                  <div className="w-1/3 text-sm font-medium truncate" title={mapping.source_column}>
                    {mapping.source_column}
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <Select
                    value={mapping.target_field}
                    onValueChange={(value) => updateMapping(index, value as BomImportField)}
                  >
                    <SelectTrigger className="w-[200px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BOM_FIELDS.map((field) => (
                        <SelectItem key={field.value} value={field.value}>
                          {field.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            {/* Preview */}
            <div className="border rounded-lg overflow-hidden">
              <div className="bg-muted px-4 py-2 text-sm font-medium">
                Data Preview (first 5 rows)
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {headers.map((header, i) => (
                        <TableHead key={i} className="text-xs whitespace-nowrap">
                          {header}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dataRows.slice(0, 5).map((row, rowIndex) => (
                      <TableRow key={rowIndex}>
                        {row.map((cell, cellIndex) => (
                          <TableCell key={cellIndex} className="text-xs py-1">
                            {cell || "-"}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep("upload")}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <Button onClick={runValidation} disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <FileCheck className="h-4 w-4 mr-2" />
                )}
                Run Validation
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Results */}
      {step === "results" && validationResult && (
        <div className="space-y-6">
          {/* Summary Card */}
          <Card className={isMatch ? "border-green-500" : "border-orange-500"}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {isMatch ? (
                  <>
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <span className="text-green-600">BOMs Match</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-5 w-5 text-orange-600" />
                    <span className="text-orange-600">Differences Found</span>
                  </>
                )}
              </CardTitle>
              <CardDescription>
                Comparing uploaded file against {selectedRevision?.revision_number}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-2xl font-bold">{validationResult.summary.total_stored}</div>
                  <div className="text-sm text-muted-foreground">Stored Items</div>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-2xl font-bold">{validationResult.summary.total_uploaded}</div>
                  <div className="text-sm text-muted-foreground">Uploaded Items</div>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-2xl font-bold text-green-600">
                    {validationResult.summary.matched_count - validationResult.summary.matched_with_differences}
                  </div>
                  <div className="text-sm text-muted-foreground">Exact Matches</div>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-2xl font-bold text-orange-600">
                    {validationResult.summary.matched_with_differences + validationResult.summary.added_count + validationResult.summary.removed_count}
                  </div>
                  <div className="text-sm text-muted-foreground">Discrepancies</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Summary Badges */}
          <div className="flex gap-4 flex-wrap">
            <Badge variant="secondary" className="gap-1 text-sm py-1 px-3">
              <CheckCircle className="h-3 w-3" />
              {validationResult.summary.matched_count - validationResult.summary.matched_with_differences} Exact Match
            </Badge>
            {validationResult.summary.matched_with_differences > 0 && (
              <Badge variant="outline" className="gap-1 text-sm py-1 px-3 text-blue-600 border-blue-300">
                <RefreshCw className="h-3 w-3" />
                {validationResult.summary.matched_with_differences} Changed
              </Badge>
            )}
            {validationResult.summary.added_count > 0 && (
              <Badge variant="outline" className="gap-1 text-sm py-1 px-3 text-green-600 border-green-300">
                <Plus className="h-3 w-3" />
                {validationResult.summary.added_count} Added
              </Badge>
            )}
            {validationResult.summary.removed_count > 0 && (
              <Badge variant="outline" className="gap-1 text-sm py-1 px-3 text-red-600 border-red-300">
                <Minus className="h-3 w-3" />
                {validationResult.summary.removed_count} Removed
              </Badge>
            )}
          </div>

          {/* Changed Items */}
          {validationResult.matched.filter(m => m.differences.length > 0).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-blue-600 flex items-center gap-2">
                  <RefreshCw className="h-4 w-4" />
                  Changed Items
                </CardTitle>
                <CardDescription>
                  Items that exist in both but have different values
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Internal P/N</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Differences</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {validationResult.matched
                      .filter(m => m.differences.length > 0)
                      .map((item, i) => (
                        <TableRow key={i} className="bg-blue-50 dark:bg-blue-950/20">
                          <TableCell className="font-medium">
                            {item.stored.material?.internal_part_number}
                          </TableCell>
                          <TableCell className="text-sm">
                            {item.stored.material?.description || "-"}
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              {item.differences.map((diff, j) => (
                                <Badge key={j} variant="outline" className="text-xs">
                                  {diff}
                                </Badge>
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Added Items */}
          {validationResult.added.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-green-600 flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  Added Items
                </CardTitle>
                <CardDescription>
                  Items in the uploaded file but not in the stored BOM
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Internal P/N</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Ref Des</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {validationResult.added.map((item, i) => (
                      <TableRow key={i} className="bg-green-50 dark:bg-green-950/20">
                        <TableCell className="font-medium">
                          {item.internal_part_number}
                        </TableCell>
                        <TableCell>{item.quantity_required}</TableCell>
                        <TableCell className="text-sm max-w-[200px] truncate">
                          {item.reference_designators || "-"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {item.notes || "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Removed Items */}
          {validationResult.removed.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-red-600 flex items-center gap-2">
                  <Minus className="h-4 w-4" />
                  Removed Items
                </CardTitle>
                <CardDescription>
                  Items in the stored BOM but not in the uploaded file
                </CardDescription>
              </CardHeader>
              <CardContent>
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
                    {validationResult.removed.map((item, i) => (
                      <TableRow key={i} className="bg-red-50 dark:bg-red-950/20">
                        <TableCell className="font-medium">
                          {item.material?.internal_part_number || "-"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {item.material?.description || "-"}
                        </TableCell>
                        <TableCell>{item.quantity_required}</TableCell>
                        <TableCell className="text-sm max-w-[200px] truncate">
                          {item.reference_designators || "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* All Matched Items (collapsible) */}
          {validationResult.matched.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  All Matched Items ({validationResult.matched.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-64 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Internal P/N</TableHead>
                        <TableHead>Stored Qty</TableHead>
                        <TableHead>Uploaded Qty</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {validationResult.matched.map((item, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">
                            {item.stored.material?.internal_part_number}
                          </TableCell>
                          <TableCell>{item.stored.quantity_required}</TableCell>
                          <TableCell>{item.uploaded.quantity_required}</TableCell>
                          <TableCell>
                            {item.differences.length === 0 ? (
                              <Badge variant="outline" className="text-green-600">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Match
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-blue-600">
                                <RefreshCw className="h-3 w-3 mr-1" />
                                Changed
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
