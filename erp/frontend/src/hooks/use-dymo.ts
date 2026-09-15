"use client"

import { useCallback, useEffect, useState, useSyncExternalStore } from "react"
import { getPrinters, isDymoAvailable, type DymoPrinter } from "@/lib/dymo/service"

/**
 * Printer choice and auto-print preference live in localStorage, following the
 * same convention as the grid's `vgrid:<key>:*` keys.
 *
 * They are per-workstation on purpose. These are shared factory-floor PCs and
 * the printer is a property of the bench, not of whoever happens to be logged
 * in — so storing this on the user record would be wrong even if there were a
 * preferences API to store it in, which there isn't.
 */
const PRINTER_KEY = "dymo:printer"
const AUTO_PRINT_KEY = "dymo:autoPrint"

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    // Private windows and locked-down browsers throw on access rather than
    // returning null. So does the server, where there is no window at all.
    return null
  }
}

// The `storage` event only fires in *other* tabs, so same-tab writes need their
// own notification or the hook would not re-render after setPrinter.
const listeners = new Set<() => void>()

function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // A remembered printer is a convenience; failing to persist it must not
    // break printing.
  }
  listeners.forEach((notify) => notify())
}

function subscribe(notify: () => void): () => void {
  listeners.add(notify)
  window.addEventListener("storage", notify)
  return () => {
    listeners.delete(notify)
    window.removeEventListener("storage", notify)
  }
}

/**
 * localStorage read as an external store rather than copied into state by an
 * effect. That keeps the server and client first paint in agreement, and means
 * two tabs open at the same bench stay in step.
 */
function usePersisted(key: string, fallback: string): string {
  return useSyncExternalStore(
    subscribe,
    () => readStorage(key) ?? fallback,
    () => fallback,
  )
}

async function probeDymo(): Promise<{
  available: boolean
  printers: DymoPrinter[]
}> {
  const available = await isDymoAvailable()
  return { available, printers: available ? await getPrinters() : [] }
}

export function useDymo() {
  // null means "still checking" — distinct from a settled false, so the UI can
  // avoid flashing "printing unavailable" on every page load.
  const [available, setAvailable] = useState<boolean | null>(null)
  const [printers, setPrinters] = useState<DymoPrinter[]>([])

  const printer = usePersisted(PRINTER_KEY, "")
  const autoPrint = usePersisted(AUTO_PRINT_KEY, "false") === "true"

  const setPrinter = useCallback((name: string) => {
    writeStorage(PRINTER_KEY, name)
  }, [])

  const setAutoPrint = useCallback((on: boolean) => {
    writeStorage(AUTO_PRINT_KEY, String(on))
  }, [])

  // Probing is kept separate from applying so the result lands in a promise
  // callback rather than in the body of an effect.
  const applyProbe = useCallback(
    (result: { available: boolean; printers: DymoPrinter[] }) => {
      setAvailable(result.available)
      setPrinters(result.printers)

      // Fall back to the only connected printer when the remembered one is
      // gone — a bench with one label printer should never have to pick it
      // twice.
      const remembered = readStorage(PRINTER_KEY)
      const first = result.printers[0]
      if (
        first &&
        (!remembered || !result.printers.some((p) => p.name === remembered))
      ) {
        writeStorage(PRINTER_KEY, first.name)
      }
    },
    [],
  )

  const refresh = useCallback(
    () => probeDymo().then(applyProbe),
    [applyProbe],
  )

  useEffect(() => {
    let cancelled = false
    probeDymo().then((result) => {
      if (!cancelled) applyProbe(result)
    })
    return () => {
      cancelled = true
    }
  }, [applyProbe])

  return {
    available,
    printers,
    printer,
    setPrinter,
    autoPrint,
    setAutoPrint,
    refresh,
    /** True when we could actually print right now. */
    canPrint: available === true && printer !== "",
  }
}
