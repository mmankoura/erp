import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { Customer } from '../../entities/customer.entity';
import { AuditService } from '../audit/audit.service';
import { createMockRepo, MockRepo } from '../../test-utils/repo-mock';

const buildCustomer = (overrides: Partial<Customer> = {}): Customer =>
  ({
    id: 'cust-1',
    name: 'Acme',
    code: 'ACME',
    email: 'a@acme.com',
    phone: '+1',
    contact_person: null,
    address: null,
    notes: null,
    created_at: new Date(),
    updated_at: new Date(),
    deleted_at: null,
    ...overrides,
  }) as Customer;

describe('CustomersService', () => {
  let service: CustomersService;
  let repo: MockRepo<Customer>;
  let audit: { emitDelete: jest.Mock };

  beforeEach(async () => {
    repo = createMockRepo<Customer>();
    audit = { emitDelete: jest.fn().mockResolvedValue({} as any) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomersService,
        { provide: getRepositoryToken(Customer), useValue: repo },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = module.get(CustomersService);
  });

  it('findAll orders by name ASC', async () => {
    (repo.find as jest.Mock).mockResolvedValue([]);
    await service.findAll();
    expect(repo.find).toHaveBeenCalledWith({ order: { name: 'ASC' } });
  });

  it('findOne returns customer or throws NotFound', async () => {
    (repo.findOne as jest.Mock).mockResolvedValueOnce(buildCustomer());
    await expect(service.findOne('cust-1')).resolves.toMatchObject({ id: 'cust-1' });

    (repo.findOne as jest.Mock).mockResolvedValueOnce(null);
    await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
  });

  it('create persists DTO via repo.create + save', async () => {
    const dto = { name: 'New', code: 'NEW' } as any;
    (repo.save as jest.Mock).mockImplementation((c) => Promise.resolve({ ...c, id: 'new' }));
    const out = await service.create(dto);
    expect(repo.create).toHaveBeenCalledWith(dto);
    expect(out.id).toBe('new');
  });

  it('update patches fields and saves', async () => {
    const c = buildCustomer({ name: 'Old' });
    (repo.findOne as jest.Mock).mockResolvedValue(c);
    (repo.save as jest.Mock).mockImplementation((x) => Promise.resolve(x));

    const out = await service.update('cust-1', { name: 'New' } as any);
    expect(out.name).toBe('New');
  });

  it('remove soft-deletes and emits audit', async () => {
    const c = buildCustomer();
    (repo.findOne as jest.Mock).mockResolvedValue(c);
    (repo.softRemove as jest.Mock).mockResolvedValue(c);

    await service.remove('cust-1', 'alice');
    expect(repo.softRemove).toHaveBeenCalledWith(c);
    expect(audit.emitDelete).toHaveBeenCalledWith(
      'CUSTOMER_DELETED',
      'customer',
      'cust-1',
      expect.objectContaining({ name: c.name, email: c.email }),
      'alice',
    );
  });

  it('restore undoes soft-delete', async () => {
    const deleted = buildCustomer({ deleted_at: new Date() });
    (repo.findOne as jest.Mock).mockResolvedValueOnce(deleted);
    (repo.restore as jest.Mock).mockResolvedValue({});
    (repo.findOne as jest.Mock).mockResolvedValueOnce(buildCustomer({ deleted_at: null }));

    const out = await service.restore('cust-1');
    expect(repo.restore).toHaveBeenCalledWith('cust-1');
    expect(out.deleted_at).toBeNull();
  });

  it('restore throws NotFound when missing entirely', async () => {
    (repo.findOne as jest.Mock).mockResolvedValueOnce(null);
    await expect(service.restore('x')).rejects.toThrow(NotFoundException);
  });

  it('restore throws Conflict when not deleted', async () => {
    (repo.findOne as jest.Mock).mockResolvedValueOnce(buildCustomer({ deleted_at: null }));
    await expect(service.restore('x')).rejects.toThrow(ConflictException);
  });

  it('search runs ILIKE query with bound parameter', async () => {
    const qb = repo.createQueryBuilder();
    qb.getMany.mockResolvedValue([]);
    await service.search('acme');
    expect(qb.where).toHaveBeenCalledWith(
      'customer.name ILIKE :query',
      { query: '%acme%' },
    );
    expect(qb.orWhere).toHaveBeenCalled();
  });

  it('findAllIncludingDeleted passes withDeleted: true', async () => {
    (repo.find as jest.Mock).mockResolvedValue([]);
    await service.findAllIncludingDeleted();
    expect(repo.find).toHaveBeenCalledWith(expect.objectContaining({ withDeleted: true }));
  });
});
