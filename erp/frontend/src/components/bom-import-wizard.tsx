"use client"

import { useState, useCallback } from "react"
import * as XLSX from "xlsx"
import { useApi, useMutation } from "@/hooks/use-api"
import {
  api,
  type BomImportPreviewResult,
  type BomImportParseResult,
  type BomImportMapping,
  type BomImportField,
  type ColumnMapping,
  type BomRevision,
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
  Upload,
  FileUp,
  ArrowRight,
  ArrowLeft,
  Check,
  AlertTriangle,
  XCircle,
  Loader2,
} from "lucide-react"
import { toast } from "sonner"

const BOM_FIELDS: { value: BomImportField; label: string }[] = [
  { value: "internal_part_number", label: "Internal Part Number *" },
  { value: "alternate_ipn", label: "Alternate IPN" },
  { value: "manufacturer", label: "Manufacturer" },
  { value: "manufacturer_pn", label: "Manufacturer P/N" },
  { value: "quantity_required", label: "Quantity Required *" },
  { value: "reference_designators", label: "Reference Designators" },
  { value: "line_number", label: "Line Number" },
  { value: "resource_type", label: "Resource Type" },
  { value: "polarized", label: "Polarized" },
  { value: "notes", label: "Notes" },
  { value: "ignore", label: "-- Ignore --" },
]

type WizardStep = "upload" | "mapping" | "preview" | "commit"

interface BomImportWizardProps {
  productId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function BomImportWizard({
  productId,
  open,
  onOpenChange,
  onSuccess,
}: BomImportWizardProps) {
  const [step, setStep] = useState<WizardStep>("upload")
  const [fileContent, setFileContent] = useState<string>("")
  const [fileName, setFileName] = useState<string>("")
  const [hasHeaderRow, setHasHeaderRow] = useState(true)
  const [skipRows, setSkipRows] = useState(0)
  const [multiRowDesignators, setMultiRowDesignators] = useState(false)
  const [previewResult, setPreviewResult] = useState<BomImportPreviewResult | null>(null)
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([])
  const [parseResult, setParseResult] = useState<BomImportParseResult | null>(null)
  const [revisionNumber, setRevisionNumber] = useState("")
  const [changeSummary, setChangeSummary] = useState("")
  const [isActive, setIsActive] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  // Fetch saved mappings
  const { data: savedMappings } = useApi<BomImportMapping[]>("/bom/import/mappings")

  const resetWizard = useCallback(() => {
    setStep("upload")
    setFileContent("")
    setFileName("")
    setHasHeaderRow(true)
    setSkipRows(0)
    setMultiRowDesignators(false)
    setPreviewResult(null)
    setColumnMappings([])
    setParseResult(null)
    setRevisionNumber("")
    setChangeSummary("")
    setIsActive(false)
  }, [])

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setFileName(file.name)
    const fileExtension = file.name.split(".").pop()?.toLowerCase()

    if (fileExtension === "xlsx" || fileExtension === "xls") {
      // Handle Excel files
      const reader = new FileReader()
      reader.onload = async (event) => {
        try {
          const data = new Uint8Array(event.target?.result as ArrayBuffer)
          const workbook = XLSX.read(data, { type: "array" })

          // Get the first sheet
          const firstSheetName = workbook.SheetNames[0]
          const worksheet = workbook.Sheets[firstSheetName]

          // Convert to CSV
          const csvContent = XLSX.utils.sheet_to_csv(worksheet)

          // Convert to base64 (UTF-8 safe encoding)
          const base64 = btoa(unescape(encodeURIComponent(csvContent)))
          setFileContent(base64)
        } catch (error) {
          toast.error("Failed to parse Excel file")
          console.error("Excel parse error:", error)
        }
      }
      reader.readAsArrayBuffer(file)
    } else {
      // Handle CSV files
      const reader = new FileReader()
      reader.onload = async (event) => {
        const content = event.target?.result as string
        // Convert to base64 (UTF-8 safe encoding)
        // encodeURIComponent handles UTF-8 chars, unescape converts to Latin1 for btoa
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
      const result = await api.post<BomImportPreviewResult>("/bom/import/preview", {
        file_content: fileContent,
        has_header_row: hasHeaderRow,
        skip_rows: skipRows,
      })
      setPreviewResult(result)

      // Initialize column mappings with smart defaults
      const initialMappings: ColumnMapping[] = result.headers.map((header) => {
        const lowerHeader = header.toLowerCase().trim()
        let targetField: BomImportField = "ignore"

        // Try to auto-detect field mappings
        if (lowerHeader.includes("ipn") || lowerHeader.includes("internal") || lowerHeader.includes("part number")) {
          targetField = "internal_part_number"
        } else if (lowerHeader.includes("alternate")) {
          targetField = "alternate_ipn"
        } else if (lowerHeader === "manufacturer" || lowerHeader === "mfr") {
          targetField = "manufacturer"
        } else if (lowerHeader.includes("mpn") || lowerHeader.includes("manufacturer p")) {
          targetField = "manufacturer_pn"
        } else if (lowerHeader.includes("qty") || lowerHeader.includes("quantity")) {
          targetField = "quantity_required"
        } else if (lowerHeader.includes("ref") || lowerHeader.includes("designator")) {
          targetField = "reference_designators"
        } else if (lowerHeader === "line" || lowerHeader.includes("line number")) {
          targetField = "line_number"
        } else if (lowerHeader.includes("type") || lowerHeader.includes("resource")) {
          targetField = "resource_type"
        } else if (lowerHeader.includes("polarized") || lowerHeader.includes("polarity")) {
          targetField = "polarized"
        } else if (lowerHeader.includes("note")) {
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

  const handleUseSavedMapping = (mapping: BomImportMapping) => {
    // Apply saved mapping to current columns
    const newMappings = previewResult!.headers.map((header) => {
      const savedMapping = mapping.column_mappings.find(
        (m) => m.source_column.toLowerCase() === header.toLowerCase()
      )
      return {
        source_column: header,
        target_field: savedMapping?.target_field || ("ignore" as BomImportField),
      }
    })
    setColumnMappings(newMappings)
    setHasHeaderRow(mapping.has_header_row)
    setSkipRows(mapping.skip_rows)
    setMultiRowDesignators(mapping.multi_row_designators)
    toast.success(`Applied mapping: ${mapping.name}`)
  }

  const handleParse = async () => {
    // Validate required fields are mapped
    const ipnMapped = columnMappings.some((m) => m.target_field === "internal_part_number")
    const qtyMapped = columnMappings.some((m) => m.target_field === "quantity_required")

    if (!ipnMapped) {
      toast.error("Please map at least one column to 'Internal Part Number'")
      return
    }

    setIsLoading(true)
    try {
      const result = await api.post<BomImportParseResult>("/bom/import/parse", {
        file_content: fileContent,
        column_mappings: columnMappings,
        has_header_row: hasHeaderRow,
        skip_rows: skipRows,
        multi_row_designators: multiRowDesignators,
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
    if (!revisionNumber.trim()) {
      toast.error("Please enter a revision number")
      return
    }

    if (!parseResult || parseResult.items.length === 0) {
      toast.error("No items to import")
      return
    }

    setIsLoading(true)
    try {
      const result = await api.post<BomRevision & { created_materials?: string[] }>("/bom/import/commit", {
        product_id: productId,
        revision_number: revisionNumber,
        change_summary: changeSummary || undefined,
        is_active: isActive,
        source_filename: fileName || undefined,
        items: parseResult.items,
      })
      if (result.created_materials && result.created_materials.length > 0) {
        toast.success(`BOM imported successfully! ${result.created_materials.length} new materials created.`)
      } else {
        toast.success("BOM imported successfully!")
      }
      resetWizard()
      onOpenChange(false)
      onSuccess()
    } catch (error) {
      toast.error((error as Error).message || "Failed to commit import")
    } finally {
      setIsLoading(false)
    }
  }

  const updateMapping = (index: number, targetField: BomImportField) => {
    const newMappings = [...columnMappings]
    newMappings[index] = { ...newMappings[index], target_field: targetField }
    setColumnMappings(newMappings)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(newOpen) => {
        if (!newOpen) resetWizard()
        onOpenChange(newOpen)
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="h-4 w-4 mr-2" />
          Import BOM
        </Button>
      </DialogTrigger>
      <DialogContent className="w-screen h-screen max-w-none m-0 rounded-none flex flex-col">
        <DialogHeader>
          <DialogTitle>Import BOM</DialogTitle>
          <DialogDescription>
            {step === "upload" && "Upload a CSV or Excel file containing your bill of materials"}
            {step === "mapping" && "Map the columns in your file to BOM fields"}
            {step === "preview" && "Review the parsed data before importing"}
            {step === "commit" && "Configure and create the BOM revision"}
          </DialogDescription>
        </DialogHeader>

        {/* Progress indicator */}
        <div className="flex items-center justify-between mb-6">
          {(["upload", "mapping", "preview", "commit"] as WizardStep[]).map((s, i) => (
            <div key={s} className="flex items-center">
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                  step === s
                    ? "bg-primary text-primary-foreground"
                    : (["upload", "mapping", "preview", "commit"].indexOf(step) > i)
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {(["upload", "mapping", "preview", "commit"].indexOf(step) > i) ? (
                  <Check className="h-4 w-4" />
                ) : (
                  i + 1
                )}
              </div>
              {i < 3 && (
                <div
                  className={`w-12 h-1 mx-2 ${
                    (["upload", "mapping", "preview", "commit"].indexOf(step) > i)
                      ? "bg-primary/20"
                      : "bg-muted"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step Content */}
        <div className="space-y-4 flex-1 overflow-y-auto">
          {step === "upload" && (
            <div className="space-y-4">
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
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
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
                <div className="space-y-2">
                  <Label htmlFor="skip_rows">Skip rows at start</Label>
                  <Input
                    id="skip_rows"
                    type="number"
                    min={0}
                    value={skipRows}
                    onChange={(e) => setSkipRows(parseInt(e.target.value) || 0)}
                    className="w-20"
                  />
                </div>
              </div>
            </div>
          )}

          {step === "mapping" && previewResult && (
            <div className="space-y-4">
              {/* Saved mappings */}
              {savedMappings && savedMappings.length > 0 && (
                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm">Use Saved Mapping</CardTitle>
                  </CardHeader>
                  <CardContent className="py-2">
                    <div className="flex flex-wrap gap-2">
                      {savedMappings.map((mapping) => (
                        <Button
                          key={mapping.id}
                          variant="outline"
                          size="sm"
                          onClick={() => handleUseSavedMapping(mapping)}
                        >
                          {mapping.name}
                        </Button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Column mapping table */}
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm">Column Mapping</CardTitle>
                  <CardDescription>Map each column to a BOM field</CardDescription>
                </CardHeader>
                <CardContent className="py-2">
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
                </CardContent>
              </Card>

              {/* Multi-row designators option */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="multi_row"
                  checked={multiRowDesignators}
                  onChange={(e) => setMultiRowDesignators(e.target.checked)}
                  className="h-4 w-4"
                />
                <Label htmlFor="multi_row">
                  Consolidate multiple rows per part (for multi-row reference designators)
                </Label>
              </div>

              {/* Preview table */}
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm">
                    Data Preview ({previewResult.preview_rows} of {previewResult.total_rows} rows)
                  </CardTitle>
                </CardHeader>
                <CardContent className="py-2">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {previewResult.headers.map((header, i) => (
                            <TableHead key={i} className="text-xs whitespace-nowrap">
                              {header}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {previewResult.rows.slice(0, 5).map((row, rowIndex) => (
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
                </CardContent>
              </Card>
            </div>
          )}

          {step === "preview" && parseResult && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-2xl font-bold text-green-600">{parseResult.matched_count}</div>
                    <p className="text-sm text-muted-foreground">Existing Materials</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-2xl font-bold text-blue-600">{parseResult.unmatched_count}</div>
                    <p className="text-sm text-muted-foreground">New Materials</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-2xl font-bold">{parseResult.warnings.length}</div>
                    <p className="text-sm text-muted-foreground">Warnings</p>
                  </CardContent>
                </Card>
              </div>

              {/* Warnings */}
              {parseResult.warnings.length > 0 && (
                <Card className="border-orange-200">
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm flex items-center gap-2 text-orange-600">
                      <AlertTriangle className="h-4 w-4" />
                      Warnings
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="py-2">
                    <ul className="text-sm space-y-1">
                      {parseResult.warnings.map((warning, i) => (
                        <li key={i} className="text-orange-600">{warning}</li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* Errors */}
              {parseResult.errors.length > 0 && (
                <Card className="border-red-200">
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm flex items-center gap-2 text-red-600">
                      <XCircle className="h-4 w-4" />
                      Errors
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="py-2">
                    <ul className="text-sm space-y-1">
                      {parseResult.errors.slice(0, 10).map((error, i) => (
                        <li key={i} className="text-red-600">{error}</li>
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

              {/* Unmatched parts - will be auto-created */}
              {parseResult.unmatched_parts.length > 0 && (
                <Card className="border-blue-200">
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm flex items-center gap-2 text-blue-600">
                      New Materials (will be created)
                    </CardTitle>
                    <CardDescription>
                      These parts were not found in materials and will be automatically created
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="py-2">
                    <div className="flex flex-wrap gap-2">
                      {parseResult.unmatched_parts.map((part, i) => (
                        <Badge key={i} variant="outline" className="text-blue-600 border-blue-300">
                          {part}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Items preview */}
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm">Items to Import ({parseResult.items.length})</CardTitle>
                </CardHeader>
                <CardContent className="py-2">
                  <div className="overflow-x-auto max-h-64">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">IPN</TableHead>
                          <TableHead className="text-xs">Alternate</TableHead>
                          <TableHead className="text-xs">Manufacturer</TableHead>
                          <TableHead className="text-xs">MPN</TableHead>
                          <TableHead className="text-xs">Qty</TableHead>
                          <TableHead className="text-xs">Ref Des</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {parseResult.items.slice(0, 20).map((item, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-xs font-medium">{item.internal_part_number}</TableCell>
                            <TableCell className="text-xs">{item.alternate_ipn || "-"}</TableCell>
                            <TableCell className="text-xs">{item.manufacturer || "-"}</TableCell>
                            <TableCell className="text-xs">{item.manufacturer_pn || "-"}</TableCell>
                            <TableCell className="text-xs">{item.quantity_required}</TableCell>
                            <TableCell className="text-xs max-w-[150px] truncate">
                              {item.reference_designators || "-"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {parseResult.items.length > 20 && (
                      <p className="text-sm text-muted-foreground text-center py-2">
                        ...and {parseResult.items.length - 20} more items
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {step === "commit" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="revision_number">Revision Number *</Label>
                  <Input
                    id="revision_number"
                    value={revisionNumber}
                    onChange={(e) => setRevisionNumber(e.target.value)}
                    placeholder="e.g., A, B, 1.0"
                    required
                  />
                </div>
                <div className="flex items-center gap-2 pt-8">
                  <input
                    type="checkbox"
                    id="is_active_import"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="h-4 w-4"
                  />
                  <Label htmlFor="is_active_import">Set as active revision</Label>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="change_summary">Change Summary</Label>
                <Textarea
                  id="change_summary"
                  value={changeSummary}
                  onChange={(e) => setChangeSummary(e.target.value)}
                  placeholder="Describe the changes..."
                  rows={3}
                />
              </div>

              {parseResult && (
                <div className="bg-muted p-4 rounded">
                  <h4 className="font-medium mb-2">Import Summary</h4>
                  <ul className="text-sm space-y-1">
                    <li>Source file: {fileName}</li>
                    <li>Items to import: {parseResult.items.length}</li>
                    {parseResult.unmatched_count > 0 && (
                      <li className="text-blue-600">
                        New materials to create: {parseResult.unmatched_count}
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="border-t pt-4 mt-4">
          {step !== "upload" && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (step === "mapping") setStep("upload")
                else if (step === "preview") setStep("mapping")
                else if (step === "commit") setStep("preview")
              }}
              disabled={isLoading}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          )}
          <div className="flex-1" />
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {step === "upload" && (
            <Button onClick={handlePreview} disabled={!fileContent || isLoading}>
              {isLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <ArrowRight className="h-4 w-4 mr-2" />
              )}
              Next: Map Columns
            </Button>
          )}
          {step === "mapping" && (
            <Button onClick={handleParse} disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <ArrowRight className="h-4 w-4 mr-2" />
              )}
              Next: Preview
            </Button>
          )}
          {step === "preview" && (
            <Button
              onClick={() => setStep("commit")}
              disabled={!parseResult || parseResult.items.length === 0}
            >
              <ArrowRight className="h-4 w-4 mr-2" />
              Next: Create Revision
            </Button>
          )}
          {step === "commit" && (
            <Button onClick={handleCommit} disabled={isLoading || !revisionNumber.trim()}>
              {isLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Check className="h-4 w-4 mr-2" />
              )}
              Import BOM
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
