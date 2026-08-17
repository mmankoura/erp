/**
 * Getting a grid out of the browser.
 *
 * The rule is that an export is *what is on screen*: the rows the filters left,
 * in the order the sort put them, through the columns that are visible. A file
 * that quietly contains more than the grid showed is worse than no export,
 * because the difference is invisible until someone acts on it.
 *
 * Cell values come from `copyValueOf`, the same function Ctrl+C uses, so the
 * two agree by construction — a quantity lands as the number 9875 rather than
 * the string "9,875", and an action column that declares `copyValue: () => ""`
 * exports as blank instead of "[object Object]".
 */

import { copyValueOf, type VirtualGridColumn } from "./types"

/** Header labels plus one row per record. Row 0 is always the header. */
export function buildMatrix<T>({
  rows,
  colIds,
  columns,
  includeHeader = true,
}: {
  rows: { original: T }[]
  colIds: string[]
  columns: Map<string, VirtualGridColumn<T>>
  includeHeader?: boolean
}): string[][] {
  const cols = colIds.map((id) => columns.get(id)).filter((c): c is VirtualGridColumn<T> => !!c)
  const matrix: string[][] = []

  if (includeHeader) matrix.push(cols.map((col) => col.header))
  for (const row of rows) {
    matrix.push(cols.map((col) => copyValueOf(col, row.original)))
  }
  return matrix
}

/**
 * A cell that looks like a number becomes one, so the spreadsheet can sum the
 * column without a "convert to number" pass. Everything else stays text —
 * notably part numbers, which are the reason this is a whitelist rather than a
 * `Number()` call: "0800288" must not arrive as 800288, and "1-2" must not
 * become a date.
 */
export function coerceCell(value: string): string | number {
  const trimmed = value.trim()
  if (trimmed === "") return ""
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return value
  // A leading zero is significant in a part number; keep it as text.
  if (/^-?0\d/.test(trimmed)) return value
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : value
}

/** RFC 4180: quote only when the field needs it, and double an embedded quote. */
export function toCsv(matrix: string[][]): string {
  return matrix
    .map((row) =>
      row
        .map((field) => (/[",\n\r]/.test(field) ? `"${field.replace(/"/g, '""')}"` : field))
        .join(",")
    )
    .join("\r\n")
}

/**
 * A filename that sorts chronologically and survives Windows, which rejects
 * \ / : * ? " < > | outright — and `title` here is grid-supplied text like
 * "Lots / Reels".
 */
export function exportFilename(title: string | undefined, extension: string, now: Date): string {
  const sanitized = (title ?? "").replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim()
  // Sanitising "///" leaves "---", so emptiness is not the test — the test is
  // whether anything readable survived.
  const base = /[a-z0-9]/i.test(sanitized) ? sanitized : "export"
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-")
  return `${base} ${stamp}.${extension}`
}
