import { describe, it, expect, vi, beforeEach } from "vitest"
import type { LotLabelData } from "@/lib/api"
import { isDymoAvailable, loadLabelTemplate, printLabelSet } from "./service"
import { printLotLabels, DymoUnavailableError, MAX_LABEL_BATCH } from "./print"

vi.mock("./service", () => ({
  isDymoAvailable: vi.fn(),
  loadLabelTemplate: vi.fn(),
  printLabelSet: vi.fn(),
}))

const available = vi.mocked(isDymoAvailable)
const template = vi.mocked(loadLabelTemplate)
const send = vi.mocked(printLabelSet)

const buildLabel = (overrides: Partial<LotLabelData> = {}): LotLabelData => ({
  lot_id: "lot-1",
  uid: "ATA014003",
  ipn: "ATS9360-PCIBracket",
  description: "PCIe Bracket",
  manufacturer: "Alazar",
  manufacturer_pn: "ATS9360-BRK",
  resource_type: "MECH",
  quantity: 65,
  package_type: "BAG",
  po_reference: "657",
  supplier_name: "Digikey",
  owner_type: "CUSTOMER",
  owner_name: "ALAZAR",
  received_date: null,
  bin: null,
  ...overrides,
})

const recordCount = (xml: string) => (xml.match(/<LabelRecord>/g) ?? []).length

beforeEach(() => {
  vi.clearAllMocks()
  available.mockResolvedValue(true)
  template.mockResolvedValue("<DesktopLabel/>")
  send.mockResolvedValue(undefined)
})

describe("printLotLabels", () => {
  // A workstation with no DYMO Connect is a normal state on this shop floor,
  // and callers need to tell it apart from a genuine print failure.
  it("throws DymoUnavailableError when the web service is not answering", async () => {
    available.mockResolvedValue(false)

    await expect(printLotLabels("LW550", [buildLabel()])).rejects.toBeInstanceOf(
      DymoUnavailableError,
    )
    expect(send).not.toHaveBeenCalled()
  })

  it("does nothing for an empty selection, without probing the printer", async () => {
    const result = await printLotLabels("LW550", [])

    expect(result.printed).toBe(0)
    expect(available).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })

  // A batch is one job with many records, not N jobs — it cannot interleave
  // with another workstation's print partway through.
  it("sends a batch as a single job with one record per lot", async () => {
    const result = await printLotLabels("LW550", [
      buildLabel({ uid: "UID-A" }),
      buildLabel({ uid: "UID-B" }),
    ])

    expect(send).toHaveBeenCalledTimes(1)
    const [printer, labelXml, labelSetXml] = send.mock.calls[0]
    expect(printer).toBe("LW550")
    expect(labelXml).toBe("<DesktopLabel/>")
    expect(recordCount(labelSetXml)).toBe(2)
    expect(result.printed).toBe(2)
  })

  it("prints the operator's own template, not a generated one", async () => {
    template.mockResolvedValue("<DesktopLabel>THEIRS</DesktopLabel>")

    await printLotLabels("LW550", [buildLabel()])

    expect(send.mock.calls[0][1]).toBe("<DesktopLabel>THEIRS</DesktopLabel>")
  })

  describe("copies", () => {
    it("repeats the record rather than using an unverified print parameter", async () => {
      const result = await printLotLabels("LW550", [buildLabel()], { copies: 3 })

      expect(recordCount(send.mock.calls[0][2])).toBe(3)
      expect(result.printed).toBe(3)
    })

    it("floors nonsense counts at one rather than printing nothing", async () => {
      await printLotLabels("LW550", [buildLabel()], { copies: 0 })

      expect(recordCount(send.mock.calls[0][2])).toBe(1)
    })
  })

  it("surfaces a printer rejection instead of reporting success", async () => {
    send.mockRejectedValue(new Error("Printer rejected the job (HTTP 500)"))

    await expect(printLotLabels("LW550", [buildLabel()])).rejects.toThrow(/HTTP 500/)
  })
})

describe("MAX_LABEL_BATCH", () => {
  it("matches the cap the backend enforces", () => {
    expect(MAX_LABEL_BATCH).toBe(200)
  })
})
