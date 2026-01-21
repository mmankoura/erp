import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditEvent } from '../../entities/audit-event.entity';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';

/**
 * Global audit module.
 * Marked as @Global() so AuditService can be injected anywhere without explicit imports.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AuditEvent])],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
