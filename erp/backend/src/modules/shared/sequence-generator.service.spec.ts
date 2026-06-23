import { SequenceGeneratorService } from './sequence-generator.service';

describe('SequenceGeneratorService', () => {
  const buildService = (queryImpl: jest.Mock) => {
    const dataSource: any = { query: queryImpl };
    return new SequenceGeneratorService(dataSource);
  };

  it('produces "<prefix>0001" when no rows exist', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce(undefined) // pg_advisory_xact_lock
      .mockResolvedValueOnce([]); // existing rows
    const service = buildService(query);

    const out = await service.next('PO-202604', 'purchase_orders', 'po_number');
    expect(out).toBe('PO-2026040001');
  });

  it('increments the highest existing sequence', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([{ po_number: 'PO-2026040042' }]);
    const service = buildService(query);

    const out = await service.next('PO-202604', 'purchase_orders', 'po_number');
    expect(out).toBe('PO-2026040043');
  });

  it('respects custom pad length', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([{ id: 'X-9' }]);
    const service = buildService(query);

    const out = await service.next('X-', 'tbl', 'id', 6);
    expect(out).toBe('X-000010');
  });

  it('falls back to 1 when stored suffix is non-numeric', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([{ id: 'X-bogus' }]);
    const service = buildService(query);

    const out = await service.next('X-', 'tbl', 'id');
    expect(out).toBe('X-0001');
  });

  it('uses provided EntityManager when given (instead of dataSource)', async () => {
    const dsQuery = jest.fn();
    const mgrQuery = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([{ id: 'A-0001' }]);
    const service = new SequenceGeneratorService({ query: dsQuery } as any);

    await service.next('A-', 'tbl', 'id', 4, { query: mgrQuery } as any);
    expect(mgrQuery).toHaveBeenCalledTimes(2);
    expect(dsQuery).not.toHaveBeenCalled();
  });

  it('acquires an advisory lock keyed by prefix hash', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([]);
    const service = buildService(query);

    await service.next('PFX', 'tbl', 'id');
    const firstCall = query.mock.calls[0];
    expect(firstCall[0]).toContain('pg_advisory_xact_lock');
    // hash key should be a number
    expect(typeof firstCall[1][0]).toBe('number');
    expect(firstCall[1][0]).toBeGreaterThanOrEqual(0);
  });

  it('produces a stable lock key for the same prefix across calls', async () => {
    const query = jest
      .fn()
      .mockResolvedValue(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([]);
    const service = buildService(query);

    await service.next('SAME', 'tbl', 'id');
    await service.next('SAME', 'tbl', 'id');

    const firstHash = query.mock.calls[0][1][0];
    const secondHash = query.mock.calls[2][1][0];
    expect(firstHash).toBe(secondHash);
  });
});
