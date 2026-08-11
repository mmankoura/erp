"use client"

import { useState, useRef, useEffect } from "react"
import { cn } from "@/lib/utils"
import type { EditorSpec } from "./types"

export type EditorExit = "down" | "up" | "right" | "left" | "none"

/**
 * The in-cell editor.
 *
 * Deliberately a bare input rather than the shadcn `Input`, which is h-9 with a
 * 3px focus ring — neither fits a 26px row. The select is a native one for the
 * same reason, and because a portalled Radix menu anchored inside an absolutely
 * positioned virtual row is more trouble than it is worth.
 */
export function CellEditor({
  spec,
  initial,
  align,
  onCommit,
  onCancel,
}: {
  spec: EditorSpec
  initial: string
  align?: "left" | "right"
  onCommit: (raw: string, exit: EditorExit) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(initial)
  const inputRef = useRef<HTMLInputElement>(null)
  const selectRef = useRef<HTMLSelectElement>(null)
  // Escape blurs the field, and blur commits — this keeps the cancel winning.
  const cancelledRef = useRef(false)

  useEffect(() => {
    if (spec.kind === "select") {
      selectRef.current?.focus()
      return
    }
    const el = inputRef.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [spec.kind])

  const commit = (exit: EditorExit) => {
    if (cancelledRef.current) return
    onCommit(value, exit)
  }

  const cancel = () => {
    cancelledRef.current = true
    onCancel()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "Enter":
        e.preventDefault()
        commit(e.shiftKey ? "up" : "down")
        break
      case "Tab":
        e.preventDefault()
        commit(e.shiftKey ? "left" : "right")
        break
      case "Escape":
        e.preventDefault()
        cancel()
        break
    }
  }

  const shared = "h-full w-full border-0 rounded-none bg-background px-2 text-xs outline-none ring-2 ring-inset ring-primary"

  if (spec.kind === "select") {
    return (
      <select
        ref={selectRef}
        data-grid-cell-editor
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          // Picking an option is the decision — no separate confirm step.
          onCommit(e.target.value, "down")
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => commit("none")}
        className={shared}
      >
        {!spec.options.includes(value) && <option value={value}>{value || "—"}</option>}
        {spec.options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    )
  }

  return (
    <input
      ref={inputRef}
      data-grid-cell-editor
      value={value}
      inputMode={spec.kind === "number" ? "decimal" : undefined}
      maxLength={spec.kind === "text" ? spec.maxLength : undefined}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={() => commit("none")}
      className={cn(shared, align === "right" && "text-right tabular-nums")}
    />
  )
}
