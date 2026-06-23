import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { User, UserRole } from '../../entities/user.entity';
import { AuditService } from '../audit/audit.service';
import { createMockRepo, MockRepo } from '../../test-utils/repo-mock';

jest.mock('bcrypt');

const buildUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 'user-1',
    username: 'alice',
    email: 'alice@example.com',
    full_name: 'Alice',
    role: UserRole.MANAGER,
    is_active: true,
    password_hash: 'hash',
    last_login_at: null,
    created_by: null,
    creator: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  }) as User;

describe('AuthService', () => {
  let service: AuthService;
  let userRepo: MockRepo<User>;
  let auditService: { emit: jest.Mock };

  beforeEach(async () => {
    userRepo = createMockRepo<User>();
    auditService = { emit: jest.fn().mockResolvedValue({} as any) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();
    service = module.get(AuthService);

    (bcrypt.compare as jest.Mock).mockReset();
    (bcrypt.hash as jest.Mock).mockReset();
  });

  describe('validateUser', () => {
    it('returns user without password_hash on valid creds', async () => {
      const user = buildUser({ password_hash: 'h' });
      const qb = userRepo.createQueryBuilder();
      qb.getOne.mockResolvedValue(user);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const out = await service.validateUser('alice', 'pwd');
      expect(out).toBeTruthy();
      expect((out as any).password_hash).toBeUndefined();
      expect((out as any).id).toBe('user-1');
      expect(userRepo.update).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ last_login_at: expect.any(Date) }),
      );
    });

    it('returns null when no user matches', async () => {
      const qb = userRepo.createQueryBuilder();
      qb.getOne.mockResolvedValue(null);
      const out = await service.validateUser('nope', 'pwd');
      expect(out).toBeNull();
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it('returns null when user is inactive', async () => {
      const qb = userRepo.createQueryBuilder();
      qb.getOne.mockResolvedValue(buildUser({ is_active: false }));
      const out = await service.validateUser('alice', 'pwd');
      expect(out).toBeNull();
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it('returns null when password mismatch', async () => {
      const qb = userRepo.createQueryBuilder();
      qb.getOne.mockResolvedValue(buildUser());
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      const out = await service.validateUser('alice', 'wrong');
      expect(out).toBeNull();
    });

    it('queries by username OR email', async () => {
      const qb = userRepo.createQueryBuilder();
      qb.getOne.mockResolvedValue(null);
      await service.validateUser('alice@example.com', 'pwd');
      expect(qb.where).toHaveBeenCalledWith(
        'user.username = :username OR user.email = :username',
        { username: 'alice@example.com' },
      );
    });
  });

  describe('findById / findAll', () => {
    it('findById delegates to repo.findOne', async () => {
      const u = buildUser();
      (userRepo.findOne as jest.Mock).mockResolvedValue(u);
      const out = await service.findById('user-1');
      expect(out).toBe(u);
      expect(userRepo.findOne).toHaveBeenCalledWith({ where: { id: 'user-1' } });
    });

    it('findAll orders by created_at DESC and includes creator relation', async () => {
      (userRepo.find as jest.Mock).mockResolvedValue([]);
      await service.findAll();
      expect(userRepo.find).toHaveBeenCalledWith({
        order: { created_at: 'DESC' },
        relations: ['creator'],
      });
    });
  });

  describe('createUser', () => {
    const createDto = {
      username: 'bob',
      email: 'bob@example.com',
      password: 'secret123',
      full_name: 'Bob',
      role: UserRole.OPERATOR,
    };

    it('rejects when username already exists', async () => {
      (userRepo.findOne as jest.Mock).mockResolvedValueOnce(buildUser());
      await expect(
        service.createUser(createDto, buildUser()),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects when email already exists', async () => {
      (userRepo.findOne as jest.Mock)
        .mockResolvedValueOnce(null) // username
        .mockResolvedValueOnce(buildUser()); // email
      await expect(
        service.createUser(createDto, buildUser()),
      ).rejects.toThrow(ConflictException);
    });

    it('hashes password and persists user, then emits audit', async () => {
      (userRepo.findOne as jest.Mock).mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed');
      (userRepo.save as jest.Mock).mockImplementation((u) => Promise.resolve({ ...u, id: 'new' }));

      const out = await service.createUser(createDto, buildUser({ id: 'admin', username: 'admin' }));
      expect(bcrypt.hash).toHaveBeenCalledWith('secret123', 10);
      expect(userRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        password_hash: 'hashed',
        username: 'bob',
        email: 'bob@example.com',
      }));
      expect(auditService.emit).toHaveBeenCalledWith(expect.objectContaining({
        event_type: 'USER_CREATED',
        actor: 'admin',
      }));
      expect(out.id).toBe('new');
    });

    it('defaults role to OPERATOR and is_active to true when omitted', async () => {
      (userRepo.findOne as jest.Mock).mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('h');
      (userRepo.save as jest.Mock).mockImplementation((u) => Promise.resolve({ ...u, id: 'x' }));

      await service.createUser(
        {
          username: 'nobody',
          password: 'longenough',
          full_name: 'Nobody',
        } as any,
        buildUser(),
      );
      expect(userRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        role: UserRole.OPERATOR,
        is_active: true,
        email: null,
      }));
    });
  });

  describe('updateUser', () => {
    it('throws NotFound when user missing', async () => {
      (userRepo.findOne as jest.Mock).mockResolvedValue(null);
      await expect(
        service.updateUser('missing', { full_name: 'X' } as any, buildUser()),
      ).rejects.toThrow(NotFoundException);
    });

    it('hashes password when provided', async () => {
      const existing = buildUser();
      (userRepo.findOne as jest.Mock).mockResolvedValue(existing);
      (userRepo.save as jest.Mock).mockImplementation((u) => Promise.resolve(u));
      (bcrypt.hash as jest.Mock).mockResolvedValue('newhash');

      await service.updateUser(
        existing.id,
        { password: 'newpassword' } as any,
        buildUser({ id: 'admin', username: 'admin' }),
      );
      expect(bcrypt.hash).toHaveBeenCalledWith('newpassword', 10);
      expect(existing.password_hash).toBe('newhash');
    });

    it('does not rehash when password not in DTO', async () => {
      const existing = buildUser({ password_hash: 'orig' });
      (userRepo.findOne as jest.Mock).mockResolvedValue(existing);
      (userRepo.save as jest.Mock).mockImplementation((u) => Promise.resolve(u));

      await service.updateUser(existing.id, { full_name: 'A2' } as any, buildUser());
      expect(bcrypt.hash).not.toHaveBeenCalled();
      expect(existing.password_hash).toBe('orig');
    });

    it('emits audit event with old and new values', async () => {
      const existing = buildUser({ full_name: 'Old', role: UserRole.OPERATOR });
      (userRepo.findOne as jest.Mock).mockResolvedValue(existing);
      (userRepo.save as jest.Mock).mockImplementation((u) => Promise.resolve(u));

      await service.updateUser(
        existing.id,
        { full_name: 'New', role: UserRole.MANAGER } as any,
        buildUser({ id: 'admin', username: 'admin' }),
      );
      expect(auditService.emit).toHaveBeenCalledWith(expect.objectContaining({
        event_type: 'USER_UPDATED',
        old_value: expect.objectContaining({ full_name: 'Old', role: UserRole.OPERATOR }),
        new_value: expect.objectContaining({ full_name: 'New', role: UserRole.MANAGER }),
      }));
    });
  });

  describe('ensureAdminExists', () => {
    it('creates default admin when no users exist', async () => {
      (userRepo.count as jest.Mock).mockResolvedValue(0);
      (bcrypt.hash as jest.Mock).mockResolvedValue('h');
      (userRepo.save as jest.Mock).mockImplementation((u) => Promise.resolve(u));
      const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);

      await service.ensureAdminExists();
      expect(userRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        username: 'admin',
        role: UserRole.ADMIN,
        is_active: true,
      }));
      log.mockRestore();
    });

    it('does nothing when users already exist', async () => {
      (userRepo.count as jest.Mock).mockResolvedValue(1);
      await service.ensureAdminExists();
      expect(userRepo.save).not.toHaveBeenCalled();
      expect(userRepo.create).not.toHaveBeenCalled();
    });
  });
});
