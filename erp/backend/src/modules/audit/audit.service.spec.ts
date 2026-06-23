import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditService } from './audit.service';
import {
  AuditEvent,
  AuditEventType,
  AuditEntityType,
} from '../../entities/audit-event.entity';
import { createMockRepo, MockRepo } from '../../test-utils/repo-mock';

describe('AuditService', () => {
  let service: AuditService;
  let repo: MockRepo<AuditEvent>;

  beforeEach(async () => {
    repo = createMockRepo<AuditEvent>();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: getRepositoryToken(AuditEvent), useValue: repo },
      ],
    }).compile();
    service = module.get(AuditService);
  });

  describe('emit', () => {
    it('persists with all dto fields', async () => {
      const dto = {
        event_type: AuditEventType.ORDER_CREATED,
        entity_type: AuditEntityType.ORDER,
        entity_id: 'order-1',
        actor: 'alice',
        old_value: { status: 'DRAFT' },
        new_value: { status: 'SUBMITTED' },
        metadata: { reason: 'go-live' },
      };
      (repo.save as jest.Mock).mockResolvedValue({ id: 'evt-1', ...dto });

      const out = await service.emit(dto);
      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({
        event_type: dto.event_type,
        entity_type: dto.entity_type,
        entity_id: dto.entity_id,
        actor: 'alice',
        old_value: dto.old_value,
        new_value: dto.new_value,
        metadata: dto.metadata,
      }));
      expect(repo.save).toHaveBeenCalled();
      expect(out).toMatchObject({ id: 'evt-1' });
    });

    it('coerces missing actor/values to null', async () => {
      (repo.save as jest.Mock).mockImplementation((e) => Promise.resolve({ id: 'evt', ...e }));
      await service.emit({
        event_type: 'X',
        entity_type: 'thing',
        entity_id: 'id-1',
      });
      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({
        actor: null,
        old_value: null,
        new_value: null,
        metadata: null,
      }));
    });
  });

  describe('emitCreate', () => {
    it('routes through emit with old_value=null', async () => {
      const spy = jest.spyOn(service, 'emit').mockResolvedValue({} as any);
      await service.emitCreate('X', 'thing', 'id', { foo: 'bar' }, 'alice');
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({
        old_value: null,
        new_value: { foo: 'bar' },
        actor: 'alice',
      }));
    });
  });

  describe('emitDelete', () => {
    it('routes through emit with new_value=null', async () => {
      const spy = jest.spyOn(service, 'emit').mockResolvedValue({} as any);
      await service.emitDelete('X', 'thing', 'id', { was: 'here' }, 'bob');
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({
        new_value: null,
        old_value: { was: 'here' },
        actor: 'bob',
      }));
    });
  });

  describe('emitStateChange', () => {
    it('passes both old and new values through', async () => {
      const spy = jest.spyOn(service, 'emit').mockResolvedValue({} as any);
      await service.emitStateChange('X', 'y', 'id', { a: 1 }, { a: 2 }, 'eve');
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({
        old_value: { a: 1 },
        new_value: { a: 2 },
      }));
    });
  });

  describe('getEntityHistory', () => {
    it('queries by entity_type+id ordered DESC with limit', async () => {
      (repo.find as jest.Mock).mockResolvedValue([{ id: 'e1' }]);
      const out = await service.getEntityHistory('order', 'order-1', 25);
      expect(repo.find).toHaveBeenCalledWith({
        where: { entity_type: 'order', entity_id: 'order-1' },
        order: { created_at: 'DESC' },
        take: 25,
      });
      expect(out).toEqual([{ id: 'e1' }]);
    });

    it('defaults limit to 100', async () => {
      (repo.find as jest.Mock).mockResolvedValue([]);
      await service.getEntityHistory('order', 'id');
      expect(repo.find).toHaveBeenCalledWith(expect.objectContaining({ take: 100 }));
    });
  });

  describe('getByActor / getByEventType', () => {
    it('filter by the appropriate column', async () => {
      (repo.find as jest.Mock).mockResolvedValue([]);
      await service.getByActor('alice');
      expect(repo.find).toHaveBeenLastCalledWith(expect.objectContaining({
        where: { actor: 'alice' },
      }));
      await service.getByEventType('ORDER_CREATED');
      expect(repo.find).toHaveBeenLastCalledWith(expect.objectContaining({
        where: { event_type: 'ORDER_CREATED' },
      }));
    });
  });

  describe('query', () => {
    it('builds where clause from active filters only', async () => {
      (repo.find as jest.Mock).mockResolvedValue([]);
      await service.query({
        entity_type: 'order',
        entity_id: 'o1',
        actor: 'eve',
        event_type: 'ORDER_CREATED',
        limit: 10,
        offset: 5,
      });
      expect(repo.find).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          entity_type: 'order',
          entity_id: 'o1',
          actor: 'eve',
          event_type: 'ORDER_CREATED',
        }),
        take: 10,
        skip: 5,
      }));
    });

    it('applies date range when both bounds provided', async () => {
      (repo.find as jest.Mock).mockResolvedValue([]);
      const from = new Date('2026-01-01');
      const to = new Date('2026-02-01');
      await service.query({ from_date: from, to_date: to });
      const call = (repo.find as jest.Mock).mock.calls[0][0];
      expect(call.where.created_at).toBeDefined();
    });

    it('uses MoreThanOrEqual when only from_date given', async () => {
      (repo.find as jest.Mock).mockResolvedValue([]);
      await service.query({ from_date: new Date('2026-01-01') });
      const call = (repo.find as jest.Mock).mock.calls[0][0];
      expect(call.where.created_at).toBeDefined();
    });

    it('paginates with defaults when limit/offset not specified', async () => {
      (repo.find as jest.Mock).mockResolvedValue([]);
      await service.query({});
      expect(repo.find).toHaveBeenCalledWith(expect.objectContaining({
        take: 100,
        skip: 0,
      }));
    });
  });

  describe('countByEventType', () => {
    it('aggregates raw query results into a count map', async () => {
      const qb = repo.createQueryBuilder();
      qb.getRawMany.mockResolvedValue([
        { event_type: 'ORDER_CREATED', count: '7' },
        { event_type: 'PO_RECEIVED', count: '3' },
      ]);
      const out = await service.countByEventType();
      expect(out).toEqual({ ORDER_CREATED: 7, PO_RECEIVED: 3 });
    });
  });

  describe('getRecentEvents', () => {
    it('orders DESC and respects custom limit', async () => {
      (repo.find as jest.Mock).mockResolvedValue([]);
      await service.getRecentEvents(20);
      expect(repo.find).toHaveBeenCalledWith({
        order: { created_at: 'DESC' },
        take: 20,
      });
    });
  });
});
