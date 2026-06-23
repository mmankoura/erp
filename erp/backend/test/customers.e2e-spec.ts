import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CustomersController } from '../src/modules/customers/customers.controller';
import { CustomersService } from '../src/modules/customers/customers.service';
import { Customer } from '../src/entities/customer.entity';
import { AuditService } from '../src/modules/audit/audit.service';
import { AuthenticatedGuard } from '../src/modules/auth/guards/authenticated.guard';
import { RolesGuard } from '../src/modules/auth/guards/roles.guard';

const FAKE_UUID = '11111111-1111-4111-8111-111111111111';

/**
 * End-to-end test for CustomersController against a mocked Customer
 * repository. Auth guards are overridden so we exercise routing + DTO
 * validation + service plumbing only.
 */
describe('CustomersController (e2e)', () => {
  let app: INestApplication;
  let repo: jest.Mocked<Partial<Repository<Customer>>>;

  beforeAll(async () => {
    repo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      create: jest.fn((dto) => dto),
      save: jest.fn().mockImplementation((c) => Promise.resolve({ ...c, id: FAKE_UUID })),
      softRemove: jest.fn(),
      restore: jest.fn(),
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        orWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([{ id: FAKE_UUID, name: 'Acme', code: 'ACME' }]),
      })),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CustomersController],
      providers: [
        CustomersService,
        { provide: getRepositoryToken(Customer), useValue: repo },
        { provide: AuditService, useValue: { emitDelete: jest.fn() } },
      ],
    })
      .overrideGuard(AuthenticatedGuard).useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard).useValue({ canActivate: () => true })
      .compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /customers returns the (empty) list', async () => {
    const res = await request(app.getHttpServer()).get('/customers');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /customers?search=acme runs the ILIKE search path', async () => {
    const res = await request(app.getHttpServer()).get('/customers?search=acme');
    expect(res.status).toBe(200);
    expect(res.body[0].code).toBe('ACME');
  });

  it('GET /customers?includeDeleted=true returns all (including deleted)', async () => {
    const res = await request(app.getHttpServer()).get('/customers?includeDeleted=true');
    expect(res.status).toBe(200);
    expect(repo.find).toHaveBeenCalledWith(expect.objectContaining({ withDeleted: true }));
  });

  it('POST /customers creates a customer', async () => {
    const res = await request(app.getHttpServer())
      .post('/customers')
      .send({ name: 'Acme', code: 'ACME' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Acme');
    expect(res.body.code).toBe('ACME');
  });

  it('POST /customers rejects empty payload via ValidationPipe', async () => {
    const res = await request(app.getHttpServer()).post('/customers').send({});
    expect(res.status).toBe(400);
  });

  it('GET /customers/:id rejects invalid UUID with 400', async () => {
    const res = await request(app.getHttpServer()).get('/customers/not-a-uuid');
    expect(res.status).toBe(400);
  });

  it('GET /customers/:id returns 404 when missing', async () => {
    (repo.findOne as jest.Mock).mockResolvedValueOnce(null);
    const res = await request(app.getHttpServer()).get(`/customers/${FAKE_UUID}`);
    expect(res.status).toBe(404);
  });

  it('PATCH /customers/:id updates the customer', async () => {
    (repo.findOne as jest.Mock).mockResolvedValue({
      id: FAKE_UUID, name: 'Old', code: 'OLD',
    });
    const res = await request(app.getHttpServer())
      .patch(`/customers/${FAKE_UUID}`)
      .send({ name: 'New' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('New');
  });

  it('DELETE /customers/:id soft-deletes (returns 204)', async () => {
    (repo.findOne as jest.Mock).mockResolvedValue({
      id: FAKE_UUID, name: 'Acme', code: 'ACME',
    });
    const res = await request(app.getHttpServer()).delete(`/customers/${FAKE_UUID}`);
    expect(res.status).toBe(204);
    expect(repo.softRemove).toHaveBeenCalled();
  });
});
