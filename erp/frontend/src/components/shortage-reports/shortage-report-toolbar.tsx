"use client"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Printer, FileSpreadsheet } from "lucide-react"

export type ShortageView =
  | "by-material"
  | "by-customer"
  | "by-resource-type"
  | "order-buildability"
  | "affected-assemblies"

interface ShortageReportToolbarProps {
  currentView: ShortageView
  onViewChange: (view: ShortageView) => void
  onPrint: () => void
  onExport: () => void
  isExporting?: boolean
}

export function ShortageReportToolbar({
  currentView,
  onViewChange,
  onPrint,
  onExport,
  isExporting,
}: ShortageReportToolbarProps) {
  return (
    <div className="flex items-center justify-between gap-4 print:hidden">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">View:</span>
        <Select value={currentView} onValueChange={(v) => onViewChange(v as ShortageView)}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="by-material">By Material</SelectItem>
            <SelectItem value="by-customer">By Customer</SelectItem>
            <SelectItem value="by-resource-type">By Part Type</SelectItem>
            <SelectItem value="order-buildability">Order Buildability</SelectItem>
            <SelectItem value="affected-assemblies">Affected Assemblies</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onPrint}>
          <Printer className="h-4 w-4 mr-2" />
          Print
        </Button>
        <Button variant="outline" size="sm" onClick={onExport} disabled={isExporting}>
          <FileSpreadsheet className="h-4 w-4 mr-2" />
          {isExporting ? "Exporting..." : "Export Excel"}
        </Button>
      </div>
    </div>
  )
}
