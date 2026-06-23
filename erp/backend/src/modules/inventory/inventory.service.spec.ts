import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import {
  InventoryTransaction,
  OwnerType,
} from '../../entities/inventory-transaction.entity';
import { InventoryAllocation } from '../../entities/inventory-allocation.entity';
import { Material } from '../../entities/material.entity';
import { Order } from '../../entities/order.entity';
import { BomItem } from '../../entities/bom-item.entity';
import { AuditService } from '../audit/audit.service';
import { PurchaseOrdersService } from '../purchase-orders/purchase-orders.service';
import { createMockRepo, MockRepo, createMockDataSource } from '../../test-utils/repo-mock';

describe('InventoryService', () => {
  let service: InventoryService;
  let trxRepo: MockRepo<InventoryTransaction>;
  let allocRepo: MockRepo<InventoryAllocation>;
  let materialRepo: MockRepo<Material>;
  let orderRepo: MockRepo<Order>;
  let bomItemRepo: MockRepo<BomItem>;
  let purchaseOrdersService: { getQuantitiesOnOrder: jest.Mock; getQuantityOnOrder: jest.Mock };

  beforeEach(async () => {
    trxRepo = createMockRepo<InventoryTransaction>();
    allocRepo = createMockRepo<InventoryAllocation>();
    materialRepo = createMockRepo<Material>();
    orderRepo = createMockRepo<Order>();
    bomItemRepo = createMockRepo<BomItem>();
    purchaseOrdersService = {
      getQuantitiesOnOrder: jest.fn().mockResolvedValue(new Map()),
      getQuantityOnOrder: jest.fn().mockResolvedValue(0),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: getRepositoryToken(InventoryTransaction), useValue: trxRepo },
        { provide: getRepositoryToken(InventoryAllocation), useValue: allocRepo },
        { provide: getRepositoryToken(Material), useValue: materialRepo },
        { provide: getRepositoryToken(Order), useValue: orderRepo },
        { provide: getRepositoryToken(BomItem), useValue: bomItemRepo },
        { provide: DataSource, useValue: createMockDataSource() },
        { provide: AuditService, useValue: { emit: jest.fn(), emitCreate: jest.fn(), emitDelete: jest.fn(), emitStateChange: jest.fn() } },
        { provide: PurchaseOrdersService, useValue: purchaseOrdersService },
      ],
    }).compile();
    service = module.get(InventoryService);
  });

  describe('getQuantityOnHand', () => {
    it('returns 0 when there are no transactions', async () => {
      const qb = trxRepo.createQueryBuilder();
      qb.getRawOne.mockResolvedValue(null);
      const out = await service.getQuantityOnHand('mat-1');
      expect(out).toBe(0);
    });

    it('parses string sum from raw aggregate', async () => {
      const qb = trxRepo.createQueryBuilder();
      qb.getRawOne.mockResolvedValue({ quantity_on_hand: '42.5' });
      const out = await service.getQuantityOnHand('mat-1');
      expect(out).toBe(42.5);
    });
  });

  describe('getAllocatedQuantity', () => {
    it('only sums ACTIVE allocations', async () => {
      const qb = allocRepo.createQueryBuilder();
      qb.getRawOne.mockResolvedValue({ quantity_allocated: '7' });
      const out = await service.getAllocatedQuantity('mat-1');
      expect(out).toBe(7);
      expect(qb.andWhere).toHaveBeenCalledWith(
        'a.status = :status',
        { status: 'ACTIVE' },
      );
    });
  });

  describe('getAvailableQuantity', () => {
    it('subtracts allocated from on-hand', async () => {
      jest.spyOn(service, 'getQuantityOnHand').mockResolvedValue(100);
      jest.spyOn(service, 'getAllocatedQuantity').mockResolvedValue(30);
      expect(await service.getAvailableQuantity('mat-1')).toBe(70);
    });
  });

  describe('getStockByMaterialIds', () => {
    it('returns empty map for empty input', async () => {
      const out = await service.getStockByMaterialIds([]);
      expect(out.size).toBe(0);
    });

    it('aggregates stock + allocations per material and fills zeros', async () => {
      const qbT = trxRepo.createQueryBuilder();
      qbT.getRawMany.mockResolvedValue([
        { material_id: 'mat-1', quantity_on_hand: '50' },
        { material_id: 'mat-2', quantity_on_hand: '20' },
      ]);
      const qbA = allocRepo.createQueryBuilder();
      qbA.getRawMany.mockResolvedValue([
        { material_id: 'mat-1', quantity_allocated: '10' },
      ]);

      const out = await service.getStockByMaterialIds(['mat-1', 'mat-2', 'mat-3']);
      expect(out.size).toBe(3);
      expect(out.get('mat-1')).toEqual({
        material_id: 'mat-1',
        quantity_on_hand: 50,
        quantity_allocated: 10,
        quantity_available: 40,
      });
      expect(out.get('mat-2')!.quantity_allocated).toBe(0);
      expect(out.get('mat-3')).toEqual({
        material_id: 'mat-3',
        quantity_on_hand: 0,
        quantity_allocated: 0,
        quantity_available: 0,
      });
    });
  });

  describe('getQuantityOnHandByOwner', () => {
    it('filters by COMPANY (owner_id IS NULL)', async () => {
      const qb = trxRepo.createQueryBuilder();
      qb.getRawOne.mockResolvedValue({ quantity_on_hand: '5' });
      const out = await service.getQuantityOnHandByOwner('mat-1', OwnerType.COMPANY, null);
      expect(out).toBe(5);
      expect(qb.andWhere).toHaveBeenCalledWith('t.owner_id IS NULL');
    });

    it('filters by CUSTOMER + owner_id', async () => {
      const qb = trxRepo.createQueryBuilder();
      qb.getRawOne.mockResolvedValue({ quantity_on_hand: '12' });
      await service.getQuantityOnHandByOwner('mat-1', OwnerType.CUSTOMER, 'cust-1');
      expect(qb.andWhere).toHaveBeenCalledWith(
        't.owner_id = :ownerId',
        { ownerId: 'cust-1' },
      );
    });
  });

  describe('getStockByMaterialId', () => {
    it('throws NotFound when material does not exist', async () => {
      (materialRepo.findOne as jest.Mock).mockResolvedValue(null);
      await expect(service.getStockByMaterialId('x')).rejects.toThrow(NotFoundException);
    });

    it('combines stock, allocation, on-order, and BOM-required figures', async () => {
      (materialRepo.findOne as jest.Mock).mockResolvedValue({ id: 'mat-1' });
      jest.spyOn(service, 'getQuantityOnHand').mockResolvedValue(100);
      jest.spyOn(service, 'getAllocatedQuantity').mockResolvedValue(30);
      purchaseOrdersService.getQuantityOnOrder.mockResolvedValue(15);
      (orderRepo.find as jest.Mock).mockResolvedValue([
        { id: 'o1', quantity: 10, bom_revision_id: 'rev-1' },
      ]);
      (bomItemRepo.find as jest.Mock).mockResolvedValue([
        { material_id: 'mat-1', bom_revision_id: 'rev-1', quantity_required: '2', scrap_factor: '5' },
      ]);

      const out = await service.getStockByMaterialId('mat-1');
      expect(out.quantity_on_hand).toBe(100);
      expect(out.quantity_allocated).toBe(30);
      expect(out.quantity_available).toBe(70);
      expect(out.quantity_on_order).toBe(15);
      // 10 * 2 * (1 + 5/100) = 21
      expect(out.quantity_required).toBeCloseTo(21);
    });
  });

  describe('findAllStock', () => {
    it('combines materials with stock/allocation/required maps', async () => {
      const mat = { id: 'mat-1', internal_part_number: 'IPN-1', customer: null };
      (materialRepo.find as jest.Mock).mockResolvedValue([mat]);
      const qbT = trxRepo.createQueryBuilder();
      qbT.getRawMany.mockResolvedValue([{ material_id: 'mat-1', quantity_on_hand: '50' }]);
      const qbA = allocRepo.createQueryBuilder();
      qbA.getRawMany.mockResolvedValue([{ material_id: 'mat-1', quantity_allocated: '5' }]);
      purchaseOrdersService.getQuantitiesOnOrder.mockResolvedValue(new Map([['mat-1', 8]]));
      (orderRepo.find as jest.Mock).mockResolvedValue([]); // no active orders
      const out = await service.findAllStock();
      expect(out).toHaveLength(1);
      expect(out[0].quantity_on_hand).toBe(50);
      expect(out[0].quantity_allocated).toBe(5);
      expect(out[0].quantity_available).toBe(45);
      expect(out[0].quantity_on_order).toBe(8);
      expect(out[0].quantity_required).toBe(0);
    });
  });
});
