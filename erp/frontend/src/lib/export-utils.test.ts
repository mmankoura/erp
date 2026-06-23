import { describe, it, expect, beforeEach, vi } from "vitest"

// vi.mock factories are hoisted to the top of the file, so any closed-over
// variables must be declared via vi.hoisted to be available in the factory.
const { jsonToSheetSpy, bookAppendSheetSpy } = vi.hoisted(() => ({
  jsonToSheetSpy: vi.fn(() => ({})),
  bookAppendSheetSpy: vi.fn(),
}))

vi.mock("xlsx", () => ({
  utils: {
    book_new: vi.fn(() => ({})),
    json_to_sheet: jsonToSheetSpy,
    book_append_sheet: bookAppendSheetSpy,
    aoa_to_sheet: vi.fn(() => ({})),
  },
  write: vi.fn(() => new Uint8Array([0, 1, 2])),
  read: vi.fn(),
}))

// Stub URL + DOM so downloadWorkbook doesn't blow up
beforeEach(() => {
  jsonToSheetSpy.mockClear()
  bookAppendSheetSpy.mockClear()
  vi.stubGlobal("URL", {
    createObjectURL: vi.fn(() => "blob:fake"),
    revokeObjectURL: vi.fn(),
  })
})

import {
  exportShortagesByMaterial,
  exportShortagesByCustomer,
} from "./export-utils"

const buildShortage = (overrides: any = {}) => ({
  material_id: "mat-1",
  material: {
    id: "mat-1",
    internal_part_number: "IPN-1",
    description: "Cap 0.1uF",
    manufacturer: "AVX",
    manufacturer_pn: "AVX-1",
  },
  quantity_on_hand: 10,
  quantity_available: 5,
  quantity_on_order: 0,
  total_required: 25,
  shortage: 20,
  use_alternates: false,
  alternates: [],
  orders: [
    {
      order_number: "ORD-1",
      customer_name: "Acme",
      product_name: "P",
      due_date: "2026-05-01",
      required_quantity: 10,
      allocated_quantity: 5,
    },
  ],
  affected_products: [{ product_name: "P" }],
  ...overrides,
})

describe("exportShortagesByMaterial", () => {
  it("creates Shortages and Order Details sheets", () => {
    exportShortagesByMaterial([buildShortage()])
    expect(bookAppendSheetSpy).toHaveBeenCalledTimes(2)
    const sheetNames = bookAppendSheetSpy.mock.calls.map((c: any) => c[2])
    expect(sheetNames).toEqual(["Shortages", "Order Details"])
  })

  it("falls back to material.manufacturer when no AML entries are provided", () => {
    exportShortagesByMaterial([buildShortage()])
    const main = jsonToSheetSpy.mock.calls[0][0] as any[]
    expect(main[0]["Approved MFG"]).toBe("AVX")
    expect(main[0]["Approved MPN"]).toBe("AVX-1")
  })

  it("only counts APPROVED AML entries", () => {
    const aml = [
      {
        material_id: "mat-1",
        manufacturer: "Murata",
        manufacturer_part_number: "MUR-1",
        status: "APPROVED",
      },
      {
        material_id: "mat-1",
        manufacturer: "Suspended",
        manufacturer_part_number: "SUS-1",
        status: "SUSPENDED",
      },
    ] as any
    exportShortagesByMaterial([buildShortage()], "out.xlsx", aml)
    const main = jsonToSheetSpy.mock.calls[0][0] as any[]
    expect(main[0]["Approved MFG"]).toBe("Murata")
    expect(main[0]["Approved MFG"]).not.toContain("Suspended")
  })

  it('reports Status = "Short" when shortage > 0 and no alternates', () => {
    exportShortagesByMaterial([buildShortage({ shortage: 5, use_alternates: false })])
    const main = jsonToSheetSpy.mock.calls[0][0] as any[]
    expect(main[0].Status).toBe("Short")
  })

  it('reports Status = "Use Alternate" when use_alternates flag is true', () => {
    exportShortagesByMaterial([buildShortage({ use_alternates: true })])
    const main = jsonToSheetSpy.mock.calls[0][0] as any[]
    expect(main[0].Status).toBe("Use Alternate")
  })

  it("explodes one detail row per affected order", () => {
    const s = buildShortage({
      orders: [
        { order_number: "O1", customer_name: "A", product_name: "P", due_date: "2026-01-01", required_quantity: 1, allocated_quantity: 0 },
        { order_number: "O2", customer_name: "B", product_name: "P", due_date: "2026-02-01", required_quantity: 2, allocated_quantity: 0 },
      ],
    })
    exportShortagesByMaterial([s])
    const detail = jsonToSheetSpy.mock.calls[1][0] as any[]
    expect(detail).toHaveLength(2)
    expect(detail[0]["Order #"]).toBe("O1")
    expect(detail[1]["Order #"]).toBe("O2")
  })
})

describe("exportShortagesByCustomer", () => {
  const buildCustomer = (overrides: any = {}) => ({
    customer_id: "c-1",
    customer_name: "Acme",
    customer_code: "ACME",
    total_orders_affected: 3,
    total_shortage_items: 5,
    orders: [],
    ...overrides,
  })

  it("creates a Summary sheet first", () => {
    exportShortagesByCustomer([buildCustomer()])
    const firstSheet = bookAppendSheetSpy.mock.calls[0][2]
    expect(firstSheet).toBe("Summary")
  })

  it("includes customer name, code, and counts in summary", () => {
    exportShortagesByCustomer([
      buildCustomer({ customer_name: "Acme", customer_code: "ACME", total_orders_affected: 7, total_shortage_items: 12 }),
    ])
    const summary = jsonToSheetSpy.mock.calls[0][0] as any[]
    expect(summary[0]).toMatchObject({
      Customer: "Acme",
      "Customer Code": "ACME",
      "Orders Affected": 7,
      "Shortage Items": 12,
    })
  })
})
