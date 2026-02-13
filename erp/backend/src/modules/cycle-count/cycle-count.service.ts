import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import {
  CycleCount,
  CycleCountStatus,
  CycleCountType,
} from '../../entities/cycle-count.entity';
import {
  CycleCountItem,
  CycleCountItemStatus,
} from '../../entities/cycle-count-item.entity';
import { Material } from '../../entities/material.entity';
import { InventoryLot } from '../../entities/inventory-lot.entity';
import {
  InventoryTransaction,
  TransactionType,
  ReferenceType,
  OwnerType,
} from '../../entities/inventory-transaction.entity';
import { AuditService } from '../audit/audit.service';
import {
  AuditEventType,
  AuditEntityType,
} from '../../entities/audit-event.entity';

export interface CreateCycleCountInput {
  count_type: CycleCountType;
  scheduled_date: string;
  material_ids?: string[];
  lot_ids?: string[];
  notes?: string;
  created_by?: string;
}

export interface CountEntryInput {
  item_id: string;
  counted_quantity: number;
  notes?: string;
  counted_by?: string;
}

export interface CycleCountSummary {
  id: string;
  count_number: string;
  status: CycleCountStatus;
  count_type: CycleCountType;
  scheduled_date: Date;
  total_items: number;
  items_counted: number;
  items_with_variance: number;
  total_variance_value: number;
}

@Injectable()
export class CycleCountService {
  private readonly logger = new Logger(CycleCountService.name);

  constructor(
    @InjectRepository(CycleCount)
    private readonly cycleCountRepository: Repository<CycleCount>,
    @InjectRepository(CycleCountItem)
    private readonly cycleCountItemRepository: Repository<CycleCountItem>,
    @InjectRepository(Material)
    private readonly materialRepository: Repository<Material>,
    @InjectRepository(InventoryLot)
    private readonly lotRepository: Repository<InventoryLot>,
    @InjectRepository(InventoryTransaction)
    private readonly transactionRepository: Repository<InventoryTransaction>,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  // ==================== CYCLE COUNT CRUD ====================

  /**
   * Generate next count number (CC-YYYYMMDD-NNN)
   */
  private async generateCountNumber(): Promise<string> {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `CC-${dateStr}-`;

    const lastCount = await this.cycleCountRepository
      .createQueryBuilder('cc')
      .where('cc.count_number LIKE :prefix', { prefix: `${prefix}%` })
      .orderBy('cc.count_number', 'DESC')
      .getOne();

    let sequence = 1;
    if (lastCount) {
      const lastSeq = parseInt(lastCount.count_number.slice(-3), 10);
      sequence = lastSeq + 1;
    }

    return `${prefix}${sequence.toString().padStart(3, '0')}`;
  }

  /**
   * Get quantity on hand for a material
   */
  private async getQuantityOnHand(materialId: string): Promise<number> {
    const result = await this.transactionRepository
      .createQueryBuilder('t')
      .select('COALESCE(SUM(t.quantity), 0)', 'quantity_on_hand')
      .where('t.material_id = :materialId', { materialId })
      .getRawOne<{ quantity_on_hand: string }>();

    return parseFloat(result?.quantity_on_hand ?? '0');
  }

  /**
   * Create a new cycle count
   */
  async createCycleCount(input: CreateCycleCountInput): Promise<CycleCount> {
    const countNumber = await this.generateCountNumber();

    // Validate material_ids if provided
    let materials: Material[] = [];
    if (input.material_ids && input.material_ids.length > 0) {
      materials = await this.materialRepository.find({
        where: { id: In(input.material_ids), deleted_at: undefined },
      });

      if (materials.length !== input.material_ids.length) {
        throw new BadRequestException('One or more materials not found');
      }
    }

    // Validate lot_ids if provided
    let lots: InventoryLot[] = [];
    if (input.lot_ids && input.lot_ids.length > 0) {
      lots = await this.lotRepository.find({
        where: { id: In(input.lot_ids) },
        relations: ['material'],
      });

      if (lots.length !== input.lot_ids.length) {
        throw new BadRequestException('One or more lots not found');
      }
    }

    // For FULL count, get all materials with inventory
    if (input.count_type === CycleCountType.FULL && !input.material_ids?.length) {
      const materialsWithStock = await this.transactionRepository
        .createQueryBuilder('t')
        .select('DISTINCT t.material_id', 'material_id')
        .getRawMany<{ material_id: string }>();

      const materialIds = materialsWithStock.map((m) => m.material_id);
      if (materialIds.length > 0) {
        materials = await this.materialRepository.find({
          where: { id: In(materialIds), deleted_at: undefined },
        });
      }
    }

    const cycleCount = this.cycleCountRepository.create({
      count_number: countNumber,
      status: CycleCountStatus.PLANNED,
      count_type: input.count_type,
      scheduled_date: new Date(input.scheduled_date),
      created_by: input.created_by ?? null,
      notes: input.notes ?? null,
      total_items: materials.length + lots.length,
    });

    const savedCount = await this.cycleCountRepository.save(cycleCount);

    // Create count items for materials (material-level counting)
    if (materials.length > 0 && !input.lot_ids?.length) {
      const items = materials.map((material) => {
        return this.cycleCountItemRepository.create({
          cycle_count_id: savedCount.id,
          material_id: material.id,
          lot_id: null,
          status: CycleCountItemStatus.PENDING,
          system_quantity: 0, // Will be populated when count starts
          unit_cost: material.standard_cost ?? null,
        });
      });

      await this.cycleCountItemRepository.save(items);
    }

    // Create count items for lots (lot-level counting)
    if (lots.length > 0) {
      const items = lots.map((lot) => {
        return this.cycleCountItemRepository.create({
          cycle_count_id: savedCount.id,
          material_id: lot.material_id,
          lot_id: lot.id,
          status: CycleCountItemStatus.PENDING,
          system_quantity: parseFloat(String(lot.quantity)),
          unit_cost: lot.unit_cost ?? lot.material?.standard_cost ?? null,
        });
      });

      await this.cycleCountItemRepository.save(items);
    }

    // Emit audit event
    await this.auditService.emit({
      event_type: AuditEventType.CYCLE_COUNT_CREATED,
      entity_type: AuditEntityType.CYCLE_COUNT,
      entity_id: savedCount.id,
      actor: input.created_by,
      new_value: {
        count_number: countNumber,
        count_type: input.count_type,
        scheduled_date: input.scheduled_date,
        total_items: savedCount.total_items,
      },
    });

    return this.findById(savedCount.id);
  }

  /**
   * Find a cycle count by ID
   */
  async findById(id: string): Promise<CycleCount> {
    const cycleCount = await this.cycleCountRepository.findOne({
      where: { id },
      relations: ['items', 'items.material', 'items.lot'],
    });

    if (!cycleCount) {
      throw new NotFoundException(`Cycle count with ID "${id}" not found`);
    }

    return cycleCount;
  }

  /**
   * Find all cycle counts with optional filtering
   */
  async findAll(options?: {
    status?: CycleCountStatus;
    from_date?: string;
    to_date?: string;
  }): Promise<CycleCount[]> {
    const query = this.cycleCountRepository
      .createQueryBuilder('cc')
      .leftJoinAndSelect('cc.items', 'items')
      .orderBy('cc.scheduled_date', 'DESC');

    if (options?.status) {
      query.andWhere('cc.status = :status', { status: options.status });
    }

    if (options?.from_date) {
      query.andWhere('cc.scheduled_date >= :from_date', { from_date: options.from_date });
    }

    if (options?.to_date) {
      query.andWhere('cc.scheduled_date <= :to_date', { to_date: options.to_date });
    }

    return query.getMany();
  }

  // ==================== COUNTING WORKFLOW ====================

  /**
   * Start a cycle count - captures current system quantities
   */
  async startCount(id: string, startedBy?: string): Promise<CycleCount> {
    const cycleCount = await this.findById(id);

    if (cycleCount.status !== CycleCountStatus.PLANNED) {
      throw new BadRequestException(
        `Cannot start cycle count with status "${cycleCount.status}"`,
      );
    }

    // Capture current system quantities for each item
    await this.dataSource.transaction(async (manager) => {
      for (const item of cycleCount.items) {
        if (item.lot_id) {
          // Lot-level: use lot quantity
          const lot = await manager.findOne(InventoryLot, {
            where: { id: item.lot_id },
          });
          item.system_quantity = parseFloat(String(lot?.quantity ?? 0));
        } else {
          // Material-level: calculate from transactions
          const result = await manager
            .createQueryBuilder(InventoryTransaction, 't')
            .select('COALESCE(SUM(t.quantity), 0)', 'quantity_on_hand')
            .where('t.material_id = :materialId', { materialId: item.material_id })
            .getRawOne<{ quantity_on_hand: string }>();

          item.system_quantity = parseFloat(result?.quantity_on_hand ?? '0');
        }

        await manager.save(CycleCountItem, item);
      }

      // Update cycle count status
      cycleCount.status = CycleCountStatus.IN_PROGRESS;
      cycleCount.started_at = new Date();
      cycleCount.counted_by = startedBy ?? null;
      await manager.save(CycleCount, cycleCount);
    });

    // Emit audit event
    await this.auditService.emit({
      event_type: AuditEventType.CYCLE_COUNT_STARTED,
      entity_type: AuditEntityType.CYCLE_COUNT,
      entity_id: id,
      actor: startedBy,
      new_value: {
        count_number: cycleCount.count_number,
        started_at: cycleCount.started_at,
      },
    });

    return this.findById(id);
  }

  /**
   * Record a count entry for an item
   */
  async recordCount(
    countId: string,
    input: CountEntryInput,
  ): Promise<CycleCountItem> {
    const cycleCount = await this.findById(countId);

    if (cycleCount.status !== CycleCountStatus.IN_PROGRESS) {
      throw new BadRequestException(
        `Cannot record counts for cycle count with status "${cycleCount.status}"`,
      );
    }

    const item = cycleCount.items.find((i) => i.id === input.item_id);
    if (!item) {
      throw new NotFoundException(
        `Count item "${input.item_id}" not found in this cycle count`,
      );
    }

    // Check if this is a recount
    const isRecount = item.status === CycleCountItemStatus.COUNTED;

    if (isRecount) {
      item.previous_counted_quantity = item.counted_quantity;
      item.recount_number += 1;
      item.status = CycleCountItemStatus.RECOUNTED;
    } else {
      item.status = CycleCountItemStatus.COUNTED;
    }

    // Record the count
    item.counted_quantity = input.counted_quantity;
    item.counted_at = new Date();
    item.counted_by = input.counted_by ?? null;
    item.notes = input.notes ?? item.notes;

    // Calculate variance
    item.variance = input.counted_quantity - parseFloat(String(item.system_quantity));

    // Calculate variance percentage (avoid division by zero)
    if (parseFloat(String(item.system_quantity)) !== 0) {
      item.variance_percent = (item.variance / parseFloat(String(item.system_quantity))) * 100;
    } else if (input.counted_quantity > 0) {
      item.variance_percent = 100; // Found inventory that wasn't in system
    } else {
      item.variance_percent = 0;
    }

    // Calculate variance value
    if (item.unit_cost) {
      item.variance_value = item.variance * parseFloat(String(item.unit_cost));
    }

    await this.cycleCountItemRepository.save(item);

    // Update cycle count statistics
    await this.updateCountStatistics(countId);

    // Emit audit event
    await this.auditService.emit({
      event_type: isRecount
        ? AuditEventType.CYCLE_COUNT_ITEM_RECOUNTED
        : AuditEventType.CYCLE_COUNT_ITEM_COUNTED,
      entity_type: AuditEntityType.CYCLE_COUNT_ITEM,
      entity_id: item.id,
      actor: input.counted_by,
      new_value: {
        cycle_count_id: countId,
        material_id: item.material_id,
        system_quantity: item.system_quantity,
        counted_quantity: item.counted_quantity,
        variance: item.variance,
        variance_percent: item.variance_percent,
      },
    });

    return this.cycleCountItemRepository.findOne({
      where: { id: item.id },
      relations: ['material', 'lot'],
    }) as Promise<CycleCountItem>;
  }

  /**
   * Update cycle count statistics after count entries
   */
  private async updateCountStatistics(countId: string): Promise<void> {
    const items = await this.cycleCountItemRepository.find({
      where: { cycle_count_id: countId },
    });

    const itemsCounted = items.filter(
      (i) =>
        i.status === CycleCountItemStatus.COUNTED ||
        i.status === CycleCountItemStatus.RECOUNTED ||
        i.status === CycleCountItemStatus.APPROVED ||
        i.status === CycleCountItemStatus.ADJUSTED,
    ).length;

    const itemsWithVariance = items.filter(
      (i) => i.variance !== null && i.variance !== 0,
    ).length;

    const totalVarianceValue = items.reduce(
      (sum, i) => sum + (parseFloat(String(i.variance_value)) || 0),
      0,
    );

    await this.cycleCountRepository.update(countId, {
      items_counted: itemsCounted,
      items_with_variance: itemsWithVariance,
      total_variance_value: totalVarianceValue,
    });
  }

  /**
   * Complete counting and move to pending review
   */
  async completeCount(id: string, completedBy?: string): Promise<CycleCount> {
    const cycleCount = await this.findById(id);

    if (cycleCount.status !== CycleCountStatus.IN_PROGRESS) {
      throw new BadRequestException(
        `Cannot complete cycle count with status "${cycleCount.status}"`,
      );
    }

    // Check all items have been counted
    const pendingItems = cycleCount.items.filter(
      (i) => i.status === CycleCountItemStatus.PENDING,
    );

    if (pendingItems.length > 0) {
      throw new BadRequestException(
        `${pendingItems.length} items have not been counted yet`,
      );
    }

    cycleCount.status = CycleCountStatus.PENDING_REVIEW;
    cycleCount.completed_at = new Date();
    await this.cycleCountRepository.save(cycleCount);

    // Emit audit event
    await this.auditService.emit({
      event_type: AuditEventType.CYCLE_COUNT_COMPLETED,
      entity_type: AuditEntityType.CYCLE_COUNT,
      entity_id: id,
      actor: completedBy,
      new_value: {
        count_number: cycleCount.count_number,
        completed_at: cycleCount.completed_at,
        items_counted: cycleCount.items_counted,
        items_with_variance: cycleCount.items_with_variance,
        total_variance_value: cycleCount.total_variance_value,
      },
    });

    return this.findById(id);
  }

  // ==================== APPROVAL & ADJUSTMENTS ====================

  /**
   * Approve a cycle count and create adjustment transactions
   */
  async approveCount(
    id: string,
    approvedBy?: string,
    approveItemIds?: string[],
  ): Promise<CycleCount> {
    const cycleCount = await this.findById(id);

    if (cycleCount.status !== CycleCountStatus.PENDING_REVIEW) {
      throw new BadRequestException(
        `Cannot approve cycle count with status "${cycleCount.status}"`,
      );
    }

    // Determine which items to approve
    const itemsToApprove = approveItemIds
      ? cycleCount.items.filter((i) => approveItemIds.includes(i.id))
      : cycleCount.items.filter(
          (i) =>
            i.status === CycleCountItemStatus.COUNTED ||
            i.status === CycleCountItemStatus.RECOUNTED,
        );

    await this.dataSource.transaction(async (manager) => {
      for (const item of itemsToApprove) {
        if (item.variance !== null && item.variance !== 0) {
          // Create adjustment transaction
          const transaction = manager.create(InventoryTransaction, {
            material_id: item.material_id,
            transaction_type: TransactionType.ADJUSTMENT,
            quantity: item.variance,
            reference_type: ReferenceType.CYCLE_COUNT,
            reference_id: cycleCount.id,
            reason: `Cycle count ${cycleCount.count_number} adjustment`,
            created_by: approvedBy ?? null,
            lot_id: item.lot_id,
            owner_type: OwnerType.COMPANY,
          });

          const savedTx = await manager.save(InventoryTransaction, transaction);

          // Update item with transaction reference
          item.adjustment_transaction_id = savedTx.id;
          item.status = CycleCountItemStatus.ADJUSTED;

          // Emit adjustment audit event
          await this.auditService.emit({
            event_type: AuditEventType.CYCLE_COUNT_ADJUSTMENT,
            entity_type: AuditEntityType.INVENTORY_TRANSACTION,
            entity_id: savedTx.id,
            actor: approvedBy,
            new_value: {
              cycle_count_id: cycleCount.id,
              cycle_count_number: cycleCount.count_number,
              material_id: item.material_id,
              variance: item.variance,
              variance_value: item.variance_value,
            },
          });
        } else {
          item.status = CycleCountItemStatus.APPROVED;
        }

        item.approved_by = approvedBy ?? null;
        item.approved_at = new Date();
        await manager.save(CycleCountItem, item);
      }

      // Update cycle count status
      const allItemsProcessed = cycleCount.items.every(
        (i) =>
          i.status === CycleCountItemStatus.APPROVED ||
          i.status === CycleCountItemStatus.ADJUSTED ||
          i.status === CycleCountItemStatus.SKIPPED,
      );

      if (allItemsProcessed) {
        cycleCount.status = CycleCountStatus.APPROVED;
        cycleCount.approved_at = new Date();
        cycleCount.approved_by = approvedBy ?? null;
        await manager.save(CycleCount, cycleCount);
      }
    });

    // Emit audit event
    await this.auditService.emit({
      event_type: AuditEventType.CYCLE_COUNT_APPROVED,
      entity_type: AuditEntityType.CYCLE_COUNT,
      entity_id: id,
      actor: approvedBy,
      new_value: {
        count_number: cycleCount.count_number,
        items_approved: itemsToApprove.length,
        approved_at: cycleCount.approved_at,
      },
    });

    return this.findById(id);
  }

  /**
   * Cancel a cycle count
   */
  async cancelCount(id: string, cancelledBy?: string, reason?: string): Promise<CycleCount> {
    const cycleCount = await this.findById(id);

    if (cycleCount.status === CycleCountStatus.APPROVED) {
      throw new BadRequestException('Cannot cancel an approved cycle count');
    }

    cycleCount.status = CycleCountStatus.CANCELLED;
    cycleCount.notes = reason
      ? `${cycleCount.notes ?? ''}\nCancelled: ${reason}`.trim()
      : cycleCount.notes;

    await this.cycleCountRepository.save(cycleCount);

    // Emit audit event
    await this.auditService.emit({
      event_type: AuditEventType.CYCLE_COUNT_CANCELLED,
      entity_type: AuditEntityType.CYCLE_COUNT,
      entity_id: id,
      actor: cancelledBy,
      new_value: {
        count_number: cycleCount.count_number,
        reason,
      },
    });

    return cycleCount;
  }

  /**
   * Skip an item (e.g., material not found in location)
   */
  async skipItem(
    countId: string,
    itemId: string,
    reason?: string,
    skippedBy?: string,
  ): Promise<CycleCountItem> {
    const cycleCount = await this.findById(countId);

    if (
      cycleCount.status !== CycleCountStatus.IN_PROGRESS &&
      cycleCount.status !== CycleCountStatus.PENDING_REVIEW
    ) {
      throw new BadRequestException(
        `Cannot skip items for cycle count with status "${cycleCount.status}"`,
      );
    }

    const item = cycleCount.items.find((i) => i.id === itemId);
    if (!item) {
      throw new NotFoundException(`Count item "${itemId}" not found`);
    }

    item.status = CycleCountItemStatus.SKIPPED;
    item.notes = reason ?? 'Skipped';
    item.counted_by = skippedBy ?? null;
    item.counted_at = new Date();

    await this.cycleCountItemRepository.save(item);
    await this.updateCountStatistics(countId);

    return item;
  }

  // ==================== REPORTING ====================

  /**
   * Get variance report for a cycle count
   */
  async getVarianceReport(id: string): Promise<{
    cycle_count: CycleCountSummary;
    items: Array<{
      material_id: string;
      internal_part_number: string;
      description: string | null;
      lot_uid: string | null;
      system_quantity: number;
      counted_quantity: number | null;
      variance: number | null;
      variance_percent: number | null;
      variance_value: number | null;
      status: CycleCountItemStatus;
    }>;
    totals: {
      total_items: number;
      items_with_positive_variance: number;
      items_with_negative_variance: number;
      total_positive_variance_value: number;
      total_negative_variance_value: number;
      net_variance_value: number;
    };
  }> {
    const cycleCount = await this.findById(id);

    const items = cycleCount.items.map((item) => ({
      material_id: item.material_id,
      internal_part_number: item.material?.internal_part_number ?? 'Unknown',
      description: item.material?.description ?? null,
      lot_uid: item.lot?.uid ?? null,
      system_quantity: parseFloat(String(item.system_quantity)),
      counted_quantity: item.counted_quantity !== null ? parseFloat(String(item.counted_quantity)) : null,
      variance: item.variance !== null ? parseFloat(String(item.variance)) : null,
      variance_percent: item.variance_percent !== null ? parseFloat(String(item.variance_percent)) : null,
      variance_value: item.variance_value !== null ? parseFloat(String(item.variance_value)) : null,
      status: item.status,
    }));

    const itemsWithVariance = items.filter((i) => i.variance !== null && i.variance !== 0);
    const positiveVariance = itemsWithVariance.filter((i) => (i.variance ?? 0) > 0);
    const negativeVariance = itemsWithVariance.filter((i) => (i.variance ?? 0) < 0);

    return {
      cycle_count: {
        id: cycleCount.id,
        count_number: cycleCount.count_number,
        status: cycleCount.status,
        count_type: cycleCount.count_type,
        scheduled_date: cycleCount.scheduled_date,
        total_items: cycleCount.total_items,
        items_counted: cycleCount.items_counted,
        items_with_variance: cycleCount.items_with_variance,
        total_variance_value: parseFloat(String(cycleCount.total_variance_value)),
      },
      items,
      totals: {
        total_items: items.length,
        items_with_positive_variance: positiveVariance.length,
        items_with_negative_variance: negativeVariance.length,
        total_positive_variance_value: positiveVariance.reduce(
          (sum, i) => sum + (i.variance_value ?? 0),
          0,
        ),
        total_negative_variance_value: negativeVariance.reduce(
          (sum, i) => sum + (i.variance_value ?? 0),
          0,
        ),
        net_variance_value: items.reduce((sum, i) => sum + (i.variance_value ?? 0), 0),
      },
    };
  }

  /**
   * Get count history for a material
   */
  async getMaterialCountHistory(
    materialId: string,
    limit: number = 10,
  ): Promise<CycleCountItem[]> {
    return this.cycleCountItemRepository.find({
      where: { material_id: materialId },
      relations: ['cycle_count'],
      order: { counted_at: 'DESC' },
      take: limit,
    });
  }
}
