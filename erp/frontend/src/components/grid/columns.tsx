import type { ReactNode } from "react"
import { Chip, type ChipTone } from "./chip"
import type { VirtualGridColumn } from "./types"

/**
 * Column factories for spreadsheet-mode grids.
 *
 * These exist to make three things properties of the code rather than of review
 * discipline, because all three were already drifting across the app's grids:
 *
 *  - `copyValue` gets set. Left to the default, a date column copies whatever
 *    its accessor holds — usually an ISO timestamp, which is useless in Excel.
 *  - blanks read the same everywhere. Hand-written columns disagree today: one
 *    grid's missing IPN filters as "" and another's as "—", so the two offer
 *    different blank entries over the same data.
 *  - cells set no font size. The grid supplies `text-xs`; a cell that sets
 *    `text-sm` breaks the row.
 *
 * Every factory takes an override bag, so a column can start here and patch one
 * field rather than being written out longhand.
 */

const BLANK = "—"

type Overrides<T> = Partial<VirtualGridColumn<T>>

function blankCell() {
  return <span className="text-muted-foreground">{BLANK}</span>
}

/** Plain text. */
export function textCol<T>(
  id: string,
  header: string,
  get: (row: T) => string | null | undefined,
  overrides?: Overrides<T>
): VirtualGridColumn<T> {
  return {
    id,
    header,
    size: 140,
    accessorFn: (row) => get(row) ?? "",
    filterAccessor: (row) => get(row) || BLANK,
    cell: (row) => get(row) || blankCell(),
    ...overrides,
  }
}

/** Text in the mono face — part numbers, UIDs, codes. */
export function monoCol<T>(
  id: string,
  header: string,
  get: (row: T) => string | null | undefined,
  overrides?: Overrides<T>
): VirtualGridColumn<T> {
  return {
    ...textCol(id, header, get),
    cell: (row) => {
      const value = get(row)
      return value ? <span className="font-mono">{value}</span> : blankCell()
    },
    ...overrides,
  }
}

/**
 * A number: right-aligned and thousands-separated on screen, raw on the
 * clipboard so Excel receives a number rather than the string "9,875".
 * Missing values sort first ascending.
 */
export function numCol<T>(
  id: string,
  header: string,
  get: (row: T) => number | null | undefined,
  overrides?: Overrides<T> & { decimals?: number }
): VirtualGridColumn<T> {
  const { decimals = 4, ...rest } = overrides ?? {}
  const format = (value: number) =>
    value.toLocaleString(undefined, { maximumFractionDigits: decimals })
  return {
    id,
    header,
    size: 100,
    align: "right",
    accessorFn: (row) => get(row) ?? Number.NEGATIVE_INFINITY,
    filterAccessor: (row) => {
      const value = get(row)
      return value === null || value === undefined ? BLANK : format(value)
    },
    copyValue: (row) => {
      const value = get(row)
      return value === null || value === undefined ? "" : String(value)
    },
    cell: (row) => {
      const value = get(row)
      return value === null || value === undefined ? (
        blankCell()
      ) : (
        <span className="font-mono tabular-nums">{format(value)}</span>
      )
    },
    ...rest,
  }
}

/**
 * A date. Sorts chronologically on the underlying timestamp but copies and
 * filters on what the user can actually see — pasting an ISO string into Excel
 * gives a column of text, not dates. Missing values sort first ascending.
 */
export function dateCol<T>(
  id: string,
  header: string,
  get: (row: T) => string | null | undefined,
  overrides?: Overrides<T> & { time?: boolean }
): VirtualGridColumn<T> {
  const { time = false, ...rest } = overrides ?? {}
  const display = (raw: string) => {
    const date = new Date(raw)
    if (Number.isNaN(date.getTime())) return raw
    return time
      ? `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
      : date.toLocaleDateString()
  }
  return {
    id,
    header,
    size: time ? 140 : 110,
    accessorFn: (row) => {
      const raw = get(row)
      if (!raw) return 0
      const parsed = new Date(raw).getTime()
      return Number.isNaN(parsed) ? 0 : parsed
    },
    filterAccessor: (row) => {
      const raw = get(row)
      return raw ? display(raw) : BLANK
    },
    copyValue: (row) => {
      const raw = get(row)
      return raw ? display(raw) : ""
    },
    cell: (row) => {
      const raw = get(row)
      return raw ? <span className="tabular-nums">{display(raw)}</span> : blankCell()
    },
    ...rest,
  }
}

/** A status token. Sorts and filters on the text, not on the colour. */
export function chipCol<T>(
  id: string,
  header: string,
  get: (row: T) => string | null | undefined,
  tone: (row: T) => ChipTone,
  overrides?: Overrides<T>
): VirtualGridColumn<T> {
  return {
    ...textCol(id, header, get, { size: 110 }),
    cell: (row) => {
      const value = get(row)
      return value ? <Chip tone={tone(row)}>{value}</Chip> : blankCell()
    },
    ...overrides,
  }
}

/** Row actions. Never sorted, never filtered, and copies as an empty cell. */
export function actionsCol<T>(
  render: (row: T) => ReactNode,
  overrides?: Overrides<T>
): VirtualGridColumn<T> {
  return {
    id: "actions",
    header: "",
    size: 70,
    sortable: false,
    filterable: false,
    accessorFn: () => "",
    copyValue: () => "",
    cell: render,
    ...overrides,
  }
}

/**
 * The IPN-and-description pair, as two columns rather than one stacked cell.
 *
 * Four grids render this as `<div><span>{ipn}</span><p>{description}</p></div>`,
 * which a fixed row height clips. Splitting it also makes the description
 * independently sortable, filterable and hideable, which it never was.
 */
export function partCols<T>(opts: {
  ipn: (row: T) => string | null | undefined
  description: (row: T) => string | null | undefined
  ipnHeader?: string
  descriptionHeader?: string
  ipnSize?: number
  descriptionSize?: number
}): [VirtualGridColumn<T>, VirtualGridColumn<T>] {
  return [
    monoCol("ipn", opts.ipnHeader ?? "IPN", opts.ipn, {
      size: opts.ipnSize ?? 150,
      cell: (row) => {
        const value = opts.ipn(row)
        return value ? <span className="font-medium">{value}</span> : blankCell()
      },
    }),
    textCol("description", opts.descriptionHeader ?? "Description", opts.description, {
      size: opts.descriptionSize ?? 220,
      cell: (row) => {
        const value = opts.description(row)
        return value ? <span className="text-muted-foreground">{value}</span> : blankCell()
      },
    }),
  ]
}
