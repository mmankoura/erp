import { Reflector } from '@nestjs/core';
import { UnauthorizedException } from '@nestjs/common';
import { AuthenticatedGuard } from './authenticated.guard';
import { UserRole } from '../../../entities/user.entity';

const buildContext = (opts: {
  isAuthenticated?: boolean;
  user?: any;
} = {}): any => {
  const { isAuthenticated = true, user } = opts;
  const request = {
    user,
    isAuthenticated: jest.fn(() => isAuthenticated),
  };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  };
};

describe('AuthenticatedGuard', () => {
  let reflector: jest.Mocked<Reflector>;
  let guard: AuthenticatedGuard;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() } as any;
    guard = new AuthenticatedGuard(reflector);
  });

  it('allows public routes regardless of auth state', () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    const ctx = buildContext({ isAuthenticated: false });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('rejects unauthenticated requests with UnauthorizedException', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const ctx = buildContext({ isAuthenticated: false });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('rejects when isAuthenticated method is missing entirely', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const ctx: any = {
      switchToHttp: () => ({ getRequest: () => ({ user: undefined }) }),
      getHandler: () => () => undefined,
      getClass: () => class {},
    };
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('rejects deactivated users', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const ctx = buildContext({
      isAuthenticated: true,
      user: { id: 'u1', is_active: false, role: UserRole.OPERATOR },
    });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('allows authenticated active users', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const ctx = buildContext({
      isAuthenticated: true,
      user: { id: 'u1', is_active: true, role: UserRole.MANAGER },
    });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('passes when authenticated but user object is absent (relies on session)', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const ctx = buildContext({ isAuthenticated: true, user: undefined });
    expect(guard.canActivate(ctx)).toBe(true);
  });
});
