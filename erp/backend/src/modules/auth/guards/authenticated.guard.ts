import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Guard that checks if the user has an active session.
 * Routes marked with @Public() will bypass this guard.
 */
@Injectable()
export class AuthenticatedGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Check if the route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();

    // Check if user is authenticated via session
    if (!request.isAuthenticated || !request.isAuthenticated()) {
      throw new UnauthorizedException('Authentication required');
    }

    // Check if user is still active
    if (request.user && !request.user.is_active) {
      throw new UnauthorizedException('Account has been deactivated');
    }

    return true;
  }
}
