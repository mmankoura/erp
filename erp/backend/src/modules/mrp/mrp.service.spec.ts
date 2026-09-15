/**
 * Tests for MrpService.
 *
 * These began as characterization tests: assertions written against the service
 * as it stood, including behaviour known to be wrong, so that a refactor could
 * not move a number without saying so. Most of them still are — they pin
 * behaviour that has not been touched yet, and several document defects that
 * remain open.
 *
 * Assertions still encoding known-bad behaviour are marked:
 *
 *     // CHARACTERIZATION: wrong on purpose — defect #N
 *
 * Open defects pinned here:
 *   #1  three conflicting shortage formulas (getShortages vs getOrderAvailability)
 *   #2  getOrderBuildability never fetches alternate stock, so its alternates
 *       block is dead code — and the double-count it would cause is latent
 *   #3  N+1 allocation queries; each projection re-runs the whole explosion
 *
 * Closed, and now asserted as correct behaviour:
 *   #4  requirements and shortages disagreeing about customer-supplied demand
 *   #9  DNP parts being procured
 *       zero-slack (EXACT) parts being invisible
 *
 * Do NOT "fix" a failing assertion by editing the expected value. Either the
 * production change was intended — in which case update the assertion and its
 * comment deliberately — or it was not, in which case it is a bug.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MrpService } from './mrp.service';
import { Order, OrderStatus } from '../../entities/order.entity';
import { BomItem } from '../../entities/bom-item.entity';
import { Material } from '../../entities/material.entity';
import {
  OrderMaterialSource,
  SupplySource,
} from '../../entities/order-material-source.entity';
import { InventoryService } from '../inventory/inventory.service';
import { PurchaseOrdersService } from '../purchase-orders/purchase-orders.service';
import { MrpAdmissionService } from './mrp-admission.service';
import { MrpDemandSource } from '../../entities/mrp-demand-line.entity';
import { createMockRepo, MockRepo } from '../../test-utils/repo-mock';

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------
//
// Two orders drawing on a shared material, so cross-order aggregation is
// exercised rather than assumed:
//
//   O1  qty 10, rev R1   M1 x2 -> 20   M2 x5 -> 50   M3 x1 -> 10 (customer-supplied)
//   O2  qty  5, rev R2   M1 x4 -> 20
//
//   M1  total demand 40, on hand 30, on order 0   -> short by 10
//   M2  total demand 50, on hand 50               -> EXACT zero slack (invisible today)
//   M3  customer-supplied on O1                   -> excluded from shortages
//   M4  alternate for M1, on hand 100             -> covers M1's shortfall
//
// The numbers are deliberately small and round so an expectation can be checked
// by hand against the formula rather than copied from a failing run.

const REV_1 = 'rev-1';
const REV_2 = 'rev-2';

const mat = (id: string, ipn: string, resourceType = 'SMT'): Material =>
  ({
    id,
    internal_part_number: ipn,
    description: `${ipn} description`,
    resource_type: resourceType,
  }) as unknown as Material;

const M1 = mat('mat-1', 'EN0001');
const M2 = mat('mat-2', 'EN0002');
const M3 = mat('mat-3', 'EN0003', 'TH');
const M4 = mat('mat-4', 'EN0004');

const bomItem = (
  revisionId: string,
  material: Material,
  quantityRequired: string,
  opts: { scrap?: string; line?: number; alternates?: Material[] } = {},
): BomItem =>
  ({
    id: `bi-${revisionId}-${material.id}`,
    bom_revision_id: revisionId,
    material_id: material.id,
    material,
    line_number: opts.line ?? 1,
    // TypeORM hands decimal columns back as strings; the fixture matches reality.
    quantity_required: quantityRequired,
    scrap_factor: opts.scrap ?? '0',
    reference_designators: 'R1, R2',
    alternates: (opts.alternates ?? []).map((altMaterial, i) => ({
      id: `alt-${material.id}-${altMaterial.id}`,
      bom_item_id: `bi-${revisionId}-${material.id}`,
      material_id: altMaterial.id,
      material: altMaterial,
      priority: i + 1,
    })),
  }) as unknown as BomItem;

const order = (
  id: string,
  orderNumber: string,
  quantity: number,
  bomRevisionId: string,
  opts: {
    status?: OrderStatus;
    dueDate?: Date;
    productName?: string;
    customerName?: string;
  } = {},
): Order =>
  ({
    id,
    order_number: orderNumber,
    quantity,
    bom_revision_id: bomRevisionId,
    product_id: `prod-${id}`,
    customer_id: `cust-${id}`,
    status: opts.status ?? OrderStatus.ENTERED,
    due_date: opts.dueDate ?? new Date('2026-09-01T00:00:00Z'),
    product: { id: `prod-${id}`, name: opts.productName ?? `Product ${id}` },
    customer: {
      id: `cust-${id}`,
      name: opts.customerName ?? `Customer ${id}`,
      code: `C-${id}`,
    },
    bom_revision: { id: bomRevisionId, revision_number: 'A' },
  }) as unknown as Order;

const O1 = order('ord-1', 'OR-0001', 10, REV_1, {
  productName: 'Widget One',
  customerName: 'Acme',
});
const O2 = order('ord-2', 'OR-0002', 5, REV_2, {
  status: OrderStatus.KITTING,
  dueDate: new Date('2026-09-15T00:00:00Z'),
  productName: 'Widget Two',
  customerName: 'Globex',
});

const BOM_ITEMS: BomItem[] = [
  bomItem(REV_1, M1, '2', { line: 1, alternates: [M4] }),
  bomItem(REV_1, M2, '5', { line: 2 }),
  bomItem(REV_1, M3, '1', { line: 3 }),
  bomItem(REV_2, M1, '4', { line: 1, alternates: [M4] }),
];

const stock = (onHand: number, allocated: number) => ({
  quantity_on_hand: onHand,
  quantity_allocated: allocated,
  quantity_available: onHand - allocated,
});

const STOCK = new Map<string, ReturnType<typeof stock>>([
  ['mat-1', stock(30, 0)],
  ['mat-2', stock(50, 0)],
  ['mat-3', stock(0, 0)],
  ['mat-4', stock(100, 0)],
]);

/** Unwrap a TypeORM `In([...])` operator, or wrap a bare value. */
const idsFrom = (value: any): string[] =>
  value && typeof value === 'object' && 'value' in value
    ? (value.value as string[])
    : [value];

describe('MrpService (characterization)', () => {
  let service: MrpService;
  let orderRepo: MockRepo;
  let bomItemRepo: MockRepo;
  let omsRepo: MockRepo;
  let inventoryService: { [k: string]: jest.Mock };
  let purchaseOrdersService: { [k: string]: jest.Mock };
  let admissionService: { [k: string]: jest.Mock };

  beforeEach(async () => {
    orderRepo = createMockRepo();
    bomItemRepo = createMockRepo();
    omsRepo = createMockRepo();

    orderRepo.find.mockResolvedValue([O1, O2]);
    orderRepo.findOne.mockImplementation(({ where }: any) =>
      Promise.resolve([O1, O2].find((o) => o.id === where.id) ?? null),
    );

    bomItemRepo.find.mockImplementation(({ where }: any) => {
      const revisions = idsFrom(where.bom_revision_id);
      return Promise.resolve(
        BOM_ITEMS.filter((b) => revisions.includes(b.bom_revision_id)),
      );
    });

    // M3 on O1 is supplied by the customer, so the buyer never procures it.
    omsRepo.find.mockResolvedValue([
      {
        id: 'oms-1',
        order_id: 'ord-1',
        material_id: 'mat-3',
        supply_source: SupplySource.CUSTOMER,
      } as OrderMaterialSource,
    ]);

    inventoryService = {
      getStockByMaterialIds: jest.fn((ids: string[]) => {
        const out = new Map();
        for (const id of ids) {
          out.set(id, { material_id: id, ...(STOCK.get(id) ?? stock(0, 0)) });
        }
        return Promise.resolve(out);
      }),
      getAllocationsByOrder: jest.fn(() => Promise.resolve([])),
    };

    purchaseOrdersService = {
      getQuantitiesOnOrder: jest.fn((ids: string[]) =>
        Promise.resolve(new Map(ids.map((id) => [id, 0]))),
      ),
      getPurchaseOrderDetailsByMaterial: jest.fn((ids: string[]) =>
        Promise.resolve(new Map(ids.map((id) => [id, []]))),
      ),
    };

    // Empty by default: demand falls back to the status query, which is what
    // the bulk of these tests exercise. Individual tests opt into admission.
    admissionService = {
      getDemandLines: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MrpService,
        { provide: getRepositoryToken(Order), useValue: orderRepo },
        { provide: getRepositoryToken(BomItem), useValue: bomItemRepo },
        { provide: getRepositoryToken(Material), useValue: createMockRepo() },
        { provide: getRepositoryToken(OrderMaterialSource), useValue: omsRepo },
        { provide: InventoryService, useValue: inventoryService },
        { provide: PurchaseOrdersService, useValue: purchaseOrdersService },
        { provide: MrpAdmissionService, useValue: admissionService },
      ],
    }).compile();

    service = module.get<MrpService>(MrpService);
  });

  // -------------------------------------------------------------------------
  describe('getOrderRequirements', () => {
    it('explodes one order against its locked BOM revision', async () => {
      const result = await service.getOrderRequirements('ord-1');

      expect(result.order_number).toBe('OR-0001');
      expect(result.order_quantity).toBe(10);
      expect(result.bom_revision_number).toBe('A');
      expect(result.total_line_items).toBe(3);

      const byIpn = Object.fromEntries(
        result.requirements.map((r) => [
          r.material.internal_part_number,
          r.required_quantity,
        ]),
      );
      expect(byIpn).toEqual({ EN0001: 20, EN0002: 50, EN0003: 10 });
    });

    it('applies scrap as a percentage uplift', async () => {
      bomItemRepo.find.mockResolvedValueOnce([
        bomItem(REV_1, M1, '2.5', { scrap: '5' }),
      ]);
      const result = await service.getOrderRequirements('ord-1');
      // 10 x 2.5 x 1.05 = 26.25
      expect(result.requirements[0].required_quantity).toBe(26.25);
    });

    it('does not exclude customer-supplied materials for a single order', async () => {
      const result = await service.getOrderRequirements('ord-1');
      // getOrderRequirements never consults order_material_sources at all.
      expect(
        result.requirements.some((r) => r.material_id === 'mat-3'),
      ).toBe(true);
      expect(omsRepo.find).not.toHaveBeenCalled();
    });

    it('throws when the order does not exist', async () => {
      await expect(service.getOrderRequirements('nope')).rejects.toThrow(
        /not found/i,
      );
    });
  });

  // -------------------------------------------------------------------------
  describe('getShortages', () => {
    it('aggregates demand across orders and reports the shortfall', async () => {
      const report = await service.getShortages();

      expect(report.total_orders_analyzed).toBe(2);

      const m1 = report.shortages.find((s) => s.material_id === 'mat-1');
      expect(m1).toBeDefined();
      // 10x2 + 5x4 = 40 required, 30 on hand, 0 on order -> short 10
      expect(m1!.total_required).toBe(40);
      expect(m1!.quantity_on_hand).toBe(30);
      expect(m1!.shortage).toBe(10);
      expect(m1!.orders.map((o) => o.order_number).sort()).toEqual([
        'OR-0001',
        'OR-0002',
      ]);
    });

    it('excludes customer-supplied materials', async () => {
      const report = await service.getShortages();
      expect(report.shortages.some((s) => s.material_id === 'mat-3')).toBe(
        false,
      );
    });

    it('ignores BOM alternates entirely', async () => {
      const report = await service.getShortages();
      const m1 = report.shortages.find((s) => s.material_id === 'mat-1');
      // M4 has 100 on hand, but the basic report does not consider alternates,
      // so M1 is still reported short by the full 10.
      expect(m1!.shortage).toBe(10);
    });

    it('surfaces a material whose supply exactly equals its demand', async () => {
      const report = await service.getShortages();
      // M2 needs 50 and has exactly 50: zero margin, so any scrap or miscount
      // makes it short. The old `shortage > 0` filter dropped it entirely.
      const m2 = report.shortages.find((s) => s.material_id === 'mat-2');
      expect(m2).toBeDefined();
      expect(m2!.state).toBe('EXACT');
      expect(m2!.shortage).toBe(0);
      expect(report.total_materials_exact).toBe(1);
      // EXACT rows are not counted as shortages — they are a separate warning.
      expect(report.total_materials_with_shortage).toBe(1);
    });

    it('does not misreport float dust as a shortage', async () => {
      // 1/3 of a part x 3 is 0.9999999999999998, not 1.
      bomItemRepo.find.mockResolvedValueOnce([
        bomItem(REV_1, M1, String(1 / 3)),
      ]);
      inventoryService.getStockByMaterialIds.mockImplementation((ids: string[]) => {
        const out = new Map();
        for (const id of ids) {
          out.set(id, { material_id: id, ...stock(10 / 3, 0) });
        }
        return Promise.resolve(out);
      });

      const report = await service.getShortages();
      const m1 = report.shortages.find((s) => s.material_id === 'mat-1');
      // Without the epsilon this classifies as SHORT by ~1e-16.
      expect(m1!.state).toBe('EXACT');
      expect(m1!.shortage).toBe(0);
    });

    it('nets supply as on_hand + on_order, ignoring allocations', async () => {
      inventoryService.getStockByMaterialIds.mockImplementation((ids: string[]) => {
        const out = new Map();
        for (const id of ids) {
          // 30 on hand but 25 already reserved to another order.
          out.set(id, {
            material_id: id,
            ...(id === 'mat-1' ? stock(30, 25) : STOCK.get(id) ?? stock(0, 0)),
          });
        }
        return Promise.resolve(out);
      });

      const report = await service.getShortages();
      const m1 = report.shortages.find((s) => s.material_id === 'mat-1');
      // CHARACTERIZATION: wrong on purpose — defect #1. The global formula uses
      // on_hand + on_order and never looks at `allocated`, so a material with
      // only 5 units genuinely free still reports a shortage of 10, not 35.
      // getOrderAvailability answers the same question differently (see below).
      expect(m1!.quantity_allocated).toBe(25);
      expect(m1!.quantity_available).toBe(5);
      expect(m1!.shortage).toBe(10);
    });

    it('distinguishes stock on the shelf from stock on a purchase order', async () => {
      purchaseOrdersService.getQuantitiesOnOrder.mockImplementation((ids: string[]) =>
        Promise.resolve(new Map(ids.map((id) => [id, id === 'mat-1' ? 10 : 0]))),
      );
      const report = await service.getShortages();
      const m1 = report.shortages.find((s) => s.material_id === 'mat-1');

      // 40 required, 30 on hand + 10 on order. Nothing is missing, but only
      // because a PO is open: if it slips, the part goes short. Previously this
      // dropped out of the report entirely and the buyer lost the warning.
      expect(m1).toBeDefined();
      expect(m1!.state).toBe('COVERED_BY_PO');
      expect(m1!.shortage).toBe(0);
      expect(m1!.quantity_on_order).toBe(10);
    });

    it('does not demand stock for Do-Not-Populate parts', async () => {
      const dnp = mat('mat-dnp', 'Do Not Populate', 'DNP');
      bomItemRepo.find.mockResolvedValueOnce([
        ...BOM_ITEMS,
        bomItem(REV_1, dnp, '7', { line: 4 }),
      ]);

      const report = await service.getShortages();

      // A DNP part is never placed on the board, so procuring it buys parts that
      // are never fitted. Live data had a material named "Do Not Populate"
      // showing 39,905 units of demand and inflating the headline shortage.
      // kitting.service.ts:679 has always skipped these; MRP now agrees.
      expect(
        report.shortages.some((s) => s.material_id === 'mat-dnp'),
      ).toBe(false);

      // The real parts on the same BOM are unaffected.
      expect(
        report.shortages.find((s) => s.material_id === 'mat-1')!.total_required,
      ).toBe(40);
    });

    it('queries allocations once per order (N+1)', async () => {
      await service.getShortages();
      // CHARACTERIZATION: wrong on purpose — defect #3. Two orders, two calls.
      // Phase 2 replaces this with a single batched query.
      expect(inventoryService.getAllocationsByOrder).toHaveBeenCalledTimes(2);
    });
  });

  // -------------------------------------------------------------------------
  describe('getRequirementsSummary', () => {
    it('agrees with the shortage views about what counts as demand', async () => {
      const summary = await service.getRequirementsSummary();
      const shortages = await service.getShortages();

      // M3 is customer-supplied on O1. It was absent from getShortages but
      // present here, so the two tabs reported different demand for the same
      // part at the same instant.
      expect(summary.materials.some((m) => m.material_id === 'mat-3')).toBe(
        false,
      );
      expect(shortages.shortages.some((s) => s.material_id === 'mat-3')).toBe(
        false,
      );

      // Everything the buyer does procure still agrees line for line.
      expect(
        summary.materials.find((m) => m.material_id === 'mat-1')!.total_required,
      ).toBe(
        shortages.shortages.find((s) => s.material_id === 'mat-1')!
          .total_required,
      );
    });

    it('reports net requirement after on-hand and on-order supply', async () => {
      const summary = await service.getRequirementsSummary();
      const m1 = summary.materials.find((m) => m.material_id === 'mat-1');
      expect(m1!.total_required).toBe(40);
      expect(m1!.net_requirement).toBe(10);

      // Never negative: M2 has exactly enough, M4 is not required at all.
      const m2 = summary.materials.find((m) => m.material_id === 'mat-2');
      expect(m2!.net_requirement).toBe(0);
    });

    it('returns po_numbers and earliest_eta despite the declared return type', async () => {
      purchaseOrdersService.getPurchaseOrderDetailsByMaterial.mockImplementation(
        (ids: string[]) =>
          Promise.resolve(
            new Map(
              ids.map((id) => [
                id,
                id === 'mat-1'
                  ? [
                      { po_number: 'PO-2', expected_date: new Date('2026-10-05') },
                      { po_number: 'PO-1', expected_date: new Date('2026-09-20') },
                    ]
                  : [],
              ]),
            ),
          ),
      );

      const summary = await service.getRequirementsSummary();
      const m1: any = summary.materials.find((m) => m.material_id === 'mat-1');
      // CHARACTERIZATION: defect #5 — the declared return type omits both of
      // these fields, yet the frontend reads them. Widening the type is safe.
      expect(m1.po_numbers).toEqual(['PO-2', 'PO-1']);
      expect(m1.earliest_eta).toBe(new Date('2026-09-20').toISOString());
    });
  });

  // -------------------------------------------------------------------------
  describe('getOrderAvailability', () => {
    it('counts stock already allocated to this order as available to it', async () => {
      inventoryService.getStockByMaterialIds.mockImplementation((ids: string[]) => {
        const out = new Map();
        for (const id of ids) {
          out.set(id, {
            material_id: id,
            ...(id === 'mat-1' ? stock(30, 20) : STOCK.get(id) ?? stock(0, 0)),
          });
        }
        return Promise.resolve(out);
      });
      inventoryService.getAllocationsByOrder.mockResolvedValue([
        { material_id: 'mat-1', quantity: '20' },
      ]);

      const result = await service.getOrderAvailability('ord-1');
      const m1 = result.materials.find((m) => m.material_id === 'mat-1');
      // available(10) + allocated_to_this_order(20) + on_order(0) = 30 >= 20
      expect(m1!.can_fulfill).toBe(true);
      expect(m1!.shortage).toBe(0);
    });

    it('uses a different supply formula than getShortages', async () => {
      inventoryService.getStockByMaterialIds.mockImplementation((ids: string[]) => {
        const out = new Map();
        for (const id of ids) {
          out.set(id, {
            material_id: id,
            ...(id === 'mat-1' ? stock(30, 25) : STOCK.get(id) ?? stock(0, 0)),
          });
        }
        return Promise.resolve(out);
      });

      const result = await service.getOrderAvailability('ord-1');
      const m1 = result.materials.find((m) => m.material_id === 'mat-1');
      // CHARACTERIZATION: wrong on purpose — defect #1. Same material, same
      // stock, same instant: here it is short by 15 (needs 20, only 5 free)
      // while getShortages above reports 10. Two formulas, two answers.
      expect(m1!.required_quantity).toBe(20);
      expect(m1!.quantity_available).toBe(5);
      expect(m1!.shortage).toBe(15);
    });

    it('does not exclude customer-supplied materials', async () => {
      const result = await service.getOrderAvailability('ord-1');
      expect(result.materials.some((m) => m.material_id === 'mat-3')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  describe('getEnhancedShortages', () => {
    it('covers a shortfall from alternate stock and flags it', async () => {
      const report = await service.getEnhancedShortages();
      const m1 = report.shortages.find((s) => s.material_id === 'mat-1');

      expect(m1).toBeDefined();
      expect(m1!.use_alternates).toBe(true);
      expect(m1!.shortage).toBe(0);
      expect(m1!.alternates).toHaveLength(1);
      expect(m1!.alternates[0].ipn).toBe('EN0004');
      expect(m1!.alternates[0].quantity_to_use).toBe(10);
    });

    it('carries customer, product and resource-type context', async () => {
      const report = await service.getEnhancedShortages();
      const m1 = report.shortages.find((s) => s.material_id === 'mat-1')!;

      expect(m1.orders.map((o) => o.customer_name).sort()).toEqual([
        'Acme',
        'Globex',
      ]);
      expect(m1.affected_products.map((p) => p.product_name).sort()).toEqual([
        'Widget One',
        'Widget Two',
      ]);
      expect(m1.resource_type_usages[0].resource_type).toBe('SMT');
      expect(m1.resource_type_usages[0].quantity_required).toBe(40);
    });

    it('draws down the alternate pool once, globally', async () => {
      // Both orders are short of M1; the alternate has only 6 units.
      inventoryService.getStockByMaterialIds.mockImplementation((ids: string[]) => {
        const out = new Map();
        for (const id of ids) {
          out.set(id, {
            material_id: id,
            ...(id === 'mat-4' ? stock(6, 0) : STOCK.get(id) ?? stock(0, 0)),
          });
        }
        return Promise.resolve(out);
      });

      const report = await service.getEnhancedShortages();
      const m1 = report.shortages.find((s) => s.material_id === 'mat-1')!;
      // Global demand 40, on hand 30, alternate 6 -> 4 still short. Unlike
      // getOrderBuildability, this method fetches alternate stock in its own
      // batch and applies it once against the aggregate, which is correct.
      expect(m1.shortage).toBe(4);
      expect(m1.alternates[0].quantity_to_use).toBe(6);

      // CHARACTERIZATION: wrong on purpose — the alternate is consumed here but
      // never charged against its own row, so M4 cannot itself be reported short
      // no matter how much demand is transferred onto it. Phase 3 models this as
      // a transfer: substituted_out on M1, substituted_in on M4.
      expect(report.shortages.some((s) => s.material_id === 'mat-4')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  describe('getOrderBuildability', () => {
    it('ignores alternate stock entirely, because it never fetches it', async () => {
      // M1: global demand 40, on hand 30 -> 10 short. Alternate M4 holds 6.
      inventoryService.getStockByMaterialIds.mockImplementation((ids: string[]) => {
        const out = new Map();
        for (const id of ids) {
          out.set(id, {
            material_id: id,
            ...(id === 'mat-4' ? stock(6, 0) : STOCK.get(id) ?? stock(0, 0)),
          });
        }
        return Promise.resolve(out);
      });

      const report = await service.getOrderBuildability();
      const o1 = report.orders.find((o) => o.order_id === 'ord-1')!;
      const o2 = report.orders.find((o) => o.order_id === 'ord-2')!;

      const shortIn = (o: typeof o1) =>
        o.critical_shortages.find((c) => c.material_id === 'mat-1');

      // CHARACTERIZATION: wrong on purpose — defect #2, and worse than it looks.
      // mrp.service.ts:1196 builds `allMaterialIds` from BOM item materials only,
      // so alternate materials are never fetched into `stockLevels`. The lookup
      // at :1330 is therefore always undefined and `altSupply` is always 0 — the
      // whole alternates block at :1324-1337 is dead code that cannot change a
      // number. Both orders report the undiminished 10.
      expect(shortIn(o1)!.global_shortage).toBe(10);
      expect(shortIn(o2)!.global_shortage).toBe(10);

      // The double-count is LATENT, not active: :1334-1335 subtracts the full
      // pool from each order independently, so simply adding alternates to the
      // stock fetch would hand out 12 units of relief from a pool of 6. Phase 3
      // must fix the fetch and the netting together, never the fetch alone.
      expect(inventoryService.getStockByMaterialIds).toHaveBeenCalledWith(
        expect.not.arrayContaining(['mat-4']),
      );
    });

    it('gives every order the full available stock when judging its own shortage', async () => {
      const report = await service.getOrderBuildability();
      const o1 = report.orders.find((o) => o.order_id === 'ord-1')!;
      const o2 = report.orders.find((o) => o.order_id === 'ord-2')!;

      // CHARACTERIZATION: wrong on purpose — defect #1/#2. 30 units on hand are
      // offered in full to O1 (needs 20) and again to O2 (needs 20), so neither
      // records a per-order shortfall even though together they need 40.
      expect(o1.critical_shortages.find((c) => c.material_id === 'mat-1')!.shortage).toBe(0);
      expect(o2.critical_shortages.find((c) => c.material_id === 'mat-1')!.shortage).toBe(0);
    });

    it('treats customer-supplied materials as ready', async () => {
      const report = await service.getOrderBuildability();
      const o1 = report.orders.find((o) => o.order_id === 'ord-1')!;
      expect(
        o1.critical_shortages.some((c) => c.material_id === 'mat-3'),
      ).toBe(false);
    });

    it('classifies orders and totals the counts', async () => {
      const report = await service.getOrderBuildability();
      expect(report.total_orders).toBe(2);
      expect(
        report.can_build_count + report.partial_count + report.blocked_count,
      ).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  describe('projection views', () => {
    it('groups shortages by customer', async () => {
      const report = await service.getShortagesByCustomer();
      expect(report.customers.map((c) => c.customer_name).sort()).toEqual([
        'Acme',
        'Globex',
      ]);
      const acme = report.customers.find((c) => c.customer_name === 'Acme')!;
      expect(acme.total_orders_affected).toBe(1);
      expect(acme.orders[0].order_number).toBe('OR-0001');
    });

    it('groups shortages by resource type in priority order', async () => {
      const report = await service.getShortagesByResourceType();
      expect(report.resource_types[0].resource_type).toBe('SMT');
      expect(report.resource_types[0].materials[0].ipn).toBe('EN0001');
    });

    it('re-runs the whole explosion for each projection', async () => {
      inventoryService.getAllocationsByOrder.mockClear();

      await service.getShortagesByCustomer();
      const afterFirst = inventoryService.getAllocationsByOrder.mock.calls.length;

      await service.getShortagesByResourceType();
      const afterSecond = inventoryService.getAllocationsByOrder.mock.calls.length;

      // CHARACTERIZATION: wrong on purpose — defect #3. Each projection calls
      // getEnhancedShortages again from scratch rather than sharing one pass.
      expect(afterFirst).toBe(2);
      expect(afterSecond).toBe(4);
    });
  });

  // -------------------------------------------------------------------------
  describe('order status selection', () => {
    it('defaults to the four in-flight statuses', async () => {
      await service.getShortages();
      const where = orderRepo.find.mock.calls[0][0].where;
      expect(idsFrom(where.status)).toEqual([
        OrderStatus.ENTERED,
        OrderStatus.KITTING,
        OrderStatus.SMT,
        OrderStatus.TH,
      ]);
    });

    it('honours an explicit status filter', async () => {
      await service.getShortages([OrderStatus.SMT]);
      const where = orderRepo.find.mock.calls[0][0].where;
      expect(idsFrom(where.status)).toEqual([OrderStatus.SMT]);
    });

    it('returns an empty report when nothing is in flight', async () => {
      orderRepo.find.mockResolvedValue([]);
      const report = await service.getShortages();
      expect(report.total_orders_analyzed).toBe(0);
      expect(report.shortages).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  describe('admitted demand', () => {
    it('plans only for jobs the buyer has admitted', async () => {
      // O2 is in flight but not admitted, so its 20 units of M1 must not count.
      admissionService.getDemandLines.mockResolvedValue([
        {
          id: 'line-1',
          source: MrpDemandSource.ORDER,
          order: O1,
          quantity: O1.quantity,
          due_date: null,
          label: 'Widget One',
        },
      ]);

      const report = await service.getShortages();
      const m1 = report.shortages.find((s) => s.material_id === 'mat-1');

      expect(report.total_orders_analyzed).toBe(1);
      // O1 alone needs 10 x 2 = 20, against 30 on hand -> no shortage at all.
      expect(m1).toBeUndefined();
      // The status query is not consulted once demand has been admitted.
      expect(orderRepo.find).not.toHaveBeenCalled();
    });

    it('plans to the line quantity, not the order quantity', async () => {
      // The order is for 10; the buyer is buying for 25.
      admissionService.getDemandLines.mockResolvedValue([
        {
          id: 'line-1',
          source: MrpDemandSource.ORDER,
          order: O1,
          quantity: 25,
          due_date: null,
          label: 'Widget One',
        },
      ]);

      const report = await service.getShortages();
      const m1 = report.shortages.find((s) => s.material_id === 'mat-1')!;
      expect(m1.total_required).toBe(50); // 25 x 2
      expect(m1.shortage).toBe(20); // against 30 on hand
    });

    it('counts a scratch job without touching allocations', async () => {
      admissionService.getDemandLines.mockResolvedValue([
        {
          id: 'line-scratch',
          source: MrpDemandSource.SCRATCH,
          order: null,
          product: { id: 'prod-x', name: 'Prototype' },
          product_id: 'prod-x',
          bom_revision_id: REV_1,
          quantity: 100,
          due_date: null,
          label: 'Prototype what-if',
        },
      ]);

      const report = await service.getShortages();
      const m1 = report.shortages.find((s) => s.material_id === 'mat-1')!;

      expect(m1.total_required).toBe(200); // 100 x 2
      // A scratch job is not an order, so it can hold no allocations. Asking
      // for them would hand the repository a non-UUID.
      expect(inventoryService.getAllocationsByOrder).not.toHaveBeenCalled();
    });

    it('falls back to the status query when nothing is admitted', async () => {
      admissionService.getDemandLines.mockResolvedValue([]);
      const report = await service.getShortages();
      expect(report.total_orders_analyzed).toBe(2);
      expect(orderRepo.find).toHaveBeenCalled();
    });

    it('falls back when the admission tables are missing', async () => {
      // A database that has not run the migration yet must still report.
      admissionService.getDemandLines.mockRejectedValue(
        new Error('relation "mrp_demand_lines" does not exist'),
      );
      const report = await service.getShortages();
      expect(report.total_orders_analyzed).toBe(2);
    });
  });
});
