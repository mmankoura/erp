import { UidGeneratorService } from './uid-generator.service';

describe('UidGeneratorService', () => {
  // Freeze the system clock so we can match the date prefix deterministically.
  const fixedDate = new Date('2026-04-27T12:00:00Z');
  const expectedPrefix = `UID-${fixedDate.getFullYear()}${String(fixedDate.getMonth() + 1).padStart(2, '0')}${String(fixedDate.getDate()).padStart(2, '0')}`;

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(fixedDate);
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  it('produces UID-YYYYMMDD-XXXX with zero-padded sequence', async () => {
    const dsQuery = jest
      .fn()
      .mockResolvedValueOnce(undefined) // INSERT...ON CONFLICT
      .mockResolvedValueOnce([{ last_value: 1 }]); // SELECT
    const service = new UidGeneratorService({ query: dsQuery } as any);

    const uid = await service.generate();
    expect(uid).toBe(`${expectedPrefix}-0001`);
  });

  it('zero-pads multi-digit sequence values', async () => {
    const dsQuery = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([{ last_value: 42 }]);
    const service = new UidGeneratorService({ query: dsQuery } as any);

    const uid = await service.generate();
    expect(uid).toBe(`${expectedPrefix}-0042`);
  });

  it('handles a 4-digit sequence without truncation', async () => {
    const dsQuery = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([{ last_value: 9999 }]);
    const service = new UidGeneratorService({ query: dsQuery } as any);

    const uid = await service.generate();
    expect(uid).toBe(`${expectedPrefix}-9999`);
  });

  it('uses provided EntityManager when in transaction', async () => {
    const dsQuery = jest.fn();
    const mgrQuery = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([{ last_value: 7 }]);
    const service = new UidGeneratorService({ query: dsQuery } as any);

    await service.generate({ query: mgrQuery } as any);
    expect(dsQuery).not.toHaveBeenCalled();
    expect(mgrQuery).toHaveBeenCalledTimes(2);
  });

  it('issues an upsert against uid_sequences keyed by the date prefix', async () => {
    const dsQuery = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([{ last_value: 5 }]);
    const service = new UidGeneratorService({ query: dsQuery } as any);

    await service.generate();
    const insertCall = dsQuery.mock.calls[0];
    expect(insertCall[0]).toMatch(/INSERT INTO "uid_sequences"/);
    expect(insertCall[0]).toMatch(/ON CONFLICT/);
    expect(insertCall[1]).toEqual([expectedPrefix.replace('UID-', '')]);
  });
});
