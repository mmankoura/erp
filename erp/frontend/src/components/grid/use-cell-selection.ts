"use client"

import { useState, useMemo, useEffect, useCallback, useRef } from "react"
import type { CellAddr, SelectionRect } from "./types"

/**
 * The cell cursor and its selected rectangle.
 *
 * Cells are addressed by (row id, column id) rather than by position, because
 * rows move under the cursor every time the grid is sorted or filtered. The
 * rectangle is derived from the current view at render time, so a sort keeps
 * the same *records* highlighted rather than the same screen positions.
 */
export function useCellSelection(rowIds: string[], colIds: string[]) {
  const [active, setActive] = useState<CellAddr | null>(null)
  const [anchor, setAnchor] = useState<CellAddr | null>(null)

  const rowIndex = useMemo(() => {
    const map = new Map<string, number>()
    rowIds.forEach((id, i) => map.set(id, i))
    return map
  }, [rowIds])

  const colIndex = useMemo(() => {
    const map = new Map<string, number>()
    colIds.forEach((id, i) => map.set(id, i))
    return map
  }, [colIds])

  // Keep the cursor pointing at something that still exists. If the active row
  // was filtered away there is nothing sensible to fall back to, so the
  // selection goes; if only the anchor went, the rectangle collapses to the
  // active cell. A hidden column drops the cursor to the first one.
  useEffect(() => {
    if (active && !rowIndex.has(active.rowId)) {
      setActive(null)
      setAnchor(null)
      return
    }
    if (anchor && !rowIndex.has(anchor.rowId)) setAnchor(null)
  }, [rowIndex, active, anchor])

  useEffect(() => {
    if (!active || colIndex.has(active.colId)) return
    const fallback = colIds[0]
    if (!fallback) {
      setActive(null)
      setAnchor(null)
      return
    }
    setActive({ rowId: active.rowId, colId: fallback })
    setAnchor({ rowId: active.rowId, colId: fallback })
  }, [colIndex, colIds, active])

  const rect: SelectionRect | null = useMemo(() => {
    if (!active) return null
    const ar = rowIndex.get(active.rowId)
    const ac = colIndex.get(active.colId)
    if (ar === undefined || ac === undefined) return null
    const br = anchor ? rowIndex.get(anchor.rowId) ?? ar : ar
    const bc = anchor ? colIndex.get(anchor.colId) ?? ac : ac
    return {
      r0: Math.min(ar, br),
      r1: Math.max(ar, br),
      c0: Math.min(ac, bc),
      c1: Math.max(ac, bc),
    }
  }, [active, anchor, rowIndex, colIndex])

  const activePos = useMemo(() => {
    if (!active) return null
    const r = rowIndex.get(active.rowId)
    const c = colIndex.get(active.colId)
    return r === undefined || c === undefined ? null : { r, c }
  }, [active, rowIndex, colIndex])

  // The setters read the latest ids without re-creating themselves on every
  // data change, which would re-bind the grid's key handler each render.
  const idsRef = useRef({ rowIds, colIds })
  idsRef.current = { rowIds, colIds }

  const selectCell = useCallback((rowIdx: number, colIdx: number, extend = false) => {
    const { rowIds: rs, colIds: cs } = idsRef.current
    if (!rs.length || !cs.length) return
    const r = Math.max(0, Math.min(rowIdx, rs.length - 1))
    const c = Math.max(0, Math.min(colIdx, cs.length - 1))
    const next = { rowId: rs[r], colId: cs[c] }
    setActive(next)
    if (extend) {
      // Extending without an anchor pins the corner where the cursor was.
      setAnchor((current) => current ?? next)
    } else {
      setAnchor(next)
    }
  }, [])

  /** Whole row, from the first column to the last. */
  const selectRow = useCallback((rowIdx: number, extend = false) => {
    const { rowIds: rs, colIds: cs } = idsRef.current
    if (!rs.length || !cs.length) return
    const r = Math.max(0, Math.min(rowIdx, rs.length - 1))
    setActive({ rowId: rs[r], colId: cs[cs.length - 1] })
    setAnchor((current) =>
      extend && current
        ? { rowId: current.rowId, colId: cs[0] }
        : { rowId: rs[r], colId: cs[0] }
    )
  }, [])

  const selectAll = useCallback(() => {
    const { rowIds: rs, colIds: cs } = idsRef.current
    if (!rs.length || !cs.length) return
    setAnchor({ rowId: rs[0], colId: cs[0] })
    setActive({ rowId: rs[rs.length - 1], colId: cs[cs.length - 1] })
  }, [])

  const clear = useCallback(() => {
    setActive(null)
    setAnchor(null)
  }, [])

  const isInRect = useCallback(
    (rowIdx: number, colIdx: number) =>
      !!rect && rowIdx >= rect.r0 && rowIdx <= rect.r1 && colIdx >= rect.c0 && colIdx <= rect.c1,
    [rect]
  )

  return { active, activePos, rect, selectCell, selectRow, selectAll, clear, isInRect }
}
