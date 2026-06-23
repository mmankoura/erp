import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { ProductsService } from './products.service';
import { Product } from '../../entities/product.entity';
import { AuditService } from '../audit/audit.service';
import { createMockRepo, MockRepo } from '../../test-utils/repo-mock';

const buildProduct = (overrides: Partial<Product> = {}): Product =>
  ({
    id: 'prd-1',
    customer_id: null,
    customer: null,
    part_number: 'PN-1',
    name: 'Widget',
    description: null,
    active_bom_revision_id: null,
    created_at: new Date(),
    updated_at: new Date(),
    deleted_at: null,
    ...overrides,
  }) as unknown as Product;

describe('ProductsService', () => {
  let service: ProductsService;
  let repo: MockRepo<Product>;

  beforeEach(async () => {
    repo = createMockRepo<Product>();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: getRepositoryToken(Product), useValue: repo },
        { provide: AuditService, useValue: { emitDelete: jest.fn() } },
      ],
    }).compile();
    service = module.get(ProductsService);
  });

  it('findOne throws NotFound when missing', async () => {
    (repo.findOne as jest.Mock).mockResolvedValue(null);
    await expect(service.findOne('x')).rejects.toThrow(NotFoundException);
  });

  it('create rejects on duplicate part_number', async () => {
    (repo.findOne as jest.Mock).mockResolvedValue(buildProduct());
    await expect(service.create({ part_number: 'PN-1', name: 'X' } as any))
      .rejects.toThrow(ConflictException);
  });

  it('create persists when part number is new', async () => {
    (repo.findOne as jest.Mock).mockResolvedValue(null);
    (repo.save as jest.Mock).mockImplementation((p) => Promise.resolve({ ...p, id: 'new' }));
    const out = await service.create({ part_number: 'PN-NEW', name: 'X' } as any);
    expect(out.id).toBe('new');
  });

  it('update detects PN collision when changing part_number', async () => {
    const existing = buildProduct({ part_number: 'PN-OLD' });
    (repo.findOne as jest.Mock)
      .mockResolvedValueOnce(existing) // findOne(id)
      .mockResolvedValueOnce(buildProduct({ id: 'other', part_number: 'PN-TAKEN' }));
    await expect(service.update('prd-1', { part_number: 'PN-TAKEN' } as any))
      .rejects.toThrow(ConflictException);
  });

  it('update persists when PN unchanged', async () => {
    const existing = buildProduct({ part_number: 'PN-1', name: 'Old' });
    (repo.findOne as jest.Mock).mockResolvedValue(existing);
    (repo.save as jest.Mock).mockImplementation((p) => Promise.resolve(p));
    const out = await service.update('prd-1', { name: 'New' } as any);
    expect(out.name).toBe('New');
  });

  it('setActiveBomRevision updates active_bom_revision_id', async () => {
    const existing = buildProduct();
    (repo.findOne as jest.Mock).mockResolvedValue(existing);
    (repo.save as jest.Mock).mockImplementation((p) => Promise.resolve(p));
    await service.setActiveBomRevision('prd-1', 'rev-7');
    expect(existing.active_bom_revision_id).toBe('rev-7');
  });

  it('setActiveBomRevision can clear by passing null', async () => {
    const existing = buildProduct({ active_bom_revision_id: 'rev-x' });
    (repo.findOne as jest.Mock).mockResolvedValue(existing);
    (repo.save as jest.Mock).mockImplementation((p) => Promise.resolve(p));
    await service.setActiveBomRevision('prd-1', null);
    expect(existing.active_bom_revision_id).toBeNull();
  });

  it('restore throws NotFound when missing', async () => {
    (repo.findOne as jest.Mock).mockResolvedValue(null);
    await expect(service.restore('x')).rejects.toThrow(NotFoundException);
  });
});
