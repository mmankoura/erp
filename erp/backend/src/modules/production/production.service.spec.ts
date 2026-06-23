import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProductionService } from './production.service';
import { Order } from '../../entities/order.entity';
import { ProductionLog, ProductionStage } from '../../entities/production-log.entity';
import { BomItem } from '../../entities/bom-item.entity';
import { InventoryTransaction } from '../../entities/inventory-transaction.entity';
import { InventoryAllocation } from '../../entities/inventory-allocation.entity';
import { OrderMaterialSource } from '../../entities/order-material-source.entity';
import { AuditService } from '../audit/audit.service';
import { createMockRepo, MockRepo, createMockDataSource } from '../../test-utils/repo-mock';

describe('ProductionService', () => {
  let service: ProductionService;
  let orderRepo: MockRepo<Order>;

  beforeEach(async () => {
    orderRepo = createMockRepo<Order>();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductionService,
        { provide: getRepositoryToken(Order), useValue: orderRepo },
        { provide: getRepositoryToken(ProductionLog), useValue: createMockRepo() },
        { provide: getRepositoryToken(BomItem), useValue: createMockRepo() },
        { provide: getRepositoryToken(InventoryTransaction), useValue: createMockRepo() },
        { provide: getRepositoryToken(InventoryAllocation), useValue: createMockRepo() },
        { provide: getRepositoryToken(OrderMaterialSource), useValue: createMockRepo() },
        { provide: DataSource, useValue: createMockDataSource() },
        { provide: AuditService, useValue: { emit: jest.fn() } },
      ],
    }).compile();
    service = module.get(ProductionService);
  });

  describe('startProduction', () => {
    it('throws NotFound when order missing', async () => {
      (orderRepo.findOne as jest.Mock).mockResolvedValue(null);
      await expect(service.startProduction('x')).rejects.toThrow(NotFoundException);
    });

    it('throws when no units are available to start', async () => {
      (orderRepo.findOne as jest.Mock).mockResolvedValue({
        id: 'o1', quantity: 10, quantity_in_kitting: 5,
        quantity_in_smt: 3, quantity_in_th: 2, quantity_completed: 0, quantity_shipped: 0,
      });
      await expect(service.startProduction('o1')).rejects.toThrow(BadRequestException);
    });

    it('rejects requests for more units than available', async () => {
      const order: any = {
        id: 'o1', quantity: 10, quantity_in_kitting: 0,
        quantity_in_smt: 0, quantity_in_th: 0, quantity_completed: 0, quantity_shipped: 0,
      };
      (orderRepo.findOne as jest.Mock).mockResolvedValue(order);
      // moveUnits is internal; we expect the "Cannot start..." failure path instead
      await expect(service.startProduction('o1', 100)).rejects.toThrow(/Cannot start 100/);
    });
  });

  describe('valid stage transitions', () => {
    // The stage transition map is private but accessible via type-cast.
    it('NOT_STARTED → KITTING is valid', () => {
      const map = (service as any).validTransitions;
      expect(map[ProductionStage.NOT_STARTED]).toContain(ProductionStage.KITTING);
    });

    it('KITTING → SMT/TH/COMPLETED are valid', () => {
      const map = (service as any).validTransitions;
      expect(map[ProductionStage.KITTING]).toEqual(
        expect.arrayContaining([ProductionStage.SMT, ProductionStage.TH, ProductionStage.COMPLETED]),
      );
    });

    it('SMT → only TH and COMPLETED', () => {
      const map = (service as any).validTransitions;
      expect(map[ProductionStage.SMT]).toEqual(
        expect.arrayContaining([ProductionStage.TH, ProductionStage.COMPLETED]),
      );
      expect(map[ProductionStage.SMT]).not.toContain(ProductionStage.KITTING);
    });

    it('SHIPPED is terminal', () => {
      const map = (service as any).validTransitions;
      expect(map[ProductionStage.SHIPPED]).toEqual([]);
    });
  });
});
