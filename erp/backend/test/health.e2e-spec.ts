import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { HealthController } from '../src/modules/health/health.controller';

/**
 * End-to-end test for the HealthController.
 *
 * Spins up a tiny Nest application with a fake DataSource so we can hit the
 * real HTTP routes without booting Postgres. Verifies the public endpoints
 * (/health, /health/live, /health/ready) work end-to-end.
 */
describe('HealthController (e2e)', () => {
  let app: INestApplication;
  let mockDataSource: { query: jest.Mock };

  beforeAll(async () => {
    mockDataSource = { query: jest.fn().mockResolvedValue([{ '?column?': 1 }]) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health returns healthy when DB is up', async () => {
    mockDataSource.query.mockResolvedValueOnce([{ '?column?': 1 }]);
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
    expect(res.body.database.connected).toBe(true);
    expect(typeof res.body.database.latency_ms).toBe('number');
  });

  it('GET /health returns unhealthy when DB throws', async () => {
    mockDataSource.query.mockRejectedValueOnce(new Error('boom'));
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('unhealthy');
    expect(res.body.database.connected).toBe(false);
    expect(res.body.database.error).toBe('boom');
  });

  it('GET /health/live always returns ok', async () => {
    const res = await request(app.getHttpServer()).get('/health/live');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /health/ready reports not_ready when DB is down', async () => {
    mockDataSource.query.mockRejectedValueOnce(new Error('down'));
    const res = await request(app.getHttpServer()).get('/health/ready');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'not_ready', database: false });
  });

  it('GET /health/ready reports ok when DB is up', async () => {
    mockDataSource.query.mockResolvedValueOnce([]);
    const res = await request(app.getHttpServer()).get('/health/ready');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', database: true });
  });
});
