import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { User } from '../../entities/user.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LocalStrategy } from './strategies/local.strategy';
import { SessionSerializer } from './session.serializer';
import { AuthenticatedGuard } from './guards/authenticated.guard';
import { RolesGuard } from './guards/roles.guard';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    PassportModule.register({ session: true }),
    AuditModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    LocalStrategy,
    SessionSerializer,
    AuthenticatedGuard,
    RolesGuard,
  ],
  exports: [AuthService, AuthenticatedGuard, RolesGuard],
})
export class AuthModule implements OnModuleInit {
  constructor(private authService: AuthService) {}

  /**
   * Ensure admin user exists on module initialization.
   */
  async onModuleInit() {
    await this.authService.ensureAdminExists();
  }
}
