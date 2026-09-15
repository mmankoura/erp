import type { LotLabelData } from "@/lib/api"
import { buildLabelSetXml } from "./labelset"
import { isDymoAvailable, loadLabelTemplate, printLabelSet } from "./service"

/**
 * Thrown when there is nothing to print with — no DYMO Connect on this
 * workstation, or its web service is stopped. Callers distinguish it from a
 * genuine print failure so they can say something useful instead of
 * "print failed".
 */
export class DymoUnavailableError extends Error {
  constructor() {
    super(
      "DYMO printing is unavailable on this workstation. Check that DYMO Connect is installed and running.",
    )
    this.name = "DymoUnavailableError"
  }
}

/**
 * Mirrors MAX_LABEL_BATCH in the backend labels module, which rejects anything
 * larger. Kept in sync by hand — the two are far apart, so a mismatch shows up
 * as a 400 rather than a silently truncated print run.
 */
export const MAX_LABEL_BATCH = 200

export interface PrintOptions {
  copies?: number
}

/**
 * Prints labels for the given lots as a single data-merge job against the
 * operator's own .dymo template.
 *
 * Copies are implemented by repeating the LabelRecord rather than through
 * printParamsXml. Repeating records is the mechanism we verified end to end on
 * a real LabelWriter 550; the Copies parameter is not, and this service returns
 * an empty 200 whether it honoured a request or discarded it, so an unverified
 * parameter would fail silently.
 */
export async function printLotLabels(
  printerName: string,
  labels: LotLabelData[],
  options: PrintOptions = {},
): Promise<{ printed: number }> {
  if (labels.length === 0) {
    return { printed: 0 }
  }

  if (!(await isDymoAvailable())) {
    throw new DymoUnavailableError()
  }

  const copies = Math.max(1, Math.floor(options.copies ?? 1))
  const expanded =
    copies === 1 ? labels : labels.flatMap((label) => Array<LotLabelData>(copies).fill(label))

  const template = await loadLabelTemplate()
  await printLabelSet(printerName, template, buildLabelSetXml(expanded))

  return { printed: expanded.length }
}
