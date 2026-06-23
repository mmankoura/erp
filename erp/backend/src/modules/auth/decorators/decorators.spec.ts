import 'reflect-metadata';
import { Public, IS_PUBLIC_KEY } from './public.decorator';
import { Roles, ROLES_KEY } from './roles.decorator';
import { CurrentUser } from './current-user.decorator';
import { UserRole } from '../../../entities/user.entity';

describe('@Public decorator', () => {
  it('attaches IS_PUBLIC_KEY=true metadata to handlers', () => {
    class TestController {
      @Public()
      handler() {}
    }
    const meta = Reflect.getMetadata(IS_PUBLIC_KEY, TestController.prototype.handler);
    expect(meta).toBe(true);
  });

  it('exports the metadata key as a stable string', () => {
    expect(IS_PUBLIC_KEY).toBe('isPublic');
  });
});

describe('@Roles decorator', () => {
  it('attaches the role list to the handler', () => {
    class TestController {
      @Roles(UserRole.ADMIN, UserRole.MANAGER)
      handler() {}
    }
    const meta = Reflect.getMetadata(ROLES_KEY, TestController.prototype.handler);
    expect(meta).toEqual([UserRole.ADMIN, UserRole.MANAGER]);
  });

  it('attaches an empty array when called with no args', () => {
    class TestController {
      @Roles()
      handler() {}
    }
    const meta = Reflect.getMetadata(ROLES_KEY, TestController.prototype.handler);
    expect(meta).toEqual([]);
  });

  it('exports the metadata key as a stable string', () => {
    expect(ROLES_KEY).toBe('roles');
  });
});

describe('@CurrentUser param decorator', () => {
  // The actual decorator is a `createParamDecorator` factory; what we want to
  // verify is that the underlying extractor pulls `request.user` out correctly.
  // We exercise the factory via its decorated symbol shape.
  it('is exported as a function (param decorator factory)', () => {
    expect(typeof CurrentUser).toBe('function');
  });

  it('invoking it returns a parameter decorator', () => {
    const dec = CurrentUser();
    expect(typeof dec).toBe('function');
  });
});
