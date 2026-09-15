/**
 * Client for the DYMO Web Service — the local process installed by DYMO Connect
 * for Desktop, listening on https://127.0.0.1:41951.
 *
 * We talk to its REST API directly rather than loading DYMO's JavaScript
 * framework. That is a deliberate change of approach: DYMO Connect v1.5 does
 * **not** ship `dymo.connect.framework.js` — it is absent from the installation
 * and the service does not serve it — whereas the REST endpoints underneath are
 * present, answer correctly, and send `Access-Control-Allow-Origin: *`, so the
 * page can call them with plain fetch.
 *
 * Serving our app over plain HTTP is fine: browsers block HTTPS pages from
 * loading HTTP subresources, not the reverse, so HTTP → https://127.0.0.1 is an
 * upgrade and is permitted. The workstation must trust the local certificate
 * DYMO's installer sets up.
 */

const DYMO_BASE = "https://127.0.0.1:41951/DYMO/DLS/Printing"

/** The operator's own DYMO Connect template, shipped verbatim as an asset. */
const TEMPLATE_URL = "/dymo/material-label.dymo"

export interface DymoPrinter {
  name: string
  modelName?: string
  isConnected: boolean
  isLocal: boolean
}

/**
 * True when the local web service answers. Everything else in the label feature
 * is gated on this, so a bench with no DYMO Connect degrades to "printing
 * unavailable" rather than erroring.
 */
export async function isDymoAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${DYMO_BASE}/StatusConnected`)
    if (!res.ok) return false
    return (await res.text()).trim().toLowerCase() === "true"
  } catch {
    // Service stopped, not installed, or certificate not trusted. All of these
    // are "no printer here", not faults worth surfacing as errors.
    return false
  }
}

export async function getPrinters(): Promise<DymoPrinter[]> {
  try {
    const res = await fetch(`${DYMO_BASE}/GetPrinters`)
    if (!res.ok) return []
    return parsePrintersXml(await res.text()).filter((p) => p.isConnected)
  } catch {
    return []
  }
}

export function parsePrintersXml(xml: string): DymoPrinter[] {
  const doc = new DOMParser().parseFromString(xml, "text/xml")
  return Array.from(doc.getElementsByTagName("LabelWriterPrinter")).map((node) => {
    const text = (tag: string) =>
      node.getElementsByTagName(tag)[0]?.textContent?.trim() ?? ""
    return {
      name: text("Name"),
      modelName: text("ModelName") || undefined,
      isConnected: text("IsConnected").toLowerCase() !== "false",
      isLocal: text("IsLocal").toLowerCase() !== "false",
    }
  })
}

let templateCache: Promise<string> | null = null

/**
 * Fetches the .dymo template once and caches it.
 *
 * The leading byte-order mark is stripped deliberately: with it present the web
 * service rejects the label with HTTP 400. The committed asset has none, but a
 * re-export from DYMO Connect will reintroduce one, and that failure is opaque
 * enough to be worth defending against here rather than rediscovering.
 */
export function loadLabelTemplate(): Promise<string> {
  if (!templateCache) {
    templateCache = fetch(TEMPLATE_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`Label template not found at ${TEMPLATE_URL}`)
        return res.text()
      })
      .then((xml) => xml.replace(/^﻿/, ""))
      .catch((err) => {
        templateCache = null // let a later attempt retry
        throw err
      })
  }
  return templateCache
}

/** Reset the cached template. Exists for tests. */
export function resetTemplateCache(): void {
  templateCache = null
}

/**
 * Sends one print job. `labelSetXml` carries a record per label, so a batch is a
 * single job rather than N — faster, and it cannot interleave with another
 * workstation's job partway through.
 *
 * The service answers 200 with an empty body on success and gives no structured
 * error, so a rejected job is indistinguishable from a successful one at this
 * layer. Anything it does tell us (a non-2xx) is surfaced.
 */
export async function printLabelSet(
  printerName: string,
  labelXml: string,
  labelSetXml: string,
): Promise<void> {
  const body = new URLSearchParams({
    printerName,
    printParamsXml: "",
    labelXml,
    labelSetXml,
  })

  const res = await fetch(`${DYMO_BASE}/PrintLabel`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  })

  if (!res.ok) {
    throw new Error(`Printer rejected the job (HTTP ${res.status})`)
  }
}
