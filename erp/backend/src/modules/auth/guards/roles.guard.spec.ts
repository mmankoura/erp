import { Reflector } from '@nestjs/core';
import { ForbiddenException } from '@nestjs/common';
import { RolesGuard } from './roles.guard';
import { UserRole } from '../../../entities/user.entity';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

const buildContext = (user?: any): any => {
  const request = { user };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  };
};

describe('RolesGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    guard = new RolesGuard(reflector as any);
  });

  const setupReflector = (opts: { isPublic?: boolean; roles?: UserRole[] }) => {
    reflector.getAllAndOverride.mockImplementation((key: string) => {
      if (key === IS_PUBLIC_KEY) return opts.isPublic ?? false;
      if (key === ROLES_KEY) return opts.roles;
      return undefined;
    });
  };

  it('allows public routes', () => {
    setupReflector({ isPublic: true });
    expect(guard.canActivate(buildContext())).toBe(true);
  });

  it('allows when no @Roles() decorator present', () => {
    setupReflector({ isPublic: false, roles: undefined });
    expect(guard.canActivate(buildContext({ role: UserRole.OPERATOR }))).toBe(true);
  });

  it('allows when @Roles() decorator is empty', () => {
    setupReflector({ isPublic: false, roles: [] });
    expect(guard.canActivate(buildContext({ role: UserRole.OPERATOR }))).toBe(true);
  });

  it('throws ForbiddenException if user is missing from request', () => {
    setupReflector({ roles: [UserRole.ADMIN] });
    expect(() => guard.canActivate(buildContext(undefined))).toThrow(ForbiddenException);
  });

  it('allows user with matching role', () => {
    setupReflector({ roles: [UserRole.ADMIN, UserRole.MANAGER] });
    expect(guard.canActivate(buildContext({ role: UserRole.MANAGER }))).toBe(true);
  });

  it('blocks user without matching role', () => {
    setupReflector({ roles: [UserRole.ADMIN] });
    expect(() => guard.canActivate(buildContext({ role: UserRole.OPERATOR })))
      .toThrow(ForbiddenException);
  });

  it('error message lists required roles', () => {
    setupReflector({ roles: [UserRole.ADMIN, UserRole.MANAGER] });
    try {
      guard.canActivate(buildContext({ role: UserRole.OPERATOR }));
      fail('expected throw');
    } catch (err: any) {
      expect(err.message).toContain('ADMIN');
      expect(err.message).toContain('MANAGER');
    }
  });
});
