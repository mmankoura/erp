import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { BomService } from './bom.service';
import { BomRevision, BomSource } from '../../entities/bom-revision.entity';
import { BomItem } from '../../entities/bom-item.entity';
import { BomItemAlternate } from '../../entities/bom-item-alternate.entity';
import { Material } from '../../entities/material.entity';
import { Product } from '../../entities/product.entity';
import { Order } from '../../entities/order.entity';
import { AuditService } from '../audit/audit.service';
import { createMockRepo, MockRepo } from '../../test-utils/repo-mock';

const buildRevision = (overrides: Partial<BomRevision> = {}): BomRevision =>
  ({
    id: 'rev-1',
    product_id: 'prd-1',
    revision_number: '1.0',
    revision_date: new Date('2026-04-27'),
    change_summary: null,
    source: BomSource.MANUAL,
    source_filename: null,
    is_active: false,
    is_archived: false,
    created_at: new Date(),
    items: [],
    ...overrides,
  }) as unknown as BomRevision;

const buildItem = (overrides: Partial<BomItem> = {}): BomItem =>
  ({
    id: 'item-1',
    bom_revision_id: 'rev-1',
    material_id: 'mat-1',
    quantity_required: 1,
    polarized: false,
    scrap_factor: 0,
    line_number: 1,
    reference_designators: 'R1',
    notes: null,
    alternate_ipn: null,
    bom_line_key: null,
    resource_type: null,
    material: { internal_part_number: 'IPN-1' } as any,
    alternates: [],
    ...overrides,
  }) as unknown as BomItem;

describe('BomService', () => {
  let service: BomService;
  let revRepo: MockRepo<BomRevision>;
  let itemRepo: MockRepo<BomItem>;
  let altRepo: MockRepo<BomItemAlternate>;
  let materialRepo: MockRepo<Material>;
  let productRepo: MockRepo<Product>;
  let orderRepo: MockRepo<Order>;
  let audit: { emitCreate: jest.Mock; emitDelete: jest.Mock; emitStateChange: jest.Mock };

  beforeEach(async () => {
    revRepo = createMockRepo<BomRevision>();
    itemRepo = createMockRepo<BomItem>();
    altRepo = createMockRepo<BomItemAlternate>();
    materialRepo = createMockRepo<Material>();
    productRepo = createMockRepo<Product>();
    orderRepo = createMockRepo<Order>();
    audit = {
      emitCreate: jest.fn(),
      emitDelete: jest.fn(),
      emitStateChange: jest.fn(),
    };
    const dataSource = { createQueryRunner: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BomService,
        { provide: getRepositoryToken(BomRevision), useValue: revRepo },
        { provide: getRepositoryToken(BomItem), useValue: itemRepo },
        { provide: getRepositoryToken(BomItemAlternate), useValue: altRepo },
        { provide: getRepositoryToken(Material), useValue: materialRepo },
        { provide: getRepositoryToken(Product), useValue: productRepo },
        { provide: getRepositoryToken(Order), useValue: orderRepo },
        { provide: DataSource, useValue: dataSource },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = module.get(BomService);
  });

  describe('findRevision', () => {
    it('throws NotFound when missing', async () => {
      (revRepo.findOne as jest.Mock).mockResolvedValue(null);
      await expect(service.findRevision('x')).rejects.toThrow(NotFoundException);
    });

    it('returns revision with relations', async () => {
      const r = buildRevision();
      (revRepo.findOne as jest.Mock).mockResolvedValue(r);
      const out = await service.findRevision('rev-1');
      expect(out).toBe(r);
      expect(revRepo.findOne).toHaveBeenCalledWith(expect.objectContaining({
        relations: expect.arrayContaining(['product', 'items', 'items.material']),
      }));
    });
  });

  describe('findActiveRevision', () => {
    it('queries by product_id with is_active=true', async () => {
      (revRepo.findOne as jest.Mock).mockResolvedValue(null);
      await service.findActiveRevision('prd-1');
      expect(revRepo.findOne).toHaveBeenCalledWith(expect.objectContaining({
        where: { product_id: 'prd-1', is_active: true },
      }));
    });
  });

  describe('createRevision', () => {
    it('throws NotFound if product missing', async () => {
      (productRepo.findOne as jest.Mock).mockResolvedValue(null);
      await expect(
        service.createRevision({
          product_id: 'missing',
          revision_number: '1.0',
          revision_date: '2026-04-27',
        } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws Conflict if revision number already exists', async () => {
      (productRepo.findOne as jest.Mock).mockResolvedValue({ id: 'prd-1' });
      (revRepo.findOne as jest.Mock).mockResolvedValueOnce(buildRevision());
      await expect(
        service.createRevision({
          product_id: 'prd-1',
          revision_number: '1.0',
          revision_date: '2026-04-27',
        } as any),
      ).rejects.toThrow(ConflictException);
    });

    it('persists, emits audit, and skips activation when is_active is false', async () => {
      (productRepo.findOne as jest.Mock).mockResolvedValue({ id: 'prd-1' });
      (revRepo.findOne as jest.Mock)
        .mockResolvedValueOnce(null)         // duplicate check
        .mockResolvedValue(buildRevision()); // findRevision return
      (revRepo.save as jest.Mock).mockImplementation((r) => Promise.resolve({ ...r, id: 'rev-new' }));

      await service.createRevision({
        product_id: 'prd-1',
        revision_number: '2.0',
        revision_date: '2026-04-27',
        is_active: false,
      } as any);

      expect(audit.emitCreate).toHaveBeenCalledWith(
        'BOM_REVISION_CREATED',
        'bom_revision',
        'rev-new',
        expect.objectContaining({ revision_number: '2.0' }),
        undefined,
        expect.any(Object),
      );
    });
  });

  describe('deleteRevision', () => {
    it('throws Conflict when orders reference this revision', async () => {
      (revRepo.findOne as jest.Mock).mockResolvedValue(buildRevision());
      (orderRepo.count as jest.Mock).mockResolvedValue(2);
      await expect(service.deleteRevision('rev-1')).rejects.toThrow(/2 orders reference/);
    });

    it('clears product.active_bom_revision_id when deleting active revision', async () => {
      const r = buildRevision({ is_active: true });
      (revRepo.findOne as jest.Mock).mockResolvedValue(r);
      (orderRepo.count as jest.Mock).mockResolvedValue(0);
      await service.deleteRevision('rev-1');
      expect(productRepo.update).toHaveBeenCalledWith(
        { id: 'prd-1' },
        { active_bom_revision_id: null },
      );
      expect(revRepo.remove).toHaveBeenCalledWith(r);
      expect(audit.emitDelete).toHaveBeenCalled();
    });

    it('uses singular "1 order" message when one reference exists', async () => {
      (revRepo.findOne as jest.Mock).mockResolvedValue(buildRevision());
      (orderRepo.count as jest.Mock).mockResolvedValue(1);
      await expect(service.deleteRevision('rev-1')).rejects.toThrow(/1 order /);
    });
  });

  describe('activateRevision', () => {
    it('deactivates siblings, sets is_active=true, updates product, audits', async () => {
      const r = buildRevision();
      (revRepo.findOne as jest.Mock).mockResolvedValue(r); // findRevision
      (revRepo.findOne as jest.Mock).mockResolvedValueOnce(r)
        .mockResolvedValueOnce(buildRevision({ id: 'prev-active', revision_number: '0.9' })) // previousActive
        .mockResolvedValue(r); // findRevision return at end
      (revRepo.save as jest.Mock).mockImplementation((x) => Promise.resolve(x));

      await service.activateRevision('rev-1');
      expect(revRepo.update).toHaveBeenCalledWith(
        { product_id: 'prd-1' },
        { is_active: false },
      );
      expect(productRepo.update).toHaveBeenCalledWith(
        { id: 'prd-1' },
        { active_bom_revision_id: 'rev-1' },
      );
      expect(audit.emitStateChange).toHaveBeenCalled();
    });
  });

  describe('archive / unarchive', () => {
    it('archive rejects if revision is active', async () => {
      (revRepo.findOne as jest.Mock).mockResolvedValue(buildRevision({ is_active: true }));
      await expect(service.archiveRevision('rev-1')).rejects.toThrow(BadRequestException);
    });

    it('archive sets is_archived=true and audits the change', async () => {
      const r = buildRevision({ is_active: false });
      (revRepo.findOne as jest.Mock).mockResolvedValue(r);
      (revRepo.save as jest.Mock).mockResolvedValue(r);
      await service.archiveRevision('rev-1');
      expect(r.is_archived).toBe(true);
      expect(audit.emitStateChange).toHaveBeenCalled();
    });

    it('unarchive flips is_archived to false', async () => {
      const r = buildRevision({ is_archived: true });
      (revRepo.findOne as jest.Mock).mockResolvedValue(r);
      (revRepo.save as jest.Mock).mockResolvedValue(r);
      await service.unarchiveRevision('rev-1');
      expect(r.is_archived).toBe(false);
    });
  });

  describe('item methods', () => {
    it('addItem creates and persists with bom_revision_id set', async () => {
      (revRepo.findOne as jest.Mock).mockResolvedValue(buildRevision());
      (itemRepo.save as jest.Mock).mockImplementation((i) => Promise.resolve({ ...i, id: 'item-new' }));
      (itemRepo.findOne as jest.Mock).mockResolvedValue(buildItem({ id: 'item-new' }));

      const out = await service.addItem('rev-1', { material_id: 'mat-1', quantity_required: 2 } as any);
      expect(out.id).toBe('item-new');
      expect(itemRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        material_id: 'mat-1',
        bom_revision_id: 'rev-1',
      }));
    });

    it('updateItem throws NotFound if missing', async () => {
      (itemRepo.findOne as jest.Mock).mockResolvedValue(null);
      await expect(service.updateItem('x', {} as any)).rejects.toThrow(NotFoundException);
    });

    it('removeItem deletes existing item', async () => {
      const item = buildItem();
      (itemRepo.findOne as jest.Mock).mockResolvedValue(item);
      await service.removeItem('item-1');
      expect(itemRepo.remove).toHaveBeenCalledWith(item);
    });
  });

  describe('compareRevisions', () => {
    it('rejects comparison across different products', async () => {
      const r1 = buildRevision({ id: 'r1', product_id: 'p1' });
      const r2 = buildRevision({ id: 'r2', product_id: 'p2' });
      (revRepo.findOne as jest.Mock)
        .mockResolvedValueOnce(r1)
        .mockResolvedValueOnce(r2);
      await expect(service.compareRevisions('r1', 'r2')).rejects.toThrow(BadRequestException);
    });

    it('classifies items as added / removed / changed / unchanged', async () => {
      const itemA = buildItem({ material_id: 'matA', quantity_required: 1, polarized: false });
      const itemB = buildItem({ material_id: 'matB', quantity_required: 2, polarized: false });
      const itemAModified = buildItem({ material_id: 'matA', quantity_required: 5, polarized: true });
      const itemC = buildItem({ material_id: 'matC', quantity_required: 1, polarized: false });

      const r1 = buildRevision({ id: 'r1', items: [itemA, itemB] });
      const r2 = buildRevision({ id: 'r2', items: [itemAModified, itemC] });

      (revRepo.findOne as jest.Mock)
        .mockResolvedValueOnce(r1)
        .mockResolvedValueOnce(r2);

      const diff = await service.compareRevisions('r1', 'r2');
      expect(diff.added.map((i) => i.material_id)).toEqual(['matC']);
      expect(diff.removed.map((i) => i.material_id)).toEqual(['matB']);
      expect(diff.changed.length).toBeGreaterThan(0);
      expect(diff.changed.some((c) => c.field === 'quantity_required')).toBe(true);
      expect(diff.changed.some((c) => c.field === 'polarized')).toBe(true);
    });

    it('counts unchanged items when no field differs', async () => {
      const same1 = buildItem({ material_id: 'mat1', quantity_required: 3, polarized: true, scrap_factor: 1, reference_designators: 'R1', notes: 'x' });
      const same2 = buildItem({ material_id: 'mat1', quantity_required: 3, polarized: true, scrap_factor: 1, reference_designators: 'R1', notes: 'x' });
      const r1 = buildRevision({ id: 'r1', items: [same1] });
      const r2 = buildRevision({ id: 'r2', items: [same2] });
      (revRepo.findOne as jest.Mock)
        .mockResolvedValueOnce(r1)
        .mockResolvedValueOnce(r2);
      const diff = await service.compareRevisions('r1', 'r2');
      expect(diff.unchanged).toBe(1);
      expect(diff.changed).toHaveLength(0);
    });
  });

  describe('alternate methods', () => {
    it('addAlternate rejects if BOM item missing', async () => {
      (itemRepo.findOne as jest.Mock).mockResolvedValue(null);
      await expect(service.addAlternate('item-1', 'IPN-X')).rejects.toThrow(NotFoundException);
    });

    it('addAlternate rejects if material lookup fails', async () => {
      (itemRepo.findOne as jest.Mock).mockResolvedValue(buildItem());
      (materialRepo.findOne as jest.Mock).mockResolvedValue(null);
      await expect(service.addAlternate('item-1', 'IPN-X')).rejects.toThrow(BadRequestException);
    });

    it('addAlternate rejects when adding the primary material as alternate', async () => {
      (itemRepo.findOne as jest.Mock).mockResolvedValue(buildItem({ material_id: 'mat-1' }));
      (materialRepo.findOne as jest.Mock).mockResolvedValue({ id: 'mat-1' });
      await expect(service.addAlternate('item-1', 'IPN-1')).rejects.toThrow(/primary material/);
    });

    it('addAlternate rejects duplicate alternate', async () => {
      (itemRepo.findOne as jest.Mock).mockResolvedValue(buildItem({ material_id: 'mat-1' }));
      (materialRepo.findOne as jest.Mock).mockResolvedValue({ id: 'mat-2' });
      (altRepo.findOne as jest.Mock).mockResolvedValue({ id: 'alt-existing' });
      await expect(service.addAlternate('item-1', 'IPN-2')).rejects.toThrow(ConflictException);
    });

    it('addAlternate computes the next priority', async () => {
      (itemRepo.findOne as jest.Mock).mockResolvedValue(buildItem({ material_id: 'mat-1' }));
      (materialRepo.findOne as jest.Mock).mockResolvedValue({ id: 'mat-2' });
      (altRepo.findOne as jest.Mock)
        .mockResolvedValueOnce(null) // duplicate check
        .mockResolvedValueOnce({ id: 'alt-new' }); // final lookup
      const qb = altRepo.createQueryBuilder();
      qb.getRawOne.mockResolvedValue({ max: 3 });
      (altRepo.save as jest.Mock).mockImplementation((a) => Promise.resolve({ ...a, id: 'alt-new' }));

      await service.addAlternate('item-1', 'IPN-2');
      expect(altRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        priority: 4,
      }));
    });

    it('removeAlternate throws NotFound when missing', async () => {
      (altRepo.findOne as jest.Mock).mockResolvedValue(null);
      await expect(service.removeAlternate('alt-x')).rejects.toThrow(NotFoundException);
    });
  });
});
