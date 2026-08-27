import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { In } from 'typeorm';
import { MaterialsService } from './materials.service';
import { Material } from '../../entities/material.entity';
import { ResourceType } from '../../entities/bom-item.entity';
import { BomItem } from '../../entities/bom-item.entity';
import { BomRevision } from '../../entities/bom-revision.entity';
import { Order, OrderStatus } from '../../entities/order.entity';
import { AuditService } from '../audit/audit.service';
import { createMockRepo, MockRepo } from '../../test-utils/repo-mock';

const buildMaterial = (overrides: Partial<Material> = {}): Material =>
  ({
    id: 'mat-1',
    internal_part_number: 'IPN-1',
    description: null,
    value: null,
    package: null,
    manufacturer: null,
    manufacturer_pn: null,
    category: null,
    uom: 'EA',
    resource_type: null,
    customer_id: null,
    customer: null,
    costing_method: 'WEIGHTED_AVG',
    standard_cost: null,
    created_at: new Date(),
    updated_at: new Date(),
    deleted_at: null,
    ...overrides,
  }) as unknown as Material;

describe('MaterialsService', () => {
  let service: MaterialsService;
  let materialRepo: MockRepo<Material>;
  let bomItemRepo: MockRepo<BomItem>;
  let bomRevisionRepo: MockRepo<BomRevision>;
  let orderRepo: MockRepo<Order>;

  beforeEach(async () => {
    materialRepo = createMockRepo<Material>();
    bomItemRepo = createMockRepo<BomItem>();
    bomRevisionRepo = createMockRepo<BomRevision>();
    orderRepo = createMockRepo<Order>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaterialsService,
        { provide: getRepositoryToken(Material), useValue: materialRepo },
        { provide: getRepositoryToken(BomItem), useValue: bomItemRepo },
        { provide: getRepositoryToken(BomRevision), useValue: bomRevisionRepo },
        { provide: getRepositoryToken(Order), useValue: orderRepo },
        {
          provide: AuditService,
          useValue: { emitDelete: jest.fn(), emitStateChange: jest.fn() },
        },
      ],
    }).compile();
    service = module.get(MaterialsService);
  });

  it('findAll orders by internal_part_number ASC and includes customer relation', async () => {
    (materialRepo.find as jest.Mock).mockResolvedValue([]);
    await service.findAll();
    expect(materialRepo.find).toHaveBeenCalledWith({
      relations: ['customer'],
      order: { internal_part_number: 'ASC' },
    });
  });

  it('findOne throws NotFound if missing', async () => {
    (materialRepo.findOne as jest.Mock).mockResolvedValue(null);
    await expect(service.findOne('x')).rejects.toThrow(NotFoundException);
  });

  it('findByPartNumber resolves null when missing', async () => {
    (materialRepo.findOne as jest.Mock).mockResolvedValue(null);
    const out = await service.findByPartNumber('NOPE');
    expect(out).toBeNull();
  });

  describe('create', () => {
    it('rejects on duplicate IPN', async () => {
      (materialRepo.findOne as jest.Mock).mockResolvedValue(buildMaterial());
      await expect(service.create({ internal_part_number: 'IPN-1' } as any))
        .rejects.toThrow(ConflictException);
    });

    it('persists when IPN is new', async () => {
      (materialRepo.findOne as jest.Mock).mockResolvedValue(null);
      (materialRepo.save as jest.Mock).mockImplementation((m) => Promise.resolve({ ...m, id: 'new' }));
      const out = await service.create({ internal_part_number: 'IPN-NEW' } as any);
      expect(out.id).toBe('new');
    });
  });

  describe('bulkCreate', () => {
    it('rejects when input contains duplicate IPNs', async () => {
      await expect(
        service.bulkCreate({
          materials: [
            { internal_part_number: 'A' } as any,
            { internal_part_number: 'A' } as any,
          ],
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('skips already-existing IPNs into errors and saves the rest', async () => {
      (materialRepo.find as jest.Mock).mockResolvedValue([
        buildMaterial({ internal_part_number: 'A' }),
      ]);
      (materialRepo.save as jest.Mock).mockImplementation((m) => Promise.resolve({ ...m, id: 'gen' }));

      const out = await service.bulkCreate({
        materials: [
          { internal_part_number: 'A' } as any,
          { internal_part_number: 'B' } as any,
        ],
      });
      expect(out.errors).toHaveLength(1);
      expect(out.errors[0].partNumber).toBe('A');
      expect(out.created).toHaveLength(1);
    });
  });

  describe('update', () => {
    it('throws Conflict when IPN changes to one that exists', async () => {
      const existing = buildMaterial({ internal_part_number: 'OLD' });
      (materialRepo.findOne as jest.Mock)
        .mockResolvedValueOnce(existing) // findOne(id)
        .mockResolvedValueOnce(buildMaterial({ id: 'other', internal_part_number: 'TAKEN' })); // findByPartNumber
      await expect(service.update('mat-1', { internal_part_number: 'TAKEN' } as any))
        .rejects.toThrow(ConflictException);
    });

    it('updates fields when IPN is unchanged', async () => {
      const m = buildMaterial({ description: 'Old' });
      (materialRepo.findOne as jest.Mock).mockResolvedValue(m);
      (materialRepo.save as jest.Mock).mockImplementation((x) => Promise.resolve(x));
      const out = await service.update('mat-1', { description: 'New' } as any);
      expect(out.description).toBe('New');
    });
  });

  describe('filterMaterials', () => {
    it('returns findAll() when filters list is empty', async () => {
      (materialRepo.find as jest.Mock).mockResolvedValue([]);
      await service.filterMaterials({ filters: [] } as any);
      expect(materialRepo.find).toHaveBeenCalledWith({
        relations: ['customer'],
        order: { internal_part_number: 'ASC' },
      });
    });

    it('returns findAll() when no IDs accumulated', async () => {
      (materialRepo.find as jest.Mock).mockResolvedValue([]);
      // filter with empty ids list -> skipped, no sets accumulated
      await service.filterMaterials({
        filters: [{ type: 'product_revision', ids: [] }],
      } as any);
      expect(materialRepo.find).toHaveBeenCalled();
    });

    it('OR-combines product_revision and order filters', async () => {
      (bomItemRepo.find as jest.Mock).mockResolvedValueOnce([
        { material_id: 'm1' }, { material_id: 'm2' },
      ]);
      (orderRepo.find as jest.Mock).mockResolvedValue([
        { bom_revision_id: 'r9' },
      ]);
      (bomItemRepo.find as jest.Mock).mockResolvedValueOnce([
        { material_id: 'm2' }, { material_id: 'm3' },
      ]);
      (materialRepo.find as jest.Mock).mockResolvedValue([
        buildMaterial({ id: 'm1' }),
        buildMaterial({ id: 'm2' }),
        buildMaterial({ id: 'm3' }),
      ]);

      const out = await service.filterMaterials({
        logic: 'OR',
        filters: [
          { type: 'product_revision', ids: ['r1'] },
          { type: 'order', ids: ['o1'] },
        ],
      } as any);
      // The final query should include m1, m2, m3 in the In() set
      const finalCall = (materialRepo.find as jest.Mock).mock.calls.at(-1)![0];
      const idSet: any = finalCall.where.id;
      // TypeORM In() returns an object — its .value property holds the array
      const ids = idSet.value ?? idSet._value ?? [];
      expect([...ids].sort()).toEqual(['m1', 'm2', 'm3']);
      expect(out).toHaveLength(3);
    });

    it('AND-combines filters by intersecting the ID sets', async () => {
      (bomItemRepo.find as jest.Mock)
        .mockResolvedValueOnce([{ material_id: 'm1' }, { material_id: 'm2' }])
        .mockResolvedValueOnce([{ material_id: 'm2' }, { material_id: 'm3' }]);
      (orderRepo.find as jest.Mock).mockResolvedValue([
        { bom_revision_id: 'r9' },
      ]);
      (materialRepo.find as jest.Mock).mockResolvedValue([
        buildMaterial({ id: 'm2' }),
      ]);
      const out = await service.filterMaterials({
        logic: 'AND',
        filters: [
          { type: 'product_revision', ids: ['r1'] },
          { type: 'order', ids: ['o1'] },
        ],
      } as any);
      expect(out).toHaveLength(1);
      expect(out[0].id).toBe('m2');
    });
  });

  describe('where-used analysis', () => {
    it('getWhereUsedProducts converts string numerics to floats', async () => {
      (materialRepo.findOne as jest.Mock).mockResolvedValue(buildMaterial());
      const qb = bomItemRepo.createQueryBuilder();
      qb.getRawMany.mockResolvedValue([
        {
          product_id: 'p1',
          product_name: 'P',
          product_part_number: 'PN-P',
          bom_revision_id: 'r1',
          revision_number: '1',
          is_active_revision: true,
          quantity_per_unit: '2.5',
          resource_type: 'SMD',
        },
      ]);
      const out = await service.getWhereUsedProducts('mat-1');
      expect(out[0].quantity_per_unit).toBe(2.5);
    });

    it('getWhereUsedOrders multiplies order qty by qty_per_unit', async () => {
      (materialRepo.findOne as jest.Mock).mockResolvedValue(buildMaterial());
      const qb = orderRepo.createQueryBuilder();
      qb.getRawMany.mockResolvedValue([
        {
          order_id: 'o1',
          order_number: 'ORD-1',
          customer_name: 'Cust',
          product_name: 'P',
          order_quantity: '10',
          qty_per_unit: '3.5',
          status: OrderStatus.ENTERED,
          due_date: new Date('2026-05-01'),
        },
      ]);
      const out = await service.getWhereUsedOrders('mat-1');
      expect(out[0].total_required).toBe(35);
    });

    it('getUsageSummary parses raw counts safely', async () => {
      (materialRepo.findOne as jest.Mock).mockResolvedValue(buildMaterial());
      const qbItems = bomItemRepo.createQueryBuilder();
      qbItems.getRawOne
        .mockResolvedValueOnce({ count: '4' })
        .mockResolvedValueOnce({ count: '5' });
      const qbOrders = orderRepo.createQueryBuilder();
      qbOrders.getRawOne.mockResolvedValueOnce({ order_count: '2', total_qty: '50.0' });

      const out = await service.getUsageSummary('mat-1');
      expect(out).toEqual({
        total_products: 4,
        active_bom_count: 5,
        open_orders_count: 2,
        total_qty_required_by_open_orders: 50,
      });
    });

    it('getUsageSummary handles null raw rows', async () => {
      (materialRepo.findOne as jest.Mock).mockResolvedValue(buildMaterial());
      const qbItems = bomItemRepo.createQueryBuilder();
      qbItems.getRawOne.mockResolvedValue(null);
      const qbOrders = orderRepo.createQueryBuilder();
      qbOrders.getRawOne.mockResolvedValue(null);
      const out = await service.getUsageSummary('mat-1');
      expect(out.total_products).toBe(0);
      expect(out.total_qty_required_by_open_orders).toBe(0);
    });
  });

  describe('resolveByPartNumbers', () => {
    const material = (overrides: Partial<Material> = {}) =>
      ({
        id: 'mat-1',
        internal_part_number: 'OR1015',
        description: 'Resistor',
        manufacturer: 'Vishay',
        manufacturer_pn: 'CRCW040',
        resource_type: null,
        customer_id: null,
        ...overrides,
      }) as Material;

    it('short-circuits on an empty list without touching the database', async () => {
      const out = await service.resolveByPartNumbers([]);
      expect(out).toEqual({ matched: [], case_mismatch: [], missing: [] });
      expect(materialRepo.find).not.toHaveBeenCalled();
    });

    it('ignores blanks and duplicates in the input', async () => {
      (materialRepo.find as jest.Mock).mockResolvedValue([material()]);
      const out = await service.resolveByPartNumbers([
        'OR1015', ' OR1015 ', '', '   ',
      ]);
      expect(out.matched).toHaveLength(1);
      expect(materialRepo.find).toHaveBeenCalledWith({
        where: { internal_part_number: In(['OR1015']) },
      });
    });

    it('returns exact hits with the fields an import needs', async () => {
      (materialRepo.find as jest.Mock).mockResolvedValue([material()]);
      const out = await service.resolveByPartNumbers(['OR1015']);
      expect(out.matched[0]).toEqual({
        part_number: 'OR1015',
        material_id: 'mat-1',
        internal_part_number: 'OR1015',
        description: 'Resistor',
        manufacturer: 'Vishay',
        manufacturer_pn: 'CRCW040',
        resource_type: null,
        customer_id: null,
      });
      expect(out.missing).toEqual([]);
    });

    it('offers a case mismatch as a suggestion rather than resolving it', async () => {
      (materialRepo.find as jest.Mock).mockResolvedValue([]);
      const qb = materialRepo.createQueryBuilder();
      qb.getMany.mockResolvedValue([material()]);

      const out = await service.resolveByPartNumbers(['or1015']);

      expect(out.matched).toEqual([]);
      // Carries the same master fields as a match: a caller that accepts the
      // suggestion has to reason about them exactly as it would for an exact hit.
      expect(out.case_mismatch).toEqual([
        {
          part_number: 'or1015',
          suggested: 'OR1015',
          material_id: 'mat-1',
          description: 'Resistor',
          manufacturer: 'Vishay',
          manufacturer_pn: 'CRCW040',
          resource_type: null,
        },
      ]);
      expect(out.missing).toEqual([]);
    });

    it('reports unknown part numbers as missing', async () => {
      (materialRepo.find as jest.Mock).mockResolvedValue([]);
      const qb = materialRepo.createQueryBuilder();
      qb.getMany.mockResolvedValue([]);

      const out = await service.resolveByPartNumbers(['NOPE-1']);
      expect(out.missing).toEqual(['NOPE-1']);
    });

    it('skips the case-insensitive pass when everything matched exactly', async () => {
      (materialRepo.find as jest.Mock).mockResolvedValue([material()]);
      const qb = materialRepo.createQueryBuilder();
      qb.getMany.mockResolvedValue([]);

      await service.resolveByPartNumbers(['OR1015']);
      expect(qb.getMany).not.toHaveBeenCalled();
    });

    it('partitions a mixed batch', async () => {
      (materialRepo.find as jest.Mock).mockResolvedValue([material()]);
      const qb = materialRepo.createQueryBuilder();
      qb.getMany.mockResolvedValue([
        material({ id: 'mat-2', internal_part_number: 'OR2486' }),
      ]);

      const out = await service.resolveByPartNumbers([
        'OR1015', 'or2486', 'Do Not Populate',
      ]);

      expect(out.matched.map((m) => m.part_number)).toEqual(['OR1015']);
      expect(out.case_mismatch.map((m) => m.part_number)).toEqual(['or2486']);
      expect(out.missing).toEqual(['Do Not Populate']);
    });
  });

  describe('bulkUpdate', () => {
    const audit = () =>
      (service as unknown as { auditService: { emitStateChange: jest.Mock } })
        .auditService.emitStateChange;

    const arrange = (materials: Material[]) => {
      (materialRepo.find as jest.Mock).mockResolvedValue(materials);
      (materialRepo.save as jest.Mock).mockImplementation(async (m: Material) => m);
    };

    it('sets only the fields it was given, leaving the rest of the material alone', async () => {
      const existing = buildMaterial({ id: 'm1', description: 'Kept', uom: 'EA' });
      arrange([existing]);

      const out = await service.bulkUpdate({
        materials: [{ id: 'm1', manufacturer: 'Yageo' }],
      });

      expect(out.updated).toHaveLength(1);
      expect(out.updated[0].manufacturer).toBe('Yageo');
      expect(out.updated[0].description).toBe('Kept');
      expect(out.updated[0].uom).toBe('EA');
    });

    it('fills a blank resource type', async () => {
      // buildMaterial already defaults resource_type to null.
      arrange([buildMaterial({ id: 'm1' })]);
      const out = await service.bulkUpdate({
        materials: [{ id: 'm1', resource_type: ResourceType.SMT }],
      });
      expect(out.updated[0].resource_type).toBe('SMT');
    });

    it('never writes an empty or whitespace value over one that exists', async () => {
      arrange([buildMaterial({ id: 'm1', description: 'Real' })]);
      const out = await service.bulkUpdate({
        materials: [{ id: 'm1', description: '   ' }],
      });
      expect(out.unchanged).toEqual(['m1']);
      expect(materialRepo.save).not.toHaveBeenCalled();
    });

    it('treats a value equal to the current one as unchanged, without saving', async () => {
      arrange([buildMaterial({ id: 'm1', description: 'Same' })]);
      const out = await service.bulkUpdate({
        materials: [{ id: 'm1', description: 'Same' }],
      });
      expect(out.unchanged).toEqual(['m1']);
      expect(out.updated).toEqual([]);
      expect(materialRepo.save).not.toHaveBeenCalled();
      expect(audit()).not.toHaveBeenCalled();
    });

    it('reports an unknown id and still saves the rest', async () => {
      arrange([buildMaterial({ id: 'm1' })]);
      const out = await service.bulkUpdate({
        materials: [
          { id: 'm1', manufacturer: 'Yageo' },
          { id: 'gone', manufacturer: 'Murata' },
        ],
      });
      expect(out.updated).toHaveLength(1);
      expect(out.errors).toEqual([{ id: 'gone', error: 'Material not found' }]);
    });

    it('does not let one failed save abort the batch', async () => {
      (materialRepo.find as jest.Mock).mockResolvedValue([
        buildMaterial({ id: 'm1' }),
        buildMaterial({ id: 'm2' }),
      ]);
      (materialRepo.save as jest.Mock)
        .mockRejectedValueOnce(new Error('deadlock'))
        .mockImplementation(async (m: Material) => m);

      const out = await service.bulkUpdate({
        materials: [
          { id: 'm1', manufacturer: 'Yageo' },
          { id: 'm2', manufacturer: 'Murata' },
        ],
      });

      expect(out.errors).toEqual([{ id: 'm1', error: 'deadlock' }]);
      expect(out.updated.map((m) => m.id)).toEqual(['m2']);
    });

    it('applies a repeated id once and reports the repeat', async () => {
      arrange([buildMaterial({ id: 'm1' })]);
      const out = await service.bulkUpdate({
        materials: [
          { id: 'm1', manufacturer: 'First' },
          { id: 'm1', manufacturer: 'Second' },
        ],
      });
      expect(out.updated[0].manufacturer).toBe('First');
      expect(out.errors).toEqual([{ id: 'm1', error: 'Repeated in this request' }]);
    });

    it('audits each change with before and after limited to what moved', async () => {
      arrange([buildMaterial({ id: 'm1', description: 'Old', manufacturer: 'Keep' })]);

      await service.bulkUpdate(
        { materials: [{ id: 'm1', description: 'New', manufacturer: 'Keep' }] },
        'mark',
      );

      expect(audit()).toHaveBeenCalledTimes(1);
      const [, , entityId, before, after, actor] = audit().mock.calls[0];
      expect(entityId).toBe('m1');
      // `manufacturer` was equal, so it is in neither side.
      expect(before).toEqual({ description: 'Old' });
      expect(after).toEqual({ description: 'New' });
      expect(actor).toBe('mark');
    });

    it('records a filled blank as a move from null', async () => {
      // description defaults to null, which is the blank this is about.
      arrange([buildMaterial({ id: 'm1' })]);
      await service.bulkUpdate({ materials: [{ id: 'm1', description: 'Now set' }] });
      const [, , , before, after] = audit().mock.calls[0];
      expect(before).toEqual({ description: null });
      expect(after).toEqual({ description: 'Now set' });
    });
  });

});
