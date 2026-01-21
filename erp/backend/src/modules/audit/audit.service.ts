import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThanOrEqual, LessThanOrEqual } from 'typeorm';
import {
  AuditEvent,
  AuditEventType,
  AuditEntityType,
  AuditMetadata,
} from '../../entities/audit-event.entity';

export interface CreateAuditEventDto {
  event_type: AuditEventType | string;
  entity_type: AuditEntityType | string;
  entity_id: string;
  actor?: string;
  old_value?: Record<string, any> | null;
  new_value?: Record<string, any> | null;
  metadata?: AuditMetadata;
}

export interface AuditQueryFilters {
  entity_type?: string;
  entity_id?: string;
  event_type?: string;
  actor?: string;
  from_date?: Date;
  to_date?: Date;
  limit?: number;
  offset?: number;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditEvent)
    private readonly auditRepository: Repository<AuditEvent>,
  ) {}

  /**
   * Record an audit event.
   * This is the primary method for emitting audit events from other services.
   */
  async emit(dto: CreateAuditEventDto): Promise<AuditEvent> {
    const event = this.auditRepository.create({
      event_type: dto.event_type,
      entity_type: dto.entity_type,
      entity_id: dto.entity_id,
      actor: dto.actor ?? null,
      old_value: dto.old_value ?? null,
      new_value: dto.new_value ?? null,
      metadata: dto.metadata ?? null,
    });

    const saved = await this.auditRepository.save(event);

    this.logger.debug(
      `Audit event: ${dto.event_type} on ${dto.entity_type}:${dto.entity_id} by ${dto.actor ?? 'system'}`,
    );

    return saved;
  }

  /**
   * Convenience method for recording state changes.
   * Automatically captures old and new values.
   */
  async emitStateChange(
    eventType: AuditEventType | string,
    entityType: AuditEntityType | string,
    entityId: string,
    oldState: Record<string, any>,
    newState: Record<string, any>,
    actor?: string,
    metadata?: AuditMetadata,
  ): Promise<AuditEvent> {
    return this.emit({
      event_type: eventType,
      entity_type: entityType,
      entity_id: entityId,
      actor,
      old_value: oldState,
      new_value: newState,
      metadata,
    });
  }

  /**
   * Convenience method for recording creation events.
   */
  async emitCreate(
    eventType: AuditEventType | string,
    entityType: AuditEntityType | string,
    entityId: string,
    newValue: Record<string, any>,
    actor?: string,
    metadata?: AuditMetadata,
  ): Promise<AuditEvent> {
    return this.emit({
      event_type: eventType,
      entity_type: entityType,
      entity_id: entityId,
      actor,
      old_value: null,
      new_value: newValue,
      metadata,
    });
  }

  /**
   * Convenience method for recording deletion events.
   */
  async emitDelete(
    eventType: AuditEventType | string,
    entityType: AuditEntityType | string,
    entityId: string,
    oldValue: Record<string, any>,
    actor?: string,
    metadata?: AuditMetadata,
  ): Promise<AuditEvent> {
    return this.emit({
      event_type: eventType,
      entity_type: entityType,
      entity_id: entityId,
      actor,
      old_value: oldValue,
      new_value: null,
      metadata,
    });
  }

  /**
   * Get audit history for a specific entity.
   */
  async getEntityHistory(
    entityType: string,
    entityId: string,
    limit: number = 100,
  ): Promise<AuditEvent[]> {
    return this.auditRepository.find({
      where: { entity_type: entityType, entity_id: entityId },
      order: { created_at: 'DESC' },
      take: limit,
    });
  }

  /**
   * Get audit events by actor.
   */
  async getByActor(actor: string, limit: number = 100): Promise<AuditEvent[]> {
    return this.auditRepository.find({
      where: { actor },
      order: { created_at: 'DESC' },
      take: limit,
    });
  }

  /**
   * Get audit events by type.
   */
  async getByEventType(
    eventType: string,
    limit: number = 100,
  ): Promise<AuditEvent[]> {
    return this.auditRepository.find({
      where: { event_type: eventType },
      order: { created_at: 'DESC' },
      take: limit,
    });
  }

  /**
   * Query audit events with flexible filters.
   */
  async query(filters: AuditQueryFilters): Promise<AuditEvent[]> {
    const where: any = {};

    if (filters.entity_type) {
      where.entity_type = filters.entity_type;
    }
    if (filters.entity_id) {
      where.entity_id = filters.entity_id;
    }
    if (filters.event_type) {
      where.event_type = filters.event_type;
    }
    if (filters.actor) {
      where.actor = filters.actor;
    }

    // Handle date filters
    if (filters.from_date && filters.to_date) {
      where.created_at = Between(filters.from_date, filters.to_date);
    } else if (filters.from_date) {
      where.created_at = MoreThanOrEqual(filters.from_date);
    } else if (filters.to_date) {
      where.created_at = LessThanOrEqual(filters.to_date);
    }

    return this.auditRepository.find({
      where,
      order: { created_at: 'DESC' },
      take: filters.limit ?? 100,
      skip: filters.offset ?? 0,
    });
  }

  /**
   * Get recent audit events across all entities.
   */
  async getRecentEvents(limit: number = 50): Promise<AuditEvent[]> {
    return this.auditRepository.find({
      order: { created_at: 'DESC' },
      take: limit,
    });
  }

  /**
   * Count events by type (useful for dashboards/analytics).
   */
  async countByEventType(): Promise<Record<string, number>> {
    const results = await this.auditRepository
      .createQueryBuilder('audit')
      .select('audit.event_type', 'event_type')
      .addSelect('COUNT(*)', 'count')
      .groupBy('audit.event_type')
      .getRawMany<{ event_type: string; count: string }>();

    const counts: Record<string, number> = {};
    for (const row of results) {
      counts[row.event_type] = parseInt(row.count, 10);
    }
    return counts;
  }

  /**
   * Get events within a time window (useful for compliance reporting).
   */
  async getEventsInWindow(
    fromDate: Date,
    toDate: Date,
    entityType?: string,
  ): Promise<AuditEvent[]> {
    const where: any = {
      created_at: Between(fromDate, toDate),
    };

    if (entityType) {
      where.entity_type = entityType;
    }

    return this.auditRepository.find({
      where,
      order: { created_at: 'ASC' },
    });
  }
}
