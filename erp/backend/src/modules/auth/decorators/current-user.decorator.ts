import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { User } from '../../../entities/user.entity';

/**
 * Parameter decorator to get the current authenticated user from the request.
 *
 * Usage:
 * @Get('profile')
 * getProfile(@CurrentUser() user: User) {
 *   return user;
 * }
 */
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): User | undefined => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
