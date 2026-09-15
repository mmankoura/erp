import { describe, it, expect } from "vitest"
import type { LotLabelData } from "@/lib/api"
import { buildLabelSetXml, escapeXml, labelFieldPreview } from "./labelset"

const buildLabel = (overrides: Partial<LotLabelData> = {}): LotLabelData => ({
  lot_id: "lot-1",
  uid: "ATA014003",
  ipn: "ATS9360-PCIBracket",
  description: "PCIe Bracket, full height",
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

const parse = (xml: string) => new DOMParser().parseFromString(xml, "text/xml")

function column(doc: Document, name: string, record = 0): string {
  const rec = doc.getElementsByTagName("LabelRecord")[record]
  return (
    Array.from(rec?.getElementsByTagName("ObjectData") ?? []).find(
      (n) => n.getAttribute("Name") === name,
    )?.textContent ?? ""
  )
}

describe("escapeXml", () => {
  it("escapes all five XML metacharacters", () => {
    expect(escapeXml(`& < > " '`)).toBe("&amp; &lt; &gt; &quot; &apos;")
  })

  it("does not double-escape the ampersands it introduces", () => {
    expect(escapeXml("A & B < C")).toBe("A &amp; B &lt; C")
  })
})

describe("buildLabelSetXml", () => {
  it("produces parseable XML", () => {
    const doc = parse(buildLabelSetXml([buildLabel()]))
    expect(doc.getElementsByTagName("parsererror")).toHaveLength(0)
    expect(doc.documentElement.tagName).toBe("LabelSet")
  })

  it("maps every field the template binds", () => {
    const doc = parse(buildLabelSetXml([buildLabel()]))
    expect(column(doc, "UID")).toBe("ATA014003")
    expect(column(doc, "AT&A#")).toBe("ATS9360-PCIBracket")
    expect(column(doc, "Description")).toBe("PCIe Bracket, full height")
    expect(column(doc, "MPN")).toBe("ATS9360-BRK")
    expect(column(doc, "MFR")).toBe("Alazar")
    expect(column(doc, "PO#")).toBe("657")
    expect(column(doc, "QTY")).toBe("65")
    expect(column(doc, "Packaging")).toBe("BAG")
    expect(column(doc, "Mounting Type")).toBe("MECH")
    expect(column(doc, "Customer")).toBe("ALAZAR")
  })

  // The template itself contains a column literally named `AT&A#`. If that
  // ampersand reached the XML unescaped the whole job would be rejected.
  it("escapes the ampersand in the AT&A# column name", () => {
    const xml = buildLabelSetXml([buildLabel()])
    expect(xml).toContain('Name="AT&amp;A#"')
    expect(xml).not.toContain('Name="AT&A#"')
  })

  // 38 material descriptions in the catalogue carry inch-mark quotes.
  it("survives a description full of XML metacharacters", () => {
    const doc = parse(
      buildLabelSetXml([
        buildLabel({ description: `Cap 10uF <10% ESR & "low" ESL` }),
      ]),
    )
    expect(doc.getElementsByTagName("parsererror")).toHaveLength(0)
    expect(column(doc, "Description")).toBe(`Cap 10uF <10% ESR & "low" ESL`)
  })

  describe("column aliases", () => {
    // The template binds some fields twice, including `PO# ` with a trailing
    // space. Emitting every alias avoids guessing which one the merge resolves.
    it("emits both PO# spellings", () => {
      const doc = parse(buildLabelSetXml([buildLabel()]))
      expect(column(doc, "PO#")).toBe("657")
      expect(column(doc, "PO# ")).toBe("657")
    })

    it("emits both quantity spellings", () => {
      const doc = parse(buildLabelSetXml([buildLabel()]))
      expect(column(doc, "QTY")).toBe("65")
      expect(column(doc, "Quantity")).toBe("65")
    })

    it("emits both MPN spellings", () => {
      const doc = parse(buildLabelSetXml([buildLabel()]))
      expect(column(doc, "MPN")).toBe("ATS9360-BRK")
      expect(column(doc, "Manufacturer Part Number")).toBe("ATS9360-BRK")
    })

    it("fills Customer Reference from the customer", () => {
      const doc = parse(buildLabelSetXml([buildLabel()]))
      expect(column(doc, "Customer Reference")).toBe("ALAZAR")
    })
  })

  describe("absent values", () => {
    it("renders empty rather than the string 'null'", () => {
      const doc = parse(
        buildLabelSetXml([
          buildLabel({
            description: null,
            manufacturer: null,
            manufacturer_pn: null,
            po_reference: null,
            resource_type: null,
            owner_name: null,
          }),
        ]),
      )
      for (const col of ["Description", "MFR", "MPN", "PO#", "Mounting Type", "Customer"]) {
        expect(column(doc, col)).toBe("")
      }
    })
  })

  // The quantity is also encoded into the DataMatrix, where a thousands
  // separator would have to be stripped by whatever reads it.
  it("writes quantity without a thousands separator", () => {
    const doc = parse(buildLabelSetXml([buildLabel({ quantity: 5000 })]))
    expect(column(doc, "QTY")).toBe("5000")
  })

  it("writes one record per lot, in order", () => {
    const doc = parse(
      buildLabelSetXml([
        buildLabel({ uid: "UID-A" }),
        buildLabel({ uid: "UID-B" }),
        buildLabel({ uid: "UID-C" }),
      ]),
    )
    expect(doc.getElementsByTagName("LabelRecord")).toHaveLength(3)
    expect(column(doc, "UID", 0)).toBe("UID-A")
    expect(column(doc, "UID", 2)).toBe("UID-C")
  })
})

describe("labelFieldPreview", () => {
  it("lists the visible fields once each, without alias duplicates", () => {
    const rows = labelFieldPreview(buildLabel())
    const columns = rows.map((r) => r.column)

    expect(columns).toContain("UID")
    expect(columns).toContain("AT&A#")
    expect(columns).not.toContain("Manufacturer Part Number")
    expect(columns).not.toContain("Quantity")
    expect(new Set(columns).size).toBe(columns.length)
    expect(rows.find((r) => r.column === "UID")?.value).toBe("ATA014003")
  })
})
