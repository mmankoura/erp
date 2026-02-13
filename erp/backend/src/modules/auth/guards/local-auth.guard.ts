import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Guard that triggers Passport's local strategy for username/password authentication.
 * Used for the login endpoint.
 */
@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {}
