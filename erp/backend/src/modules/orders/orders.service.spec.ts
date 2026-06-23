import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { Order, OrderStatus } from '../../entities/order.entity';
import { Customer } from '../../entities/customer.entity';
import { Product } from '../../entities/product.entity';
import { BomRevision } from '../../entities/bom-revision.entity';
import { BomItem } from '../../entities/bom-item.entity';
import { OrderMaterialSource } from '../../entities/order-material-source.entity';
import { InventoryService } from '../inventory/inventory.service';
import { AuditService } from '../audit/audit.service';
import { SequenceGeneratorService } from '../shared/sequence-generator.service';
import { createMockRepo, MockRepo } from '../../test-utils/repo-mock';

describe('OrdersService', () => {
  let service: OrdersService;
  let orderRepo: MockRepo<Order>;
  let productRepo: MockRepo<Product>;
  let customerRepo: MockRepo<Customer>;
  let bomRevisionRepo: MockRepo<BomRevision>;
  let bomItemRepo: MockRepo<BomItem>;
  let omsRepo: MockRepo<OrderMaterialSource>;
  let inventoryService: any;
  let auditService: any;
  let sequenceGen: { next: jest.Mock };

  beforeEach(async () => {
    orderRepo = createMockRepo<Order>();
    productRepo = createMockRepo<Product>();
    customerRepo = createMockRepo<Customer>();
    bomRevisionRepo = createMockRepo<BomRevision>();
    bomItemRepo = createMockRepo<BomItem>();
    omsRepo = createMockRepo<OrderMaterialSource>();
    inventoryService = {
      reallocateOrder: jest.fn(),
      deallocateOrder: jest.fn(),
      getStockByMaterialIds: jest.fn().mockResolvedValue(new Map()),
    };
    auditService = {
      emit: jest.fn(),
      emitCreate: jest.fn(),
      emitDelete: jest.fn(),
      emitStateChange: jest.fn(),
    };
    sequenceGen = { next: jest.fn().mockResolvedValue('ORD-202604-0001') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: getRepositoryToken(Order), useValue: orderRepo },
        { provide: getRepositoryToken(Product), useValue: productRepo },
        { provide: getRepositoryToken(Customer), useValue: customerRepo },
        { provide: getRepositoryToken(BomRevision), useValue: bomRevisionRepo },
        { provide: getRepositoryToken(BomItem), useValue: bomItemRepo },
        { provide: getRepositoryToken(OrderMaterialSource), useValue: omsRepo },
        { provide: InventoryService, useValue: inventoryService },
        { provide: AuditService, useValue: auditService },
        { provide: SequenceGeneratorService, useValue: sequenceGen },
      ],
    }).compile();
    service = module.get(OrdersService);
  });

  describe('findOne', () => {
    it('throws NotFound when missing', async () => {
      (orderRepo.findOne as jest.Mock).mockResolvedValue(null);
      await expect(service.findOne('x')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByOrderNumber', () => {
    it('throws NotFound when missing', async () => {
      (orderRepo.findOne as jest.Mock).mockResolvedValue(null);
      await expect(service.findByOrderNumber('ORD-X')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    const baseDto = {
      customer_id: 'cust-1',
      product_id: 'prd-1',
      quantity: 10,
      due_date: '2026-06-01',
    } as any;

    it('throws NotFound if customer missing', async () => {
      (customerRepo.findOne as jest.Mock).mockResolvedValue(null);
      await expect(service.create(baseDto)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFound if product missing', async () => {
      (customerRepo.findOne as jest.Mock).mockResolvedValue({ id: 'cust-1' });
      (productRepo.findOne as jest.Mock).mockResolvedValue(null);
      await expect(service.create(baseDto)).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequest if product has no active BOM revision and none specified', async () => {
      (customerRepo.findOne as jest.Mock).mockResolvedValue({ id: 'cust-1' });
      (productRepo.findOne as jest.Mock).mockResolvedValue({
        id: 'prd-1',
        active_bom_revision_id: null,
        part_number: 'PN-1',
      });
      await expect(service.create(baseDto)).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequest if specified BOM belongs to a different product', async () => {
      (customerRepo.findOne as jest.Mock).mockResolvedValue({ id: 'cust-1' });
      (productRepo.findOne as jest.Mock).mockResolvedValue({
        id: 'prd-1',
        part_number: 'PN-1',
        active_bom_revision_id: 'rev-active',
      });
      (bomRevisionRepo.findOne as jest.Mock).mockResolvedValue({
        id: 'rev-other',
        product_id: 'prd-2',
        revision_number: '1.0',
      });
      await expect(
        service.create({ ...baseDto, bom_revision_id: 'rev-other' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAll', () => {
    it('applies status, customer, product and date filters', async () => {
      const qb = orderRepo.createQueryBuilder();
      qb.getMany.mockResolvedValue([]);
      await service.findAll({
        status: OrderStatus.SMT,
        customer_id: 'cust-1',
        product_id: 'prd-1',
        due_date_from: '2026-01-01',
        due_date_to: '2026-12-31',
      });
      expect(qb.andWhere).toHaveBeenCalledWith('order.status = :status', { status: OrderStatus.SMT });
      expect(qb.andWhere).toHaveBeenCalledWith('order.customer_id = :customerId', { customerId: 'cust-1' });
      expect(qb.andWhere).toHaveBeenCalledWith('order.product_id = :productId', { productId: 'prd-1' });
      expect(qb.andWhere).toHaveBeenCalledWith('order.due_date >= :fromDate', { fromDate: '2026-01-01' });
      expect(qb.andWhere).toHaveBeenCalledWith('order.due_date <= :toDate', { toDate: '2026-12-31' });
    });

    it('orders by due_date ASC and created_at DESC', async () => {
      const qb = orderRepo.createQueryBuilder();
      qb.getMany.mockResolvedValue([]);
      await service.findAll();
      expect(qb.orderBy).toHaveBeenCalledWith('order.due_date', 'ASC');
      expect(qb.addOrderBy).toHaveBeenCalledWith('order.created_at', 'DESC');
    });

    it('includes deleted orders when requested', async () => {
      const qb = orderRepo.createQueryBuilder();
      qb.getMany.mockResolvedValue([]);
      await service.findAll({ includeDeleted: true });
      expect(qb.withDeleted).toHaveBeenCalled();
    });
  });
});
