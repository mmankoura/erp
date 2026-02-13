import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Decorator to mark a route as public (no authentication required).
 * Routes marked with @Public() will bypass the AuthenticatedGuard.
 *
 * Usage:
 * @Public()
 * @Post('login')
 * login() {}
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
