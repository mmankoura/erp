import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Guard that triggers Passport's local strategy for username/password authentication.
 * Used for the login endpoint. Establishes session after successful auth.
 */
@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Call the parent to run passport authentication
    const result = (await super.canActivate(context)) as boolean;

    // Establish the session (calls serializeUser)
    const request = context.switchToHttp().getRequest();
    await super.logIn(request);

    return result;
  }
}
