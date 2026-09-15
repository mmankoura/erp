import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { MrpAdmissionService } from './mrp-admission.service';
import { MrpRun, MrpRunStatus } from '../../entities/mrp-run.entity';
import {
  MrpDemandLine,
  MrpDemandSource,
} from '../../entities/mrp-demand-line.entity';
import { Order, OrderStatus } from '../../entities/order.entity';
import { Product } from '../../entities/product.entity';
import { BomRevision } from '../../entities/bom-revision.entity';
import { createMockRepo, MockRepo } from '../../test-utils/repo-mock';

const ACTIVE_RUN = { id: 'run-1', status: MrpRunStatus.ACTIVE } as MrpRun;

const ORDER = {
  id: 'ord-1',
  order_number: 'OR-0001',
  quantity: 40,
  product_id: 'prod-1',
  due_date: new Date('2026-09-01'),
  status: OrderStatus.ENTERED,
  product: { id: 'prod-1', part_number: 'ATS9350', name: 'Widget' },
  customer: { name: 'Acme' },
} as unknown as Order;

describe('MrpAdmissionService', () => {
  let service: MrpAdmissionService;
  let runRepo: MockRepo;
  let lineRepo: MockRepo;
  let orderRepo: MockRepo;
  let productRepo: MockRepo;
  let revisionRepo: MockRepo;

  beforeEach(async () => {
    runRepo = createMockRepo();
    lineRepo = createMockRepo();
    orderRepo = createMockRepo();
    productRepo = createMockRepo();
    revisionRepo = createMockRepo();

    runRepo.findOne.mockResolvedValue(ACTIVE_RUN);
    lineRepo.findOne.mockResolvedValue(null);
    lineRepo.find.mockResolvedValue([]);
    orderRepo.findOne.mockResolvedValue(ORDER);
    orderRepo.find.mockResolvedValue([ORDER]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MrpAdmissionService,
        { provide: getRepositoryToken(MrpRun), useValue: runRepo },
        { provide: getRepositoryToken(MrpDemandLine), useValue: lineRepo },
        { provide: getRepositoryToken(Order), useValue: orderRepo },
        { provide: getRepositoryToken(Product), useValue: productRepo },
        { provide: getRepositoryToken(BomRevision), useValue: revisionRepo },
      ],
    }).compile();

    service = module.get(MrpAdmissionService);
  });

  describe('getActiveRun', () => {
    it('creates the run on first use so a fresh database still works', async () => {
      runRepo.findOne.mockResolvedValue(null);
      const run = await service.getActiveRun();
      expect(runRepo.save).toHaveBeenCalled();
      expect(run.status).toBe(MrpRunStatus.ACTIVE);
    });
  });

  describe('admitOrder', () => {
    it('defaults quantity and due date from the order', async () => {
      const line = await service.admitOrder({ order_id: 'ord-1' }, 'mark');
      expect(line.quantity).toBe(40);
      expect(line.due_date).toEqual(ORDER.due_date);
      expect(line.source).toBe(MrpDemandSource.ORDER);
      expect(line.label).toBe('ATS9350');
    });

    it('lets the buyer plan to a different quantity than the order', async () => {
      const line = await service.admitOrder(
        { order_id: 'ord-1', quantity: 55 },
        'mark',
      );
      // The order is still for 40; MRP will plan for 55.
      expect(line.quantity).toBe(55);
    });

    it('leaves bom_revision_id null so the line follows its order', async () => {
      const line = await service.admitOrder({ order_id: 'ord-1' }, 'mark');
      // Re-BOMing the order must not require touching this row.
      expect(line.bom_revision_id).toBeNull();
    });

    it('refuses to admit the same order twice', async () => {
      lineRepo.findOne.mockResolvedValue({ id: 'existing' });
      await expect(
        service.admitOrder({ order_id: 'ord-1' }, 'mark'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects an unknown order', async () => {
      orderRepo.findOne.mockResolvedValue(null);
      await expect(
        service.admitOrder({ order_id: 'nope' }, 'mark'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('createScratchJob', () => {
    beforeEach(() => {
      productRepo.findOne.mockResolvedValue({
        id: 'prod-1',
        part_number: 'ATS9350',
      });
      revisionRepo.findOne.mockResolvedValue({
        id: 'rev-1',
        product_id: 'prod-1',
      });
    });

    it('creates demand without creating an order', async () => {
      const line = await service.createScratchJob(
        { product_id: 'prod-1', bom_revision_id: 'rev-1', quantity: 100 },
        'mark',
      );
      expect(line.source).toBe(MrpDemandSource.SCRATCH);
      expect(line.order_id).toBeNull();
      expect(line.bom_revision_id).toBe('rev-1');
      // Nothing may be written to the orders table for a what-if.
      expect(orderRepo.save).not.toHaveBeenCalled();
    });

    it('rejects a BOM revision belonging to another product', async () => {
      revisionRepo.findOne.mockResolvedValue({
        id: 'rev-9',
        product_id: 'other-product',
      });
      await expect(
        service.createScratchJob(
          { product_id: 'prod-1', bom_revision_id: 'rev-9', quantity: 10 },
          'mark',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an unknown BOM revision', async () => {
      revisionRepo.findOne.mockResolvedValue(null);
      await expect(
        service.createScratchJob(
          { product_id: 'prod-1', bom_revision_id: 'nope', quantity: 10 },
          'mark',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getAdmittableOrders', () => {
    it('flags orders already in the run rather than hiding them', async () => {
      lineRepo.find.mockResolvedValue([{ order_id: 'ord-1' }]);
      const [row] = await service.getAdmittableOrders();
      expect(row.order_number).toBe('OR-0001');
      expect(row.is_admitted).toBe(true);
    });

    it('offers orders that are not yet in the run', async () => {
      lineRepo.find.mockResolvedValue([]);
      const [row] = await service.getAdmittableOrders();
      expect(row.is_admitted).toBe(false);
    });
  });

  describe('updateDemandLine', () => {
    it('parks a job without deleting it', async () => {
      lineRepo.findOne.mockResolvedValue({
        id: 'line-1',
        include_in_totals: true,
      });
      const line = await service.updateDemandLine('line-1', {
        include_in_totals: false,
      });
      // Parking must keep the row, so its notes and alternates survive.
      expect(line.include_in_totals).toBe(false);
      expect(lineRepo.remove).not.toHaveBeenCalled();
    });

    it('clears priority when explicitly set to null', async () => {
      lineRepo.findOne.mockResolvedValue({ id: 'line-1', priority: 3 });
      const line = await service.updateDemandLine('line-1', {
        priority: null,
      });
      expect(line.priority).toBeNull();
    });

    it('rejects an unknown line', async () => {
      lineRepo.findOne.mockResolvedValue(null);
      await expect(
        service.updateDemandLine('nope', { quantity: 5 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
