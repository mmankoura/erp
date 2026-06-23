import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { SuppliersService } from './suppliers.service';
import { Supplier } from '../../entities/supplier.entity';
import { AuditService } from '../audit/audit.service';
import { createMockRepo, MockRepo } from '../../test-utils/repo-mock';

const buildSupplier = (overrides: Partial<Supplier> = {}): Supplier =>
  ({
    id: 'sup-1',
    code: 'SUP1',
    name: 'Supplier One',
    contact_name: null,
    email: 'sup@example.com',
    phone: null,
    address: null,
    notes: null,
    attention: null,
    default_terms: null,
    default_fob: null,
    default_ship_to: null,
    currency: 'USD',
    created_at: new Date(),
    updated_at: new Date(),
    deleted_at: null,
    ...overrides,
  }) as Supplier;

describe('SuppliersService', () => {
  let service: SuppliersService;
  let repo: MockRepo<Supplier>;
  let audit: { emitDelete: jest.Mock };

  beforeEach(async () => {
    repo = createMockRepo<Supplier>();
    audit = { emitDelete: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SuppliersService,
        { provide: getRepositoryToken(Supplier), useValue: repo },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = module.get(SuppliersService);
  });

  it('findOne throws NotFound when missing', async () => {
    (repo.findOne as jest.Mock).mockResolvedValue(null);
    await expect(service.findOne('x')).rejects.toThrow(NotFoundException);
  });

  it('findByCode returns null when not found', async () => {
    (repo.findOne as jest.Mock).mockResolvedValue(null);
    const out = await service.findByCode('XYZ');
    expect(out).toBeNull();
  });

  it('create rejects on duplicate code', async () => {
    (repo.findOne as jest.Mock).mockResolvedValue(buildSupplier());
    await expect(service.create({ code: 'SUP1', name: 'X' } as any))
      .rejects.toThrow(ConflictException);
  });

  it('create persists when code is new', async () => {
    (repo.findOne as jest.Mock).mockResolvedValue(null);
    (repo.save as jest.Mock).mockImplementation((s) => Promise.resolve({ ...s, id: 'new' }));
    const out = await service.create({ code: 'NEW', name: 'X' } as any);
    expect(out.id).toBe('new');
  });

  it('update rejects when changing to a code that exists', async () => {
    const existing = buildSupplier({ code: 'OLD' });
    (repo.findOne as jest.Mock)
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce(buildSupplier({ id: 'other', code: 'TAKEN' }));
    await expect(service.update('sup-1', { code: 'TAKEN' } as any))
      .rejects.toThrow(ConflictException);
  });

  it('update persists when code unchanged or new', async () => {
    const existing = buildSupplier({ code: 'OLD' });
    (repo.findOne as jest.Mock).mockResolvedValue(existing);
    (repo.save as jest.Mock).mockImplementation((s) => Promise.resolve(s));
    const out = await service.update('sup-1', { name: 'Updated' } as any);
    expect(out.name).toBe('Updated');
  });

  it('remove soft-deletes and emits audit', async () => {
    const s = buildSupplier();
    (repo.findOne as jest.Mock).mockResolvedValue(s);
    await service.remove('sup-1', 'alice');
    expect(repo.softRemove).toHaveBeenCalledWith(s);
    expect(audit.emitDelete).toHaveBeenCalled();
  });
});
