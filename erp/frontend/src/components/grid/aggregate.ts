/**
 * The totals row.
 *
 * Aggregates run over the rows the grid is *currently showing* — after the
 * search box, the column filters and the filter row have had their say. That is
 * the whole point of the feature: "what is the total on hand for what I am
 * looking at" is a question the grid could not answer before, and a footer that
 * silently totalled the unfiltered set would answer a different question
 * without saying so.
 */

import type { VirtualGridColumn } from "./types"

export type AggregateKind = "sum" | "avg" | "count" | "min" | "max"

/**
 * A cell's value for aggregation purposes. `accessorFn` is used rather than the
 * rendered cell, for the same reason the clipboard uses it — the rendered form
 * is "9,875" or a React node, neither of which adds up.
 *
 * Anything non-numeric is skipped rather than counted as zero. A column with
 * three numbers and two blanks averages the three; treating the blanks as zero
 * would drag the mean toward a value no row holds.
 */
function numericValues<T>(rows: T[], column: VirtualGridColumn<T>): number[] {
  const values: number[] = []
  for (const row of rows) {
    const raw = column.accessorFn(row)
    if (raw === null || raw === undefined || raw === "") continue
    const parsed = typeof raw === "number" ? raw : Number(String(raw).replace(/,/g, ""))
    if (Number.isFinite(parsed)) values.push(parsed)
  }
  return values
}

/**
 * The aggregate for one column, or null when there is nothing to show — no
 * aggregate configured, or configured but with no numeric rows under it.
 * Returning null rather than 0 keeps "nothing to total" visually distinct from
 * "totals to zero", which on a quantity column are very different facts.
 */
export function aggregateColumn<T>(rows: T[], column: VirtualGridColumn<T>): number | null {
  const kind = column.aggregate
  if (!kind) return null

  // Count is about rows, not values: it answers "how many rows are in front of
  // me", so it counts every row rather than only the numeric ones.
  if (kind === "count") return rows.length

  const values = numericValues(rows, column)
  if (!values.length) return null

  switch (kind) {
    case "sum":
      return values.reduce((total, value) => total + value, 0)
    case "avg":
      return values.reduce((total, value) => total + value, 0) / values.length
    case "min":
      return Math.min(...values)
    case "max":
      return Math.max(...values)
  }
}

/** The short label naming what the number is, so a footer figure is never ambiguous. */
export const AGGREGATE_LABEL: Record<AggregateKind, string> = {
  sum: "Σ",
  avg: "avg",
  count: "count",
  min: "min",
  max: "max",
}

/**
 * Formats to the same rules as `numCol`, so a total sits under its column
 * looking like the numbers above it. An average keeps two decimals even when
 * the column is integers, because that is where the interesting part of a mean
 * usually lives; a count is always whole.
 */
export function formatAggregate(value: number, kind: AggregateKind, decimals = 4): string {
  if (kind === "count") return value.toLocaleString()
  const maximumFractionDigits = kind === "avg" ? Math.max(2, Math.min(decimals, 4)) : decimals
  return value.toLocaleString(undefined, {
    maximumFractionDigits,
    minimumFractionDigits: kind === "avg" ? 2 : 0,
  })
}
