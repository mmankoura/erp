/**
 * Tab-separated values, in the dialect Excel actually speaks.
 *
 * Excel quotes a field only when it has to — when the field contains a tab, a
 * newline or a double quote — and escapes an embedded quote by doubling it.
 * Rows are newline-separated, and a pasted block usually arrives with a
 * trailing newline that does not mean "one more empty row".
 */

function escapeField(value: string): string {
  return /[\t\n\r"]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

export function serializeTsv(matrix: string[][]): string {
  return matrix.map((row) => row.map(escapeField).join("\t")).join("\n")
}

export function parseTsv(text: string): string[][] {
  const matrix: string[][] = []
  let row: string[] = []
  let field = ""
  let inQuotes = false
  let i = 0

  while (i < text.length) {
    const ch = text[i]

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      field += ch
      i++
      continue
    }

    if (ch === '"' && field === "") {
      inQuotes = true
      i++
      continue
    }
    if (ch === "\t") {
      row.push(field)
      field = ""
      i++
      continue
    }
    if (ch === "\r") {
      i++
      continue
    }
    if (ch === "\n") {
      row.push(field)
      matrix.push(row)
      row = []
      field = ""
      i++
      continue
    }
    field += ch
    i++
  }

  row.push(field)
  matrix.push(row)

  // Drop the empty row left by a trailing newline, but never turn a genuinely
  // empty clipboard into nothing at all.
  if (matrix.length > 1) {
    const last = matrix[matrix.length - 1]
    if (last.length === 1 && last[0] === "") matrix.pop()
  }

  return matrix
}

/**
 * The same block as an HTML table. Offering this alongside text/plain is what
 * makes Excel paste a rectangle of cells rather than one blob of text.
 */
export function toHtmlTable(matrix: string[][]): string {
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  const body = matrix
    .map((row) => `<tr>${row.map((cell) => `<td>${escape(cell)}</td>`).join("")}</tr>`)
    .join("")
  return `<table>${body}</table>`
}
