"use client"

import { useState, useCallback } from "react"
import * as XLSX from "xlsx"
import {
  api,
  type InventoryImportPreviewResult,
  type InventoryImportParseResult,
  type InventoryColumnMapping,
  type InventoryImportField,
  type InventoryImportCommitResult,
} from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
  DialogHeader,
  DialogTitle,
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
  Upload,
  ArrowRight,
  ArrowLeft,
  Check,
  AlertTriangle,
  XCircle,
  Loader2,
  Package,
} from "lucide-react"
import { toast } from "sonner"

const INVENTORY_FIELDS: { value: InventoryImportField; label: string; required?: boolean }[] = [
  { value: "uid", label: "UID (Reel ID)", required: true },
  { value: "ipn", label: "Internal Part Number", required: true },
  { value: "quantity", label: "Quantity", required: true },
  { value: "package_type", label: "Package Type" },
  { value: "po_reference", label: "PO Reference" },
  { value: "unit_cost", label: "Unit Cost" },
  { value: "expiration_date", label: "Expiration Date" },
  { value: "notes", label: "Notes" },
  { value: "ignore", label: "-- Ignore --" },
]

type WizardStep = "upload" | "mapping" | "preview" | "commit"

interface InventoryImportWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function InventoryImportWizard({
  open,
  onOpenChange,
  onSuccess,
}: InventoryImportWizardProps) {
  const [step, setStep] = useState<WizardStep>("upload")
  const [fileContent, setFileContent] = useState<string>("")
  const [fileName, setFileName] = useState<string>("")
  const [hasHeaderRow, setHasHeaderRow] = useState(true)
  const [skipRows, setSkipRows] = useState(0)
  const [previewResult, setPreviewResult] = useState<InventoryImportPreviewResult | null>(null)
  const [columnMappings, setColumnMappings] = useState<InventoryColumnMapping[]>([])
  const [parseResult, setParseResult] = useState<InventoryImportParseResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const resetWizard = useCallback(() => {
    setStep("upload")
    setFileContent("")
    setFileName("")
    setHasHeaderRow(true)
    setSkipRows(0)
    setPreviewResult(null)
    setColumnMappings([])
    setParseResult(null)
  }, [])

  const handleClose = useCallback(() => {
    resetWizard()
    onOpenChange(false)
  }, [resetWizard, onOpenChange])

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setFileName(file.name)
    const fileExtension = file.name.split(".").pop()?.toLowerCase()

    if (fileExtension === "xlsx" || fileExtension === "xls") {
      const reader = new FileReader()
      reader.onload = async (event) => {
        try {
          const data = new Uint8Array(event.target?.result as ArrayBuffer)
          const workbook = XLSX.read(data, { type: "array" })
          const firstSheetName = workbook.SheetNames[0]
          const worksheet = workbook.Sheets[firstSheetName]
          const csvContent = XLSX.utils.sheet_to_csv(worksheet)
          const base64 = btoa(unescape(encodeURIComponent(csvContent)))
          setFileContent(base64)
        } catch (error) {
          toast.error("Failed to parse Excel file")
        }
      }
      reader.readAsArrayBuffer(file)
    } else {
      const reader = new FileReader()
      reader.onload = async (event) => {
        const content = event.target?.result as string
        const base64 = btoa(unescape(encodeURIComponent(content)))
        setFileContent(base64)
      }
      reader.readAsText(file)
    }
  }

  const handlePreview = async () => {
    if (!fileContent) {
      toast.error("Please select a file first")
      return
    }

    setIsLoading(true)
    try {
      const result = await api.post<InventoryImportPreviewResult>("/inventory/import/preview", {
        file_content: fileContent,
        has_header_row: hasHeaderRow,
        skip_rows: skipRows,
      })
      setPreviewResult(result)

      // Auto-detect column mappings
      const initialMappings: InventoryColumnMapping[] = result.headers.map((header) => {
        const lowerHeader = header.toLowerCase().trim()
        let targetField: InventoryImportField = "ignore"

        if (lowerHeader === "uid" || lowerHeader === "reel" || lowerHeader === "reel id" || lowerHeader === "lot" || lowerHeader === "lot id") {
          targetField = "uid"
        } else if (lowerHeader === "ipn" || lowerHeader.includes("part number") || lowerHeader.includes("pn") || lowerHeader === "internal part number") {
          targetField = "ipn"
        } else if (lowerHeader === "qty" || lowerHeader === "quantity") {
          targetField = "quantity"
        } else if (lowerHeader === "package" || lowerHeader.includes("package type") || lowerHeader === "pkg") {
          targetField = "package_type"
        } else if (lowerHeader === "po" || lowerHeader.includes("purchase order") || lowerHeader === "po reference") {
          targetField = "po_reference"
        } else if (lowerHeader.includes("cost") || lowerHeader.includes("price") || lowerHeader === "unit cost") {
          targetField = "unit_cost"
        } else if (lowerHeader.includes("expir") || lowerHeader === "expiration" || lowerHeader === "expiration date") {
          targetField = "expiration_date"
        } else if (lowerHeader === "notes" || lowerHeader === "note") {
          targetField = "notes"
        }

        return { source_column: header, target_field: targetField }
      })

      setColumnMappings(initialMappings)
      setStep("mapping")
    } catch (error) {
      toast.error((error as Error).message || "Failed to preview file")
    } finally {
      setIsLoading(false)
    }
  }

  const handleParse = async () => {
    const uidMapped = columnMappings.some((m) => m.target_field === "uid")
    const ipnMapped = columnMappings.some((m) => m.target_field === "ipn")
    const qtyMapped = columnMappings.some((m) => m.target_field === "quantity")

    if (!uidMapped || !ipnMapped || !qtyMapped) {
      toast.error("Please map UID, IPN, and Quantity columns")
      return
    }

    setIsLoading(true)
    try {
      const result = await api.post<InventoryImportParseResult>("/inventory/import/parse", {
        file_content: fileContent,
        column_mappings: columnMappings,
        has_header_row: hasHeaderRow,
        skip_rows: skipRows,
      })
      setParseResult(result)
      setStep("preview")

      if (result.unmatched_count > 0) {
        toast.info(`${result.unmatched_count} new materials will be created`)
      }
    } catch (error) {
      toast.error((error as Error).message || "Failed to parse file")
    } finally {
      setIsLoading(false)
    }
  }

  const handleCommit = async () => {
    if (!parseResult || parseResult.items.length === 0) {
      toast.error("No items to import")
      return
    }

    if (parseResult.errors.length > 0) {
      toast.error("Please fix errors before importing")
      return
    }

    setIsLoading(true)
    try {
      const result = await api.post<InventoryImportCommitResult>("/inventory/import/commit", {
        items: parseResult.items,
        source_filename: fileName || undefined,
      })
      toast.success(`Imported ${result.lots_created} lots successfully!`)
      if (result.created_materials.length > 0) {
        toast.info(`Created ${result.created_materials.length} new materials`)
      }
      handleClose()
      onSuccess()
    } catch (error) {
      toast.error((error as Error).message || "Failed to commit import")
    } finally {
      setIsLoading(false)
    }
  }

  const updateMapping = (index: number, targetField: InventoryImportField) => {
    const newMappings = [...columnMappings]
    newMappings[index] = { ...newMappings[index], target_field: targetField }
    setColumnMappings(newMappings)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Import Inventory
          </DialogTitle>
          <DialogDescription>
            Upload a CSV or Excel file containing your inventory lots/reels
          </DialogDescription>
        </DialogHeader>

        {/* Progress indicator */}
        <div className="flex items-center justify-between mb-6">
          {["upload", "mapping", "preview", "commit"].map((s, i) => (
            <div key={s} className="flex items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  step === s
                    ? "bg-primary text-primary-foreground"
                    : ["upload", "mapping", "preview", "commit"].indexOf(step) > i
                      ? "bg-primary/20 text-primary"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {i + 1}
              </div>
              {i < 3 && (
                <div
                  className={`w-16 h-0.5 mx-2 ${
                    ["upload", "mapping", "preview", "commit"].indexOf(step) > i
                      ? "bg-primary/20"
                      : "bg-muted"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step 1: Upload */}
        {step === "upload" && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Select File</CardTitle>
                <CardDescription>
                  Upload a CSV or Excel file with your inventory data
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="border-2 border-dashed rounded-lg p-8 text-center">
                  <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <Input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={handleFileChange}
                    className="max-w-xs mx-auto"
                  />
                  {fileName && (
                    <p className="mt-2 text-sm text-muted-foreground">
                      Selected: {fileName}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="hasHeader"
                      checked={hasHeaderRow}
                      onCheckedChange={(checked) => setHasHeaderRow(checked as boolean)}
                    />
                    <Label htmlFor="hasHeader">File has header row</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="skipRows">Skip rows:</Label>
                    <Input
                      id="skipRows"
                      type="number"
                      min="0"
                      value={skipRows}
                      onChange={(e) => setSkipRows(parseInt(e.target.value) || 0)}
                      className="w-20"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button onClick={handlePreview} disabled={!fileContent || isLoading}>
                {isLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <ArrowRight className="h-4 w-4 mr-2" />
                )}
                Next: Map Columns
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Column Mapping */}
        {step === "mapping" && previewResult && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Map Columns</CardTitle>
                <CardDescription>
                  Match your file columns to inventory fields. Required fields are marked with *.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>File Column</TableHead>
                      <TableHead>Maps To</TableHead>
                      <TableHead>Sample Data</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {columnMappings.map((mapping, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">{mapping.source_column}</TableCell>
                        <TableCell>
                          <Select
                            value={mapping.target_field}
                            onValueChange={(value) =>
                              updateMapping(index, value as InventoryImportField)
                            }
                          >
                            <SelectTrigger className="w-48">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {INVENTORY_FIELDS.map((field) => (
                                <SelectItem key={field.value} value={field.value}>
                                  {field.label}
                                  {field.required && " *"}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-muted-foreground max-w-[200px] truncate">
                          {previewResult.rows[0]?.[index] || "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep("upload")}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <Button onClick={handleParse} disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <ArrowRight className="h-4 w-4 mr-2" />
                )}
                Next: Preview
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Preview */}
        {step === "preview" && parseResult && (
          <div className="space-y-6">
            {/* Summary cards */}
            <div className="grid grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold">{parseResult.items.length}</div>
                  <p className="text-sm text-muted-foreground">Total Lots</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold text-green-600">
                    {parseResult.matched_count}
                  </div>
                  <p className="text-sm text-muted-foreground">Matched Materials</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold text-yellow-600">
                    {parseResult.unmatched_count}
                  </div>
                  <p className="text-sm text-muted-foreground">New Materials</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold">
                    {parseResult.total_quantity.toLocaleString()}
                  </div>
                  <p className="text-sm text-muted-foreground">Total Quantity</p>
                </CardContent>
              </Card>
            </div>

            {/* Errors */}
            {parseResult.errors.length > 0 && (
              <Card className="border-destructive">
                <CardHeader className="pb-2">
                  <CardTitle className="text-destructive flex items-center gap-2">
                    <XCircle className="h-5 w-5" />
                    Errors ({parseResult.errors.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="text-sm space-y-1 max-h-32 overflow-y-auto">
                    {parseResult.errors.slice(0, 10).map((error, i) => (
                      <li key={i} className="text-destructive">
                        {error}
                      </li>
                    ))}
                    {parseResult.errors.length > 10 && (
                      <li className="text-muted-foreground">
                        ...and {parseResult.errors.length - 10} more errors
                      </li>
                    )}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* Warnings */}
            {parseResult.warnings.length > 0 && (
              <Card className="border-yellow-500">
                <CardHeader className="pb-2">
                  <CardTitle className="text-yellow-600 flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5" />
                    Warnings ({parseResult.warnings.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="text-sm space-y-1 max-h-32 overflow-y-auto">
                    {parseResult.warnings.slice(0, 5).map((warning, i) => (
                      <li key={i} className="text-yellow-600">
                        {warning}
                      </li>
                    ))}
                    {parseResult.warnings.length > 5 && (
                      <li className="text-muted-foreground">
                        ...and {parseResult.warnings.length - 5} more warnings
                      </li>
                    )}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* New materials to be created */}
            {parseResult.unmatched_ipns.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2">
                    Materials to Create ({parseResult.unmatched_ipns.length})
                  </CardTitle>
                  <CardDescription>
                    These IPNs don't exist and will be auto-created
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {parseResult.unmatched_ipns.slice(0, 20).map((ipn) => (
                      <Badge key={ipn} variant="secondary">
                        {ipn}
                      </Badge>
                    ))}
                    {parseResult.unmatched_ipns.length > 20 && (
                      <Badge variant="outline">
                        +{parseResult.unmatched_ipns.length - 20} more
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Preview table */}
            <Card>
              <CardHeader>
                <CardTitle>Preview (first 20 items)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-64 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>UID</TableHead>
                        <TableHead>IPN</TableHead>
                        <TableHead className="text-right">Quantity</TableHead>
                        <TableHead>Package</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {parseResult.items.slice(0, 20).map((item, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono">{item.uid}</TableCell>
                          <TableCell>{item.ipn}</TableCell>
                          <TableCell className="text-right">
                            {item.quantity.toLocaleString()}
                          </TableCell>
                          <TableCell>{item.package_type || "-"}</TableCell>
                          <TableCell>
                            {item.material_matched ? (
                              <Badge variant="outline" className="text-green-600">
                                <Check className="h-3 w-3 mr-1" />
                                Matched
                              </Badge>
                            ) : (
                              <Badge variant="secondary">New</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep("mapping")}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <Button
                onClick={handleCommit}
                disabled={isLoading || parseResult.errors.length > 0}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Check className="h-4 w-4 mr-2" />
                )}
                Import {parseResult.items.length} Lots
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
