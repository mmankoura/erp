import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { AuthenticatedGuard } from './guards/authenticated.guard';
import { RolesGuard } from './guards/roles.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { Roles } from './decorators/roles.decorator';
import { Public } from './decorators/public.decorator';
import { CreateUserDto, UpdateUserDto, LoginDto } from './dto';
import { User, UserRole } from '../../entities/user.entity';
import { AuditService } from '../audit/audit.service';
import { AuditEventType, AuditEntityType } from '../../entities/audit-event.entity';

// Extend Express Request type to include Passport session methods
interface RequestWithUser extends Request {
  user?: User;
}

@Controller('auth')
@UseGuards(AuthenticatedGuard, RolesGuard)
export class AuthController {
  constructor(
    private authService: AuthService,
    private auditService: AuditService,
  ) {}

  /**
   * POST /api/auth/login
   * Login with username/email and password
   */
  @Public()
  @UseGuards(LocalAuthGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() _loginDto: LoginDto,
    @Req() req: RequestWithUser,
  ): Promise<{ user: Omit<User, 'password_hash'>; message: string }> {
    const user = req.user!;

    // Audit log
    await this.auditService.emit({
      event_type: AuditEventType.USER_LOGIN,
      entity_type: AuditEntityType.USER,
      entity_id: user.id,
      actor: user.username,
      metadata: {
        ip_address: req.ip,
        user_agent: req.get('user-agent'),
      },
    });

    return {
      user,
      message: 'Login successful',
    };
  }

  /**
   * POST /api/auth/logout
   * Logout current user and destroy session
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @CurrentUser() user: User,
    @Req() req: RequestWithUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ message: string }> {
    // Audit log before destroying session
    await this.auditService.emit({
      event_type: AuditEventType.USER_LOGOUT,
      entity_type: AuditEntityType.USER,
      entity_id: user.id,
      actor: user.username,
    });

    return new Promise((resolve, reject) => {
      req.logout((err: Error | null) => {
        if (err) {
          reject(err);
          return;
        }
        req.session.destroy((err: Error | null) => {
          if (err) {
            reject(err);
            return;
          }
          res.clearCookie('connect.sid');
          resolve({ message: 'Logout successful' });
        });
      });
    });
  }

  /**
   * GET /api/auth/me
   * Get current authenticated user
   */
  @Get('me')
  getMe(@CurrentUser() user: User): Omit<User, 'password_hash'> {
    return user;
  }

  /**
   * GET /api/auth/users
   * List all users (admin only)
   */
  @Get('users')
  @Roles(UserRole.ADMIN)
  async getUsers(): Promise<User[]> {
    return this.authService.findAll();
  }

  /**
   * POST /api/auth/users
   * Create a new user (admin only)
   */
  @Post('users')
  @Roles(UserRole.ADMIN)
  async createUser(
    @Body() dto: CreateUserDto,
    @CurrentUser() currentUser: User,
  ): Promise<User> {
    return this.authService.createUser(dto, currentUser);
  }

  /**
   * PATCH /api/auth/users/:id
   * Update a user (admin only)
   */
  @Patch('users/:id')
  @Roles(UserRole.ADMIN)
  async updateUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() currentUser: User,
  ): Promise<User> {
    return this.authService.updateUser(id, dto, currentUser);
  }

  /**
   * DELETE /api/auth/users/:id/sessions
   * Invalidate all sessions for a user (admin only)
   * Note: This requires manual session store cleanup since connect-pg-simple
   * stores sessions by session ID, not user ID
   */
  @Delete('users/:id/sessions')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async invalidateSessions(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ message: string }> {
    // For connect-pg-simple, we can't easily invalidate sessions by user ID
    // The recommended approach is to deactivate the user, which will cause
    // the AuthenticatedGuard to reject subsequent requests
    const user = await this.authService.findById(id);
    if (!user) {
      return { message: 'User not found' };
    }

    // The user's sessions will be invalid on next request due to is_active check
    return {
      message: `Sessions for user ${user.username} will be invalid on next request if user is deactivated`,
    };
  }
}
