/**
 * Turning "1-6, 12" into the rows it names.
 *
 * The wizard's gutter shows `srcIndex + 1`, so what the user types is
 * one-based and what every action stores is zero-based. Converting in one
 * tested place keeps that off-by-one out of the dialog, where it would be
 * invisible until someone deleted the wrong line of a BOM.
 */

export interface RowSpec {
  /** srcIndex values, ascending and deduplicated. */
  rows: number[]
}

export interface RowSpecError {
  error: string
}

/** A run like `3-8`, a single number, or a list of either separated by commas. */
export function parseRowSpec(spec: string): RowSpec | RowSpecError {
  const trimmed = spec.trim()
  if (trimmed === "") return { rows: [] }

  const found = new Set<number>()

  for (const part of trimmed.split(",")) {
    const piece = part.trim()
    if (piece === "") continue

    const range = piece.match(/^(\d+)\s*-\s*(\d+)$/)
    if (range) {
      const from = Number(range[1])
      const to = Number(range[2])
      if (from < 1 || to < 1) return { error: `Rows start at 1, not "${piece}"` }
      if (to < from) return { error: `"${piece}" runs backwards` }
      for (let n = from; n <= to; n++) found.add(n - 1)
      continue
    }

    if (!/^\d+$/.test(piece)) return { error: `"${piece}" is not a row or a range` }
    const one = Number(piece)
    if (one < 1) return { error: `Rows start at 1, not "${piece}"` }
    found.add(one - 1)
  }

  return { rows: Array.from(found).sort((a, b) => a - b) }
}

/** Render srcIndexes back as the gutter numbers the user typed, for confirmation. */
export function formatRowSpec(rows: number[]): string {
  if (rows.length === 0) return ""
  const sorted = Array.from(new Set(rows)).sort((a, b) => a - b)
  const parts: string[] = []

  let start = sorted[0]
  let previous = sorted[0]

  const flush = () => {
    parts.push(start === previous ? `${start + 1}` : `${start + 1}-${previous + 1}`)
  }

  for (const value of sorted.slice(1)) {
    if (value === previous + 1) {
      previous = value
      continue
    }
    flush()
    start = value
    previous = value
  }
  flush()

  return parts.join(", ")
}
