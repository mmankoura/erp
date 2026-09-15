import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { LabelsService } from './labels.service';
import {
  InventoryLot,
  PackageType,
} from '../../entities/inventory-lot.entity';
import { Customer } from '../../entities/customer.entity';
import { OwnerType } from '../../entities/inventory-transaction.entity';
import { createMockRepo, MockRepo } from '../../test-utils/repo-mock';

const buildLot = (overrides: Partial<InventoryLot> = {}): InventoryLot =>
  ({
    id: 'lot-1',
    uid: 'UID-20260826-0001',
    material_id: 'mat-1',
    material: {
      internal_part_number: 'RES-10K-0402',
      description: '10K Ohm 1% 0402',
      manufacturer: 'Yageo',
      manufacturer_pn: 'RC0402FR-0710KL',
      resource_type: 'SMT',
    },
    // pg hands decimal columns back as strings, so the fixture does too.
    quantity: '5000.0000',
    initial_quantity: '5000.0000',
    package_type: PackageType.REEL,
    po_reference: 'PO-1042',
    supplier_id: 'sup-1',
    supplier: { name: 'Digi-Key' },
    received_date: new Date('2026-08-26T12:00:00Z'),
    owner_type: OwnerType.COMPANY,
    owner_id: null,
    bin: null,
    ...overrides,
  }) as unknown as InventoryLot;

describe('LabelsService', () => {
  let service: LabelsService;
  let lots: MockRepo<InventoryLot>;
  let customers: MockRepo<Customer>;

  beforeEach(async () => {
    lots = createMockRepo<InventoryLot>();
    customers = createMockRepo<Customer>();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LabelsService,
        { provide: getRepositoryToken(InventoryLot), useValue: lots },
        { provide: getRepositoryToken(Customer), useValue: customers },
      ],
    }).compile();
    service = module.get(LabelsService);
  });

  describe('getByLotId', () => {
    it('maps a lot onto the label shape', async () => {
      lots.findOne.mockResolvedValue(buildLot());

      const label = await service.getByLotId('lot-1');

      expect(label).toMatchObject({
        lot_id: 'lot-1',
        uid: 'UID-20260826-0001',
        ipn: 'RES-10K-0402',
        description: '10K Ohm 1% 0402',
        manufacturer_pn: 'RC0402FR-0710KL',
        resource_type: 'SMT',
        package_type: PackageType.REEL,
        po_reference: 'PO-1042',
        supplier_name: 'Digi-Key',
        owner_type: OwnerType.COMPANY,
        owner_name: null,
      });
    });

    it('coerces the decimal quantity to a number', async () => {
      lots.findOne.mockResolvedValue(buildLot({ quantity: '250.5000' as any }));

      const label = await service.getByLotId('lot-1');

      expect(label.quantity).toBe(250.5);
      expect(typeof label.quantity).toBe('number');
    });

    // resource_type drives the template's "Mounting Type" line and is nullable
    // on Material, so a catalogue row that never set it must not break the label.
    it('tolerates a material with no resource type', async () => {
      const lot = buildLot();
      (lot.material as { resource_type: unknown }).resource_type = null;
      lots.findOne.mockResolvedValue(lot);

      const label = await service.getByLotId('lot-1');

      expect(label.resource_type).toBeNull();
    });

    it('throws when the lot is gone', async () => {
      lots.findOne.mockResolvedValue(null);

      await expect(service.getByLotId('nope')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getByUid', () => {
    it('names the UID in the not-found message, since that is what was scanned', async () => {
      lots.findOne.mockResolvedValue(null);

      await expect(service.getByUid('UID-20260826-9999')).rejects.toThrow(
        /UID-20260826-9999/,
      );
    });
  });

  describe('supplier', () => {
    // Customer-Supplied and Stock receipts never resolve a PO, so the lot has
    // no supplier_id. That is normal, not an error.
    it('is null when no purchase order resolved at receiving', async () => {
      lots.findOne.mockResolvedValue(
        buildLot({ supplier_id: null, supplier: null, po_reference: null }),
      );

      const label = await service.getByLotId('lot-1');

      expect(label.supplier_name).toBeNull();
      expect(label.po_reference).toBeNull();
    });
  });

  describe('owner resolution', () => {
    it('looks up the customer name for a customer-owned lot', async () => {
      lots.findOne.mockResolvedValue(
        buildLot({ owner_type: OwnerType.CUSTOMER, owner_id: 'cust-1' }),
      );
      customers.find.mockResolvedValue([{ id: 'cust-1', name: 'Acme Corp' }]);

      const label = await service.getByLotId('lot-1');

      expect(label.owner_name).toBe('Acme Corp');
    });

    it('does not query customers for a company-owned lot', async () => {
      lots.findOne.mockResolvedValue(buildLot({ owner_id: 'stray-id' }));

      const label = await service.getByLotId('lot-1');

      expect(label.owner_name).toBeNull();
      expect(customers.find).not.toHaveBeenCalled();
    });
  });

  describe('getManyByLotIds', () => {
    it('resolves every owner in a single customer query', async () => {
      lots.find.mockResolvedValue([
        buildLot({ id: 'a', owner_type: OwnerType.CUSTOMER, owner_id: 'c1' }),
        buildLot({ id: 'b', owner_type: OwnerType.CUSTOMER, owner_id: 'c2' }),
        buildLot({ id: 'c', owner_type: OwnerType.CUSTOMER, owner_id: 'c1' }),
        buildLot({ id: 'd' }),
      ]);
      customers.find.mockResolvedValue([
        { id: 'c1', name: 'Acme Corp' },
        { id: 'c2', name: 'Orthogone' },
      ]);

      const labels = await service.getManyByLotIds(['a', 'b', 'c', 'd']);

      expect(customers.find).toHaveBeenCalledTimes(1);
      expect(labels.map((l) => l.owner_name)).toEqual([
        'Acme Corp',
        'Orthogone',
        'Acme Corp',
        null,
      ]);
    });

    it('returns labels in the order requested, not the order the DB returned', async () => {
      lots.find.mockResolvedValue([
        buildLot({ id: 'b' }),
        buildLot({ id: 'a' }),
      ]);

      const labels = await service.getManyByLotIds(['a', 'b']);

      expect(labels.map((l) => l.lot_id)).toEqual(['a', 'b']);
    });

    // A lot deleted between rendering the grid and hitting Print should not
    // fail the whole run.
    it('drops ids that no longer exist', async () => {
      lots.find.mockResolvedValue([buildLot({ id: 'a' })]);

      const labels = await service.getManyByLotIds(['a', 'gone']);

      expect(labels).toHaveLength(1);
      expect(labels[0].lot_id).toBe('a');
    });

    it('short-circuits on an empty request without touching the database', async () => {
      const labels = await service.getManyByLotIds([]);

      expect(labels).toEqual([]);
      expect(lots.find).not.toHaveBeenCalled();
    });
  });
});
