"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Printer } from "lucide-react"
import { PrintLabelDialog } from "./print-label-dialog"

interface PrintLabelButtonProps {
  lotIds: string[]
  /** Shown in the dialog header — usually the UID for a single-lot reprint. */
  subject?: string
  variant?: "default" | "outline" | "ghost"
  size?: "default" | "sm" | "icon"
  /** Omit for an icon-only button, which is what the grid row actions use. */
  children?: React.ReactNode
  disabled?: boolean
  /** Override the sizing — spreadsheet rows are 26px and need h-5 w-5. */
  className?: string
}

/**
 * Reusable print trigger. The dialog is only mounted once opened, so the label
 * data fetch does not fire for every row in a grid.
 */
export function PrintLabelButton({
  lotIds,
  subject,
  variant = "ghost",
  size = "icon",
  children,
  disabled,
  className,
}: PrintLabelButtonProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className ?? (size === "icon" ? "h-7 w-7" : undefined)}
        title="Print label"
        disabled={disabled || lotIds.length === 0}
        onClick={() => setOpen(true)}
      >
        <Printer className={size === "icon" ? "h-3.5 w-3.5" : "mr-2 h-4 w-4"} />
        {children}
      </Button>
      {open && (
        <PrintLabelDialog
          open={open}
          onOpenChange={setOpen}
          lotIds={lotIds}
          subject={subject}
        />
      )}
    </>
  )
}
