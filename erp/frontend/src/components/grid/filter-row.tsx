"use client"

import { useState, useEffect, useRef, type CSSProperties } from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { GridFilterValue } from "./types"

interface FilterCellColumn {
  getFilterValue: () => unknown
  setFilterValue: (val: unknown) => void
}

/**
 * One cell of the filter row: a substring filter for the column above it.
 *
 * A column can also be filtered from the header's funnel popover, which writes
 * a list of exact values instead. Rather than let the two controls clobber each
 * other, the cell renders that list as a chip — so the row always shows the
 * column's real filter state, whichever control set it.
 */
export function FilterRowCell({
  column,
  width,
  disabled,
  frozenClassName,
  frozenStyle,
}: {
  column: FilterCellColumn
  width: number
  disabled?: boolean
  /** Sticky positioning when this column is frozen; supplied by the grid so all four bands agree. */
  frozenClassName?: string
  frozenStyle?: CSSProperties
}) {
  const value = column.getFilterValue() as GridFilterValue | undefined
  const selectedValues = Array.isArray(value) ? value : null
  const externalText = value && !Array.isArray(value) ? value.contains : ""

  const [text, setText] = useState(externalText)
  // What we last handed to the table. Distinguishes our own echo from an
  // outside change (the header's "Clear N filters" button, say).
  const lastPushed = useRef(externalText)

  useEffect(() => {
    if (externalText !== lastPushed.current) {
      lastPushed.current = externalText
      setText(externalText)
    }
  }, [externalText])

  useEffect(() => {
    if (text === lastPushed.current) return
    const timer = setTimeout(() => {
      lastPushed.current = text
      column.setFilterValue(text ? { contains: text } : undefined)
    }, 200)
    return () => clearTimeout(timer)
  }, [text, column])

  // A frozen cell needs its own background: the band's sits behind the cells,
  // not under each one, so scrolling columns would show through.
  const style = { width, minWidth: width, ...frozenStyle }
  const base = cn(
    "shrink-0 border-r border-border h-full",
    frozenClassName,
    frozenClassName && "bg-background"
  )

  if (disabled) {
    return <div className={base} style={style} />
  }

  if (selectedValues && selectedValues.length > 0) {
    return (
      <div className={cn(base, "flex items-center px-1")} style={style}>
        <button
          onClick={() => column.setFilterValue(undefined)}
          title={selectedValues.join(", ")}
          className="flex items-center gap-1 min-w-0 max-w-full rounded bg-accent px-1 text-[11px] text-accent-foreground hover:bg-accent/70"
        >
          <span className="truncate">
            {selectedValues.length === 1 ? selectedValues[0] : `${selectedValues.length} selected`}
          </span>
          <X className="h-3 w-3 shrink-0" />
        </button>
      </div>
    )
  }

  return (
    <div className={base} style={style}>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setText("")
        }}
        placeholder="—"
        aria-label="Filter column"
        className="h-full w-full bg-transparent px-2 text-[11px] outline-none placeholder:text-muted-foreground/40 focus:bg-background focus:ring-1 focus:ring-inset focus:ring-primary"
      />
    </div>
  )
}
