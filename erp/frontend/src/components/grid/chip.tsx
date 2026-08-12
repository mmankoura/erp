import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export type ChipTone = "neutral" | "info" | "success" | "warning" | "danger" | "muted"

const TONES: Record<ChipTone, string> = {
  neutral: "border-border text-foreground",
  info: "border-blue-300 bg-blue-50 text-blue-700",
  success: "border-emerald-300 bg-emerald-50 text-emerald-700",
  warning: "border-amber-300 bg-amber-50 text-amber-800",
  danger: "border-rose-300 bg-rose-50 text-rose-700",
  muted: "border-border bg-muted text-muted-foreground",
}

/**
 * A status token sized for a 26px sheet row.
 *
 * `Badge` is h-5 with px-2 and its own text size — in a sheet cell it either
 * overflows the row or forces the cell's padding open. This is the same idea at
 * the size the grid actually has.
 */
export function Chip({
  tone = "neutral",
  className,
  children,
}: {
  tone?: ChipTone
  className?: string
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border px-1 text-[11px] leading-4 whitespace-nowrap",
        TONES[tone],
        className
      )}
    >
      {children}
    </span>
  )
}
