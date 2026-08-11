import { describe, it, expect } from "vitest"
import { serializeTsv, parseTsv, toHtmlTable } from "./tsv"

describe("serializeTsv", () => {
  it("joins cells with tabs and rows with newlines", () => {
    expect(serializeTsv([["a", "b"], ["c", "d"]])).toBe("a\tb\nc\td")
  })

  it("leaves ordinary values unquoted", () => {
    expect(serializeTsv([["R-100", "9875", ""]])).toBe("R-100\t9875\t")
  })

  it("quotes only fields containing a tab, newline or quote", () => {
    expect(serializeTsv([["a\tb"]])).toBe('"a\tb"')
    expect(serializeTsv([["a\nb"]])).toBe('"a\nb"')
    expect(serializeTsv([['say "hi"']])).toBe('"say ""hi"""')
  })
})

describe("parseTsv", () => {
  it("splits a plain block", () => {
    expect(parseTsv("a\tb\nc\td")).toEqual([["a", "b"], ["c", "d"]])
  })

  it("accepts CRLF and bare CR", () => {
    expect(parseTsv("a\tb\r\nc\td")).toEqual([["a", "b"], ["c", "d"]])
  })

  it("drops the empty row left by a trailing newline", () => {
    expect(parseTsv("a\tb\n")).toEqual([["a", "b"]])
  })

  it("keeps empty cells", () => {
    expect(parseTsv("a\t\tb")).toEqual([["a", "", "b"]])
  })

  it("reads quoted fields, including embedded tabs, newlines and quotes", () => {
    expect(parseTsv('"a\tb"\tc')).toEqual([["a\tb", "c"]])
    expect(parseTsv('"line1\nline2"\tc')).toEqual([["line1\nline2", "c"]])
    expect(parseTsv('"say ""hi"""')).toEqual([['say "hi"']])
  })

  it("round-trips whatever serializeTsv produced", () => {
    const matrix = [
      ["R-100", "9,875", 'a "quoted" bin'],
      ["with\ttab", "with\nnewline", ""],
    ]
    expect(parseTsv(serializeTsv(matrix))).toEqual(matrix)
  })

  it("returns a single empty cell for empty input", () => {
    expect(parseTsv("")).toEqual([[""]])
  })
})

describe("toHtmlTable", () => {
  it("emits one td per cell", () => {
    expect(toHtmlTable([["a", "b"]])).toBe("<table><tr><td>a</td><td>b</td></tr></table>")
  })

  it("escapes markup", () => {
    expect(toHtmlTable([["<b>&</b>"]])).toBe(
      "<table><tr><td>&lt;b&gt;&amp;&lt;/b&gt;</td></tr></table>"
    )
  })
})
