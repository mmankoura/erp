/**
 * Reusable Jest mock helpers for unit testing TypeORM-backed services.
 *
 * Centralized so that test files don't reinvent the same mock plumbing,
 * and so that adding a new method to a repository mock is a one-line change.
 */
import { Repository, DataSource, EntityManager, ObjectLiteral } from 'typeorm';

// Each method is a jest.Mock so .mockResolvedValue / .mockReturnValue type-check.
// Using jest.Mocked<Partial<Repository<T>>> drops the mock typing through Partial,
// so we declare the surface we actually use explicitly.
export type MockRepo<_T extends ObjectLiteral = ObjectLiteral> = {
  find: jest.Mock;
  findOne: jest.Mock;
  findOneBy: jest.Mock;
  findBy: jest.Mock;
  findAndCount: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
  remove: jest.Mock;
  softRemove: jest.Mock;
  restore: jest.Mock;
  count: jest.Mock;
  increment: jest.Mock;
  decrement: jest.Mock;
  createQueryBuilder: jest.Mock;
  manager: EntityManager;
};

/**
 * Build a Repository mock with all the methods our services touch.
 * Returns a query-builder factory that yields a fresh chainable mock per call.
 */
export function createMockRepo<T extends ObjectLiteral = ObjectLiteral>(): MockRepo<T> {
  // Single shared querybuilder per repo so that test-side setup (getOne,
  // getRawMany, etc.) survives the service-side createQueryBuilder() call.
  const qb = createMockQueryBuilder();
  return {
    find: jest.fn(),
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    findBy: jest.fn(),
    findAndCount: jest.fn(),
    create: jest.fn((dto) => dto),
    save: jest.fn((entity) => Promise.resolve(entity)),
    update: jest.fn(),
    delete: jest.fn(),
    remove: jest.fn(),
    softRemove: jest.fn(),
    restore: jest.fn(),
    count: jest.fn(),
    increment: jest.fn(),
    decrement: jest.fn(),
    createQueryBuilder: jest.fn(() => qb),
    manager: {} as any,
  } as unknown as MockRepo<T>;
}

export function createMockQueryBuilder(): any {
  const qb: any = {};
  const chainables = [
    'select', 'addSelect', 'where', 'andWhere', 'orWhere', 'leftJoin',
    'leftJoinAndSelect', 'innerJoin', 'innerJoinAndSelect', 'orderBy',
    'addOrderBy', 'groupBy', 'addGroupBy', 'having', 'andHaving', 'limit',
    'offset', 'take', 'skip', 'distinct', 'distinctOn', 'setParameters',
    'setParameter', 'whereInIds', 'cache', 'useTransaction', 'from',
    'fromDummy', 'subQuery', 'execute', 'withDeleted', 'softDelete',
    'restore',
  ];
  for (const m of chainables) {
    qb[m] = jest.fn().mockReturnValue(qb);
  }
  qb.getOne = jest.fn();
  qb.getMany = jest.fn();
  qb.getCount = jest.fn();
  qb.getRawOne = jest.fn();
  qb.getRawMany = jest.fn();
  qb.getManyAndCount = jest.fn();
  qb.update = jest.fn().mockReturnValue(qb);
  qb.set = jest.fn().mockReturnValue(qb);
  qb.delete = jest.fn().mockReturnValue(qb);
  qb.insert = jest.fn().mockReturnValue(qb);
  qb.values = jest.fn().mockReturnValue(qb);
  return qb;
}

/**
 * Build a DataSource mock that supports `transaction(fn)` and `query(...)`.
 * The transaction callback receives a fake EntityManager whose methods
 * delegate to provided per-test mocks.
 */
export function createMockDataSource(
  managerOverrides: Partial<EntityManager> = {},
): jest.Mocked<Partial<DataSource>> {
  const manager: any = {
    save: jest.fn((entity) => Promise.resolve(entity)),
    create: jest.fn((entityClass, dto) => dto),
    find: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    remove: jest.fn(),
    query: jest.fn(),
    getRepository: jest.fn(),
    ...managerOverrides,
  };
  return {
    transaction: jest.fn(async (cb: any) => cb(manager)),
    query: jest.fn(),
    manager,
  } as any;
}

/**
 * Build a mock NestJS ExecutionContext for guard testing.
 */
export function createMockExecutionContext(opts: {
  user?: any;
  isAuthenticated?: boolean;
  reflectorReturn?: any;
} = {}): any {
  const { user, isAuthenticated = true } = opts;
  const request: any = {
    user,
    isAuthenticated: jest.fn(() => isAuthenticated),
    ip: '127.0.0.1',
    get: jest.fn(() => 'jest-test-agent'),
    session: { destroy: jest.fn((cb) => cb(null)) },
    logout: jest.fn((cb) => cb(null)),
  };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({ clearCookie: jest.fn() }),
    }),
    getHandler: () => () => undefined,
    getClass: () => class {},
    getType: () => 'http',
    _request: request,
  };
}
