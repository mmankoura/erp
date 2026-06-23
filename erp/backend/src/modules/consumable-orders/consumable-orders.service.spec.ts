import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConsumableOrdersService } from './consumable-orders.service';
import {
  ConsumableOrder,
  ConsumableOrderLine,
  ConsumableOrderStatus,
} from '../../entities/consumable-order.entity';
import { createMockRepo, MockRepo, createMockDataSource } from '../../test-utils/repo-mock';

const buildOrder = (overrides: Partial<ConsumableOrder> = {}): ConsumableOrder =>
  ({
    id: 'co-1',
    order_number: 'CON-20260427-001',
    supplier: 'Acme',
    status: ConsumableOrderStatus.ORDERED,
    order_date: new Date(),
    expected_date: null,
    currency: 'CAD',
    notes: null,
    created_by: null,
    lines: [],
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  }) as ConsumableOrder;

describe('ConsumableOrdersService', () => {
  let service: ConsumableOrdersService;
  let orderRepo: MockRepo<ConsumableOrder>;
  let lineRepo: MockRepo<ConsumableOrderLine>;

  beforeEach(async () => {
    orderRepo = createMockRepo<ConsumableOrder>();
    lineRepo = createMockRepo<ConsumableOrderLine>();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConsumableOrdersService,
        { provide: getRepositoryToken(ConsumableOrder), useValue: orderRepo },
        { provide: getRepositoryToken(ConsumableOrderLine), useValue: lineRepo },
        { provide: DataSource, useValue: createMockDataSource() },
      ],
    }).compile();
    service = module.get(ConsumableOrdersService);
  });

  it('findOne throws NotFound when missing', async () => {
    (orderRepo.findOne as jest.Mock).mockResolvedValue(null);
    await expect(service.findOne('x')).rejects.toThrow(NotFoundException);
  });

  describe('create', () => {
    it('rejects when no lines provided', async () => {
      await expect(service.create({
        supplier: 'X', order_date: '2026-04-27', lines: [],
      } as any)).rejects.toThrow(BadRequestException);
    });

    it('generates order number with CON-YYYYMMDD-### format', async () => {
      const qb = orderRepo.createQueryBuilder();
      qb.getOne.mockResolvedValue(null); // no existing
      (orderRepo.save as jest.Mock).mockImplementation((o) => Promise.resolve({ ...o, id: 'co-new' }));
      (orderRepo.findOne as jest.Mock).mockResolvedValue(buildOrder({ id: 'co-new' }));

      await service.create({
        supplier: 'X',
        order_date: '2026-04-27',
        lines: [{ description: 'Solder', quantity: 5 }],
      } as any);

      expect(orderRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        order_number: expect.stringMatching(/^CON-\d{8}-001$/),
      }));
    });

    it('generates monotonically increasing sequence', async () => {
      const qb = orderRepo.createQueryBuilder();
      qb.getOne.mockResolvedValue({ order_number: 'CON-20260427-007' });
      (orderRepo.save as jest.Mock).mockImplementation((o) => Promise.resolve({ ...o, id: 'co' }));
      (orderRepo.findOne as jest.Mock).mockResolvedValue(buildOrder());

      await service.create({
        supplier: 'X',
        order_date: '2026-04-27',
        lines: [{ description: 'Solder', quantity: 1 }],
      } as any);

      expect(orderRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        order_number: expect.stringMatching(/-008$/),
      }));
    });

    it('numbers line items starting at 1', async () => {
      const qb = orderRepo.createQueryBuilder();
      qb.getOne.mockResolvedValue(null);
      (orderRepo.save as jest.Mock).mockImplementation((o) => Promise.resolve({ ...o, id: 'co' }));
      (orderRepo.findOne as jest.Mock).mockResolvedValue(buildOrder());

      await service.create({
        supplier: 'X',
        order_date: '2026-04-27',
        lines: [
          { description: 'A', quantity: 1 },
          { description: 'B', quantity: 2 },
          { description: 'C', quantity: 3 },
        ],
      } as any);

      const created: any = (orderRepo.create as jest.Mock).mock.calls[0][0];
      expect(created.lines.map((l: any) => l.line_number)).toEqual([1, 2, 3]);
    });
  });

  describe('markReceived / undoReceive', () => {
    it('markReceived flips ORDERED → RECEIVED', async () => {
      const o = buildOrder();
      (orderRepo.findOne as jest.Mock).mockResolvedValue(o);
      (orderRepo.save as jest.Mock).mockResolvedValue(o);
      await service.markReceived('co-1');
      expect(o.status).toBe(ConsumableOrderStatus.RECEIVED);
    });

    it('markReceived rejects if already received', async () => {
      const o = buildOrder({ status: ConsumableOrderStatus.RECEIVED });
      (orderRepo.findOne as jest.Mock).mockResolvedValue(o);
      await expect(service.markReceived('co-1')).rejects.toThrow(BadRequestException);
    });

    it('undoReceive flips RECEIVED → ORDERED', async () => {
      const o = buildOrder({ status: ConsumableOrderStatus.RECEIVED });
      (orderRepo.findOne as jest.Mock).mockResolvedValue(o);
      (orderRepo.save as jest.Mock).mockResolvedValue(o);
      await service.undoReceive('co-1');
      expect(o.status).toBe(ConsumableOrderStatus.ORDERED);
    });

    it('undoReceive rejects if not received', async () => {
      const o = buildOrder({ status: ConsumableOrderStatus.ORDERED });
      (orderRepo.findOne as jest.Mock).mockResolvedValue(o);
      await expect(service.undoReceive('co-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('delete', () => {
    it('removes the order via repository', async () => {
      const o = buildOrder();
      (orderRepo.findOne as jest.Mock).mockResolvedValue(o);
      await service.delete('co-1');
      expect(orderRepo.remove).toHaveBeenCalledWith(o);
    });
  });
});
