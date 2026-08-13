/**
 * File -> `WizardSource`.
 *
 * Deliberately the only impure corner of the wizard's data path: it reads a
 * File and talks to SheetJS. Everything downstream — `gridFromSource` and the
 * action fold — is pure, which is why the fixtures under `__fixtures__` are
 * plain `WizardSource` JSON and the engine's tests never touch this module.
 *
 * Padding and per-cell trimming are `gridFromSource`'s job, not this one's.
 */

import * as XLSX from "xlsx"
import type { WizardSource } from "./types"

/** Every sheet in a workbook, in book order. */
export interface ParsedWorkbook {
  fileName: string
  sheets: WizardSource[]
}

const isBlankRow = (row: string[]): boolean => row.every((c) => c.trim() === "")

/**
 * Drop the wholly-empty rows that trail almost every exported sheet.
 *
 * Only trailing ones. A blank row *inside* the data is kept, because
 * `srcIndex` is a position in this matrix and every recorded action addresses
 * rows by it — quietly restacking the rows here would silently repoint every
 * action in a saved recipe at a different line of the file.
 */
export function trimTrailingBlankRows(rows: string[][]): string[][] {
  let end = rows.length
  while (end > 0 && isBlankRow(rows[end - 1])) end--
  return rows.slice(0, end)
}

/**
 * One worksheet as a string matrix.
 *
 * `raw: false` asks SheetJS for the *formatted* text, so a quantity that shows
 * as `39` in Excel arrives as `"39"` rather than a float, and a date arrives as
 * the string the user saw. The wizard is a text pipeline end to end; parsing
 * into numbers happens once, at commit.
 */
export function matrixFromSheet(sheet: XLSX.WorkSheet): string[][] {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
    // Keep interior blank rows: see trimTrailingBlankRows on why srcIndex must
    // stay aligned to the file.
    blankrows: true,
  })

  return trimTrailingBlankRows(
    rows.map((row) => row.map((cell) => (cell == null ? "" : String(cell))))
  )
}

/** Parse a workbook's bytes. Handles .xlsx, .xls and .csv — SheetJS sniffs the format. */
export function parseWorkbook(fileName: string, data: ArrayBuffer): ParsedWorkbook {
  const workbook = XLSX.read(new Uint8Array(data), { type: "array" })

  const sheets = workbook.SheetNames.map((sheetName) => ({
    fileName,
    sheetName,
    matrix: matrixFromSheet(workbook.Sheets[sheetName]),
  }))

  return { fileName, sheets }
}

/** Read a picked File. Rejects rather than resolving empty, so the caller can show why. */
export async function readBomFile(file: File): Promise<ParsedWorkbook> {
  const data = await file.arrayBuffer()

  let parsed: ParsedWorkbook
  try {
    parsed = parseWorkbook(file.name, data)
  } catch (err) {
    throw new Error(
      `Could not read ${file.name}: ${err instanceof Error ? err.message : "unrecognised format"}`
    )
  }

  if (parsed.sheets.every((s) => s.matrix.length === 0)) {
    throw new Error(`${file.name} has no rows in any sheet.`)
  }

  return parsed
}
