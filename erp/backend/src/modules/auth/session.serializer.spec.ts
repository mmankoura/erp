import { SessionSerializer } from './session.serializer';
import { User, UserRole } from '../../entities/user.entity';

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

describe('SessionSerializer', () => {
  let authService: { findById: jest.Mock };
  let serializer: SessionSerializer;

  beforeEach(() => {
    authService = { findById: jest.fn() };
    serializer = new SessionSerializer(authService as any);
  });

  describe('serializeUser', () => {
    it('stores only the user id in the session', () => {
      const done = jest.fn();
      serializer.serializeUser(buildUser({ id: 'abc' }), done);
      expect(done).toHaveBeenCalledWith(null, 'abc');
    });
  });

  describe('deserializeUser', () => {
    it('looks up the user by id and yields it', async () => {
      const user = buildUser({ id: 'xyz' });
      authService.findById.mockResolvedValue(user);
      const done = jest.fn();

      await serializer.deserializeUser('xyz', done);
      expect(authService.findById).toHaveBeenCalledWith('xyz');
      expect(done).toHaveBeenCalledWith(null, user);
    });

    it('yields null when the user no longer exists', async () => {
      authService.findById.mockResolvedValue(null);
      const done = jest.fn();
      await serializer.deserializeUser('gone', done);
      expect(done).toHaveBeenCalledWith(null, null);
    });
  });
});
