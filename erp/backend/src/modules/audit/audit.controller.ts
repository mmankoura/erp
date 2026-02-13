import { Controller, Get, Query, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { AuditService, AuditQueryFilters } from './audit.service';
import { AuditEvent } from '../../entities/audit-event.entity';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

@Controller('audit')
@UseGuards(AuthenticatedGuard, RolesGuard) // Read-only, all authenticated users can access
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  /**
   * Get recent audit events across all entities.
   */
  @Get()
  async getRecentEvents(
    @Query('limit') limit?: string,
  ): Promise<AuditEvent[]> {
    return this.auditService.getRecentEvents(
      limit ? parseInt(limit, 10) : 50,
    );
  }

  /**
   * Query audit events with filters.
   */
  @Get('query')
  async queryEvents(
    @Query('entity_type') entityType?: string,
    @Query('entity_id') entityId?: string,
    @Query('event_type') eventType?: string,
    @Query('actor') actor?: string,
    @Query('from_date') fromDate?: string,
    @Query('to_date') toDate?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<AuditEvent[]> {
    const filters: AuditQueryFilters = {};

    if (entityType) filters.entity_type = entityType;
    if (entityId) filters.entity_id = entityId;
    if (eventType) filters.event_type = eventType;
    if (actor) filters.actor = actor;
    if (fromDate) filters.from_date = new Date(fromDate);
    if (toDate) filters.to_date = new Date(toDate);
    if (limit) filters.limit = parseInt(limit, 10);
    if (offset) filters.offset = parseInt(offset, 10);

    return this.auditService.query(filters);
  }

  /**
   * Get audit history for a specific entity.
   */
  @Get('entity/:entityType/:entityId')
  async getEntityHistory(
    @Param('entityType') entityType: string,
    @Param('entityId', ParseUUIDPipe) entityId: string,
    @Query('limit') limit?: string,
  ): Promise<AuditEvent[]> {
    return this.auditService.getEntityHistory(
      entityType,
      entityId,
      limit ? parseInt(limit, 10) : 100,
    );
  }

  /**
   * Get audit events by actor.
   */
  @Get('actor/:actor')
  async getByActor(
    @Param('actor') actor: string,
    @Query('limit') limit?: string,
  ): Promise<AuditEvent[]> {
    return this.auditService.getByActor(
      actor,
      limit ? parseInt(limit, 10) : 100,
    );
  }

  /**
   * Get audit events by event type.
   */
  @Get('type/:eventType')
  async getByEventType(
    @Param('eventType') eventType: string,
    @Query('limit') limit?: string,
  ): Promise<AuditEvent[]> {
    return this.auditService.getByEventType(
      eventType,
      limit ? parseInt(limit, 10) : 100,
    );
  }

  /**
   * Get event counts by type (for dashboards).
   */
  @Get('stats/by-type')
  async countByEventType(): Promise<Record<string, number>> {
    return this.auditService.countByEventType();
  }
}
