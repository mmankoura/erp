import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../../../entities/user.entity';

export const ROLES_KEY = 'roles';

/**
 * Decorator to specify which roles can access a route.
 * Used with RolesGuard to enforce role-based access control.
 *
 * Usage:
 * @Roles(UserRole.ADMIN, UserRole.MANAGER)
 * @Post()
 * create() {}
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
