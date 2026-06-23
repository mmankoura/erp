import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;
  let dataSource: { query: jest.Mock };

  beforeEach(() => {
    dataSource = { query: jest.fn() };
    controller = new HealthController(dataSource as any);
  });

  describe('check', () => {
    it('returns healthy when DB query succeeds', async () => {
      dataSource.query.mockResolvedValue([{ '?column?': 1 }]);
      const out = await controller.check();
      expect(out.status).toBe('healthy');
      expect(out.database.connected).toBe(true);
      expect(out.database.latency_ms).toBeGreaterThanOrEqual(0);
      expect(out.database.error).toBeUndefined();
      expect(typeof out.timestamp).toBe('string');
      expect(out.uptime).toBeGreaterThanOrEqual(0);
    });

    it('returns unhealthy when DB query throws', async () => {
      dataSource.query.mockRejectedValue(new Error('connection refused'));
      const out = await controller.check();
      expect(out.status).toBe('unhealthy');
      expect(out.database.connected).toBe(false);
      expect(out.database.error).toBe('connection refused');
    });

    it('handles non-Error thrown values gracefully', async () => {
      dataSource.query.mockRejectedValue('string error');
      const out = await controller.check();
      expect(out.database.error).toBe('Unknown error');
    });
  });

  describe('live', () => {
    it('always returns ok', () => {
      expect(controller.live()).toEqual({ status: 'ok' });
    });
  });

  describe('ready', () => {
    it('reports ok when DB is connected', async () => {
      dataSource.query.mockResolvedValue([{}]);
      const out = await controller.ready();
      expect(out).toEqual({ status: 'ok', database: true });
    });

    it('reports not_ready when DB query fails', async () => {
      dataSource.query.mockRejectedValue(new Error('down'));
      const out = await controller.ready();
      expect(out).toEqual({ status: 'not_ready', database: false });
    });
  });
});
