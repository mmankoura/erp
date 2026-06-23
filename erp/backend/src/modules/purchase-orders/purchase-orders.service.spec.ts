import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PurchaseOrdersService } from './purchase-orders.service';
import {
  PurchaseOrder,
  PurchaseOrderStatus,
} from '../../entities/purchase-order.entity';
import { PurchaseOrderLine } from '../../entities/purchase-order-line.entity';
import { Material } from '../../entities/material.entity';
import { Supplier } from '../../entities/supplier.entity';
import { InventoryTransaction } from '../../entities/inventory-transaction.entity';
import { AuditService } from '../audit/audit.service';
import { ReceivingInspectionService } from '../receiving-inspection/receiving-inspection.service';
import { createMockRepo, MockRepo, createMockDataSource } from '../../test-utils/repo-mock';

const buildPo = (overrides: Partial<PurchaseOrder> = {}): PurchaseOrder =>
  ({
    id: 'po-1',
    po_number: 'PO-202604-0001',
    supplier_id: 'sup-1',
    status: PurchaseOrderStatus.DRAFT,
    order_date: new Date(),
    expected_date: null,
    total_amount: 0,
    currency: 'USD',
    notes: null,
    terms: null,
    revision: 0,
    fob: null,
    ship_to: null,
    requested_by: null,
    created_by: null,
    lines: [],
    created_at: new Date(),
    updated_at: new Date(),
    deleted_at: null,
    ...overrides,
  }) as PurchaseOrder;

describe('PurchaseOrdersService', () => {
  let service: PurchaseOrdersService;
  let poRepo: MockRepo<PurchaseOrder>;
  let lineRepo: MockRepo<PurchaseOrderLine>;
  let materialRepo: MockRepo<Material>;
  let supplierRepo: MockRepo<Supplier>;
  let trxRepo: MockRepo<InventoryTransaction>;
  let audit: any;
  let inspectionService: any;

  beforeEach(async () => {
    poRepo = createMockRepo<PurchaseOrder>();
    lineRepo = createMockRepo<PurchaseOrderLine>();
    materialRepo = createMockRepo<Material>();
    supplierRepo = createMockRepo<Supplier>();
    trxRepo = createMockRepo<InventoryTransaction>();
    audit = {
      emitCreate: jest.fn(),
      emitDelete: jest.fn(),
      emitStateChange: jest.fn(),
    };
    inspectionService = {};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchaseOrdersService,
        { provide: getRepositoryToken(PurchaseOrder), useValue: poRepo },
        { provide: getRepositoryToken(PurchaseOrderLine), useValue: lineRepo },
        { provide: getRepositoryToken(Material), useValue: materialRepo },
        { provide: getRepositoryToken(Supplier), useValue: supplierRepo },
        { provide: getRepositoryToken(InventoryTransaction), useValue: trxRepo },
        { provide: DataSource, useValue: createMockDataSource() },
        { provide: AuditService, useValue: audit },
        { provide: ReceivingInspectionService, useValue: inspectionService },
      ],
    }).compile();
    service = module.get(PurchaseOrdersService);
  });

  describe('findOne', () => {
    it('throws NotFound when missing', async () => {
      (poRepo.findOne as jest.Mock).mockResolvedValue(null);
      await expect(service.findOne('x')).rejects.toThrow(NotFoundException);
    });

    it('sorts lines by line_number ASC', async () => {
      const po = buildPo({
        lines: [
          { line_number: 3 } as any,
          { line_number: 1 } as any,
          { line_number: 2 } as any,
        ],
      });
      (poRepo.findOne as jest.Mock).mockResolvedValue(po);
      const out = await service.findOne('po-1');
      expect(out.lines.map((l) => l.line_number)).toEqual([1, 2, 3]);
    });
  });

  describe('create', () => {
    it('throws NotFound if supplier missing', async () => {
      (supplierRepo.findOne as jest.Mock).mockResolvedValue(null);
      await expect(
        service.create({ supplier_id: 'missing', order_date: '2026-04-27' } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws Conflict on duplicate PO number', async () => {
      (supplierRepo.findOne as jest.Mock).mockResolvedValue({ id: 'sup-1' });
      (poRepo.findOne as jest.Mock).mockResolvedValue(buildPo());
      await expect(
        service.create({
          supplier_id: 'sup-1',
          po_number: 'PO-1',
          order_date: '2026-04-27',
        } as any),
      ).rejects.toThrow(ConflictException);
    });

    it('throws BadRequest if any material is missing', async () => {
      (supplierRepo.findOne as jest.Mock).mockResolvedValue({ id: 'sup-1' });
      (poRepo.findOne as jest.Mock).mockResolvedValue(null); // no duplicate
      (materialRepo.findBy as jest.Mock).mockResolvedValue([{ id: 'mat-1' }]); // 1 of 2
      await expect(
        service.create({
          supplier_id: 'sup-1',
          po_number: 'PO-X',
          order_date: '2026-04-27',
          lines: [
            { material_id: 'mat-1', quantity_ordered: 1 },
            { material_id: 'mat-2', quantity_ordered: 1 },
          ],
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('computes total_amount as Σ qty * unit_cost', async () => {
      (supplierRepo.findOne as jest.Mock).mockResolvedValue({ id: 'sup-1' });
      (poRepo.findOne as jest.Mock).mockResolvedValueOnce(null);
      (materialRepo.findBy as jest.Mock).mockResolvedValue([
        { id: 'mat-1' },
        { id: 'mat-2' },
      ]);
      (poRepo.save as jest.Mock).mockImplementation((p) => Promise.resolve({ ...p, id: 'po-new' }));
      (poRepo.findOne as jest.Mock).mockResolvedValue(buildPo({ id: 'po-new' }));

      await service.create({
        supplier_id: 'sup-1',
        po_number: 'PO-NEW',
        order_date: '2026-04-27',
        lines: [
          { material_id: 'mat-1', quantity_ordered: 5, unit_cost: 2 },
          { material_id: 'mat-2', quantity_ordered: 3, unit_cost: 4 },
        ],
      } as any);
      const created: any = (poRepo.create as jest.Mock).mock.calls[0][0];
      // total_amount is set on the in-memory object before save
      const savedArg: any = (poRepo.save as jest.Mock).mock.calls[0][0];
      expect(savedArg.total_amount).toBe(5 * 2 + 3 * 4);
    });
  });

  describe('update', () => {
    it('rejects updates to CLOSED PO', async () => {
      (poRepo.findOne as jest.Mock).mockResolvedValue(buildPo({ status: PurchaseOrderStatus.CLOSED }));
      await expect(service.update('po-1', { notes: 'x' } as any)).rejects.toThrow(BadRequestException);
    });

    it('rejects updates to CANCELLED PO', async () => {
      (poRepo.findOne as jest.Mock).mockResolvedValue(buildPo({ status: PurchaseOrderStatus.CANCELLED }));
      await expect(service.update('po-1', { notes: 'x' } as any)).rejects.toThrow(BadRequestException);
    });

    it('emits PO_STATUS_CHANGED audit when status changes', async () => {
      const po = buildPo({ status: PurchaseOrderStatus.DRAFT });
      (poRepo.findOne as jest.Mock).mockResolvedValue(po);
      (poRepo.save as jest.Mock).mockImplementation((p) => Promise.resolve(p));
      await service.update('po-1', { status: PurchaseOrderStatus.SUBMITTED } as any);
      expect(audit.emitStateChange).toHaveBeenCalledWith(
        'PO_STATUS_CHANGED',
        'purchase_order',
        'po-1',
        { status: PurchaseOrderStatus.DRAFT },
        { status: PurchaseOrderStatus.SUBMITTED },
        undefined,
      );
    });
  });

  describe('addLine', () => {
    it('rejects when PO is not DRAFT', async () => {
      (poRepo.findOne as jest.Mock).mockResolvedValue(buildPo({ status: PurchaseOrderStatus.SUBMITTED }));
      await expect(service.addLine('po-1', {} as any)).rejects.toThrow(/DRAFT/);
    });

    it('rejects when material is missing', async () => {
      (poRepo.findOne as jest.Mock).mockResolvedValueOnce(buildPo());
      (materialRepo.findOne as jest.Mock).mockResolvedValue(null);
      await expect(service.addLine('po-1', { material_id: 'x', quantity_ordered: 1 } as any))
        .rejects.toThrow(NotFoundException);
    });

    it('assigns next line_number = max + 1', async () => {
      const po = buildPo({
        lines: [{ line_number: 7 } as any],
        status: PurchaseOrderStatus.DRAFT,
      });
      (poRepo.findOne as jest.Mock).mockResolvedValueOnce(po).mockResolvedValue(po);
      (materialRepo.findOne as jest.Mock).mockResolvedValue({ id: 'mat-1' });
      (lineRepo.save as jest.Mock).mockImplementation((l) => Promise.resolve({ ...l, id: 'line-new' }));
      (lineRepo.findOne as jest.Mock).mockResolvedValue({ id: 'line-new', line_number: 8 } as any);

      await service.addLine('po-1', { material_id: 'mat-1', quantity_ordered: 5 } as any);
      expect(lineRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        line_number: 8,
      }));
    });
  });

  describe('removeLine', () => {
    it('rejects when parent PO is not DRAFT', async () => {
      (lineRepo.findOne as jest.Mock).mockResolvedValue({
        id: 'line-1',
        purchase_order: { status: PurchaseOrderStatus.SUBMITTED },
        purchase_order_id: 'po-1',
      } as any);
      await expect(service.removeLine('line-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('quantity-on-order queries', () => {
    it('getQuantityOnOrder filters open statuses', async () => {
      const qb = lineRepo.createQueryBuilder();
      qb.getRawOne.mockResolvedValue({ qty_on_order: '7' });
      const out = await service.getQuantityOnOrder('mat-1');
      expect(out).toBe(7);
      expect(qb.andWhere).toHaveBeenCalledWith(
        'po.status IN (:...statuses)',
        expect.objectContaining({
          statuses: expect.arrayContaining([
            PurchaseOrderStatus.SUBMITTED,
            PurchaseOrderStatus.CONFIRMED,
            PurchaseOrderStatus.PARTIALLY_RECEIVED,
          ]),
        }),
      );
    });

    it('getQuantitiesOnOrder returns empty Map for empty input', async () => {
      const out = await service.getQuantitiesOnOrder([]);
      expect(out.size).toBe(0);
    });

    it('getQuantitiesOnOrder fills 0 for materials without open POs', async () => {
      const qb = lineRepo.createQueryBuilder();
      qb.getRawMany.mockResolvedValue([
        { material_id: 'mat-1', qty_on_order: '5' },
      ]);
      const out = await service.getQuantitiesOnOrder(['mat-1', 'mat-2']);
      expect(out.get('mat-1')).toBe(5);
      expect(out.get('mat-2')).toBe(0);
    });

    it('getPurchaseOrderDetailsByMaterial dedupes PO numbers per material', async () => {
      const qb = lineRepo.createQueryBuilder();
      qb.getRawMany.mockResolvedValue([
        { material_id: 'mat-1', po_number: 'PO-1', expected_date: null },
        { material_id: 'mat-1', po_number: 'PO-1', expected_date: null }, // dup
        { material_id: 'mat-1', po_number: 'PO-2', expected_date: '2026-05-01' },
      ]);
      const out = await service.getPurchaseOrderDetailsByMaterial(['mat-1']);
      expect(out.get('mat-1')).toHaveLength(2);
    });

    it('getPurchaseOrderDetailsByMaterial returns empty for empty input', async () => {
      const out = await service.getPurchaseOrderDetailsByMaterial([]);
      expect(out.size).toBe(0);
    });
  });
});
