import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager, IsNull, In } from 'typeorm';
import {
  PhysicalCount,
  PhysicalCountStatus,
} from '../../entities/physical-count.entity';
import { PhysicalCountLot } from '../../entities/physical-count-lot.entity';
import {
  PhysicalCountScan,
  PhysicalCountScanResolution,
} from '../../entities/physical-count-scan.entity';
import {
  PhysicalCountDiscrepancy,
  PhysicalCountDiscrepancyType,
  PhysicalCountResolutionAction,
} from '../../entities/physical-count-discrepancy.entity';
import {
  InventoryLot,
  LotStatus,
} from '../../entities/inventory-lot.entity';
import {
  InventoryTransaction,
  TransactionType,
  ReferenceType,
  OwnerType,
} from '../../entities/inventory-transaction.entity';
import { Customer } from '../../entities/customer.entity';
import { Material } from '../../entities/material.entity';
import { AuditService } from '../audit/audit.service';
import {
  AuditEventType,
  AuditEntityType,
} from '../../entities/audit-event.entity';
import { SequenceGeneratorService } from '../shared/sequence-generator.service';
import { CreatePhysicalCountDto } from './dto/create-physical-count.dto';
import { RecordScanDto } from './dto/record-scan.dto';
import { ResolveDiscrepancyDto } from './dto/resolve-discrepancy.dto';

export interface ScanResult {
  scan: PhysicalCountScan;
}

@Injectable()
export class PhysicalCountService {
  constructor(
    @InjectRepository(PhysicalCount)
    private readonly countRepository: Repository<PhysicalCount>,
    @InjectRepository(PhysicalCountLot)
    private readonly snapshotRepository: Repository<PhysicalCountLot>,
    @InjectRepository(PhysicalCountScan)
    private readonly scanRepository: Repository<PhysicalCountScan>,
    @InjectRepository(PhysicalCountDiscrepancy)
    private readonly discrepancyRepository: Repository<PhysicalCountDiscrepancy>,
    @InjectRepository(InventoryLot)
    private readonly lotRepository: Repository<InventoryLot>,
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    @InjectRepository(Material)
    private readonly materialRepository: Repository<Material>,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly sequenceGenerator: SequenceGeneratorService,
  ) {}

  // ==================== CRUD / LIST ====================

  async create(dto: CreatePhysicalCountDto, actor?: string): Promise<PhysicalCount> {
    const customer = await this.customerRepository.findOne({ where: { id: dto.customer_id } });
    if (!customer) throw new NotFoundException(`Customer "${dto.customer_id}" not found`);

    const active = await this.countRepository.findOne({
      where: [
        { customer_id: dto.customer_id, status: PhysicalCountStatus.IN_PROGRESS },
        { customer_id: dto.customer_id, status: PhysicalCountStatus.PAUSED },
        { customer_id: dto.customer_id, status: PhysicalCountStatus.PENDING_REVIEW },
        { customer_id: dto.customer_id, status: PhysicalCountStatus.PLANNED },
      ],
    });
    if (active) {
      throw new ConflictException(
        `An active Physical Count already exists for this customer (${active.count_number}, ${active.status})`,
      );
    }

    const count_number = await this.generateCountNumber();
    const created = this.countRepository.create({
      count_number,
      status: PhysicalCountStatus.PLANNED,
      customer_id: dto.customer_id,
      bin_filter: dto.bin_filter ?? null,
      category_filter: dto.category_filter ?? null,
      notes: dto.notes ?? null,
      created_by: actor ?? null,
    });
    const saved = await this.countRepository.save(created);

    await this.auditService.emit({
      event_type: AuditEventType.PHYSICAL_COUNT_CREATED,
      entity_type: AuditEntityType.PHYSICAL_COUNT,
      entity_id: saved.id,
      actor,
      new_value: { count_number: saved.count_number, customer_id: saved.customer_id },
    });

    return this.findById(saved.id);
  }

  async findAll(filters?: {
    status?: PhysicalCountStatus;
    customer_id?: string;
  }): Promise<PhysicalCount[]> {
    const qb = this.countRepository
      .createQueryBuilder('pc')
      .leftJoinAndSelect('pc.customer', 'customer')
      .orderBy('pc.created_at', 'DESC');
    if (filters?.status) qb.andWhere('pc.status = :status', { status: filters.status });
    if (filters?.customer_id) qb.andWhere('pc.customer_id = :cid', { cid: filters.customer_id });
    return qb.getMany();
  }

  async findById(id: string): Promise<PhysicalCount> {
    const count = await this.countRepository.findOne({
      where: { id },
      relations: ['customer'],
    });
    if (!count) throw new NotFoundException(`Physical Count "${id}" not found`);
    return count;
  }

  async getSnapshot(id: string): Promise<PhysicalCountLot[]> {
    await this.findById(id);
    return this.snapshotRepository.find({
      where: { physical_count_id: id },
      relations: ['lot', 'material'],
      order: { created_at: 'ASC' },
    });
  }

  async getScans(id: string): Promise<PhysicalCountScan[]> {
    await this.findById(id);
    return this.scanRepository.find({
      where: { physical_count_id: id },
      relations: ['matched_lot'],
      order: { scanned_at: 'DESC' },
    });
  }

  async getDiscrepancies(id: string): Promise<PhysicalCountDiscrepancy[]> {
    await this.findById(id);
    return this.discrepancyRepository.find({
      where: { physical_count_id: id },
      relations: ['lot', 'material'],
      order: { type: 'ASC', created_at: 'ASC' },
    });
  }

  // ==================== START ====================

  async startCount(id: string, actor?: string): Promise<PhysicalCount> {
    const count = await this.findById(id);
    if (count.status !== PhysicalCountStatus.PLANNED) {
      throw new BadRequestException(`Cannot start count with status "${count.status}"`);
    }

    await this.dataSource.transaction(async (manager) => {
      // A recount child is spawned with its snapshot already seeded (just the
      // lots flagged on the parent). Re-snapshotting would both violate
      // UQ_physical_count_lots_count_lot and widen a targeted recount into a
      // full count, so a pre-seeded snapshot is left exactly as it is.
      const existingSnapshot = await manager.count(PhysicalCountLot, {
        where: { physical_count_id: count.id },
      });
      if (existingSnapshot > 0) {
        count.status = PhysicalCountStatus.IN_PROGRESS;
        count.started_at = new Date();
        count.counted_by = actor ?? null;
        count.total_expected_lots = existingSnapshot;
        await manager.save(PhysicalCount, count);
        return;
      }

      const lotsQb = manager
        .createQueryBuilder(InventoryLot, 'lot')
        .leftJoin('lot.material', 'material')
        .where('lot.owner_type = :ot', { ot: OwnerType.CUSTOMER })
        .andWhere('lot.owner_id = :cid', { cid: count.customer_id })
        .andWhere('lot.status = :s', { s: LotStatus.ACTIVE });

      if (count.bin_filter) {
        lotsQb.andWhere('lot.bin = :bin', { bin: count.bin_filter });
      }
      if (count.category_filter) {
        lotsQb.andWhere('material.category = :cat', { cat: count.category_filter });
      }
      const lots = await lotsQb.getMany();

      for (const lot of lots) {
        const snapshot = manager.create(PhysicalCountLot, {
          physical_count_id: count.id,
          lot_id: lot.id,
          material_id: lot.material_id,
          customer_id: count.customer_id,
          expected_qty: parseFloat(String(lot.quantity)),
          unit_cost: lot.unit_cost != null ? parseFloat(String(lot.unit_cost)) : null,
          bin_at_snapshot: lot.bin,
        });
        await manager.save(PhysicalCountLot, snapshot);
      }

      count.status = PhysicalCountStatus.IN_PROGRESS;
      count.started_at = new Date();
      count.counted_by = actor ?? null;
      count.total_expected_lots = lots.length;
      await manager.save(PhysicalCount, count);
    });

    await this.auditService.emit({
      event_type: AuditEventType.PHYSICAL_COUNT_STARTED,
      entity_type: AuditEntityType.PHYSICAL_COUNT,
      entity_id: id,
      actor,
      new_value: { count_number: count.count_number, total_expected_lots: count.total_expected_lots },
    });

    return this.findById(id);
  }

  /**
   * Pause an in-progress count. Scanning is blocked until it is resumed; the
   * snapshot taken at start is preserved.
   */
  async pauseCount(id: string, actor?: string): Promise<PhysicalCount> {
    const count = await this.findById(id);
    if (count.status !== PhysicalCountStatus.IN_PROGRESS) {
      throw new BadRequestException(`Cannot pause count with status "${count.status}"`);
    }

    count.status = PhysicalCountStatus.PAUSED;
    await this.countRepository.save(count);

    await this.auditService.emit({
      event_type: AuditEventType.PHYSICAL_COUNT_PAUSED,
      entity_type: AuditEntityType.PHYSICAL_COUNT,
      entity_id: id,
      actor,
      new_value: { count_number: count.count_number },
    });

    return this.findById(id);
  }

  /**
   * Resume a paused count back to IN_PROGRESS so scanning can continue.
   */
  async resumeCount(id: string, actor?: string): Promise<PhysicalCount> {
    const count = await this.findById(id);
    if (count.status !== PhysicalCountStatus.PAUSED) {
      throw new BadRequestException(`Cannot resume count with status "${count.status}"`);
    }

    count.status = PhysicalCountStatus.IN_PROGRESS;
    await this.countRepository.save(count);

    await this.auditService.emit({
      event_type: AuditEventType.PHYSICAL_COUNT_RESUMED,
      entity_type: AuditEntityType.PHYSICAL_COUNT,
      entity_id: id,
      actor,
      new_value: { count_number: count.count_number },
    });

    return this.findById(id);
  }

  // ==================== SCAN ====================

  async recordScan(
    id: string,
    dto: RecordScanDto,
    actor?: string,
  ): Promise<ScanResult> {
    const count = await this.findById(id);
    if (count.status !== PhysicalCountStatus.IN_PROGRESS) {
      throw new BadRequestException(`Cannot scan into count with status "${count.status}"`);
    }
    this.assertCounterLock(count, actor);

    const lookup = await this.lotRepository.findOne({
      where: { uid: dto.uid },
      relations: ['material'],
    });

    let matched_lot_id: string | null = null;
    if (lookup) {
      if (
        lookup.owner_type === OwnerType.CUSTOMER &&
        lookup.owner_id !== count.customer_id
      ) {
        const wrongCustomer = await this.customerRepository.findOne({
          where: { id: lookup.owner_id ?? '' },
        });
        // Persist as REJECTED for audit, then surface 422
        const rejected = this.scanRepository.create({
          physical_count_id: count.id,
          uid: dto.uid,
          scanned_qty: dto.scanned_qty,
          scanned_by: actor ?? null,
          matched_lot_id: lookup.id,
          resolution: PhysicalCountScanResolution.REJECTED,
        });
        await this.scanRepository.save(rejected);

        throw new HttpException(
          {
            error: 'WRONG_CUSTOMER',
            message: `UID belongs to ${wrongCustomer?.name ?? 'another customer'}`,
            owner_customer_id: lookup.owner_id,
          },
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }

      if (
        lookup.status === LotStatus.ACTIVE &&
        lookup.owner_type === OwnerType.CUSTOMER &&
        lookup.owner_id === count.customer_id
      ) {
        matched_lot_id = lookup.id;
      } else if (lookup.status === LotStatus.ACTIVE) {
        // ACTIVE but owned by COMPANY (no customer assigned) — treat as orphan
        matched_lot_id = null;
      } else {
        // Non-ACTIVE (CONSUMED/SCRAPPED/etc.) — orphan but keep ref for context
        matched_lot_id = null;
      }
    }

    // Duplicate handling — count non-REJECTED scans for same (count, uid)
    const existing = await this.scanRepository.find({
      where: {
        physical_count_id: count.id,
        uid: dto.uid,
      },
    });
    const liveExisting = existing.filter(
      (s) => s.resolution !== PhysicalCountScanResolution.REJECTED,
    );

    if (liveExisting.length > 0 && !dto.dup_resolution) {
      throw new HttpException(
        {
          error: 'DUPLICATE_UID',
          message: 'Duplicate UID requires review',
          existing: liveExisting.map((s) => ({
            id: s.id,
            scanned_qty: s.scanned_qty,
            resolution: s.resolution,
            scanned_at: s.scanned_at,
          })),
        },
        HttpStatus.CONFLICT,
      );
    }

    let resolution = PhysicalCountScanResolution.FIRST;
    if (liveExisting.length > 0) {
      if (dto.dup_resolution === 'SUM') {
        resolution = PhysicalCountScanResolution.SUMMED;
      } else if (dto.dup_resolution === 'REPLACE') {
        // Mark all live existing as REJECTED, link superseded_by_scan_id later
        const newScanId = await this.dataSource.transaction(async (manager) => {
          const created = manager.create(PhysicalCountScan, {
            physical_count_id: count.id,
            uid: dto.uid,
            scanned_qty: dto.scanned_qty,
            scanned_by: actor ?? null,
            matched_lot_id,
            resolution: PhysicalCountScanResolution.REPLACED,
          });
          const saved = await manager.save(PhysicalCountScan, created);
          for (const old of liveExisting) {
            old.resolution = PhysicalCountScanResolution.REJECTED;
            old.superseded_by_scan_id = saved.id;
            await manager.save(PhysicalCountScan, old);
          }
          return saved.id;
        });
        const saved = await this.scanRepository.findOneOrFail({
          where: { id: newScanId },
        });
        await this.emitScanAudit(count, saved, actor);
        return { scan: saved };
      } else if (dto.dup_resolution === 'REJECT') {
        resolution = PhysicalCountScanResolution.REJECTED;
      }
    }

    const created = this.scanRepository.create({
      physical_count_id: count.id,
      uid: dto.uid,
      scanned_qty: dto.scanned_qty,
      scanned_by: actor ?? null,
      matched_lot_id,
      resolution,
    });
    const saved = await this.scanRepository.save(created);
    await this.emitScanAudit(count, saved, actor);
    return { scan: saved };
  }

  private async emitScanAudit(
    count: PhysicalCount,
    scan: PhysicalCountScan,
    actor?: string,
  ): Promise<void> {
    await this.auditService.emit({
      event_type: AuditEventType.PHYSICAL_COUNT_UID_SCANNED,
      entity_type: AuditEntityType.PHYSICAL_COUNT,
      entity_id: count.id,
      actor,
      new_value: {
        uid: scan.uid,
        scanned_qty: scan.scanned_qty,
        matched_lot_id: scan.matched_lot_id,
        resolution: scan.resolution,
      },
    });
  }

  async voidScan(id: string, scanId: string, actor?: string): Promise<void> {
    const count = await this.findById(id);
    if (count.status !== PhysicalCountStatus.IN_PROGRESS) {
      throw new BadRequestException(`Cannot void scan; count status is "${count.status}"`);
    }
    this.assertCounterLock(count, actor);
    const scan = await this.scanRepository.findOne({ where: { id: scanId, physical_count_id: id } });
    if (!scan) throw new NotFoundException(`Scan "${scanId}" not found in count`);
    scan.resolution = PhysicalCountScanResolution.REJECTED;
    await this.scanRepository.save(scan);
    await this.auditService.emit({
      event_type: AuditEventType.PHYSICAL_COUNT_SCAN_VOIDED,
      entity_type: AuditEntityType.PHYSICAL_COUNT,
      entity_id: id,
      actor,
      new_value: { scan_id: scanId, uid: scan.uid },
    });
  }

  // ==================== COMPLETE (materialize discrepancies) ====================

  async completeCount(id: string, actor?: string): Promise<PhysicalCount> {
    const count = await this.findById(id);
    if (count.status !== PhysicalCountStatus.IN_PROGRESS) {
      throw new BadRequestException(`Cannot complete count with status "${count.status}"`);
    }
    this.assertCounterLock(count, actor);

    const summary = await this.dataSource.transaction(async (manager) => {
      // Effective qty per uid: SUM of FIRST+SUMMED; ignore REJECTED; REPLACED is a single-row replacement so it counts as its own
      const allScans = await manager.find(PhysicalCountScan, {
        where: { physical_count_id: id },
      });
      const effectiveByUid = new Map<
        string,
        { qty: number; matched_lot_id: string | null }
      >();
      for (const s of allScans) {
        if (s.resolution === PhysicalCountScanResolution.REJECTED) continue;
        const cur = effectiveByUid.get(s.uid) ?? { qty: 0, matched_lot_id: s.matched_lot_id };
        if (s.resolution === PhysicalCountScanResolution.REPLACED) {
          // Replacement: overwrite the running total entirely
          effectiveByUid.set(s.uid, {
            qty: parseFloat(String(s.scanned_qty)),
            matched_lot_id: s.matched_lot_id,
          });
        } else {
          cur.qty += parseFloat(String(s.scanned_qty));
          cur.matched_lot_id = cur.matched_lot_id ?? s.matched_lot_id;
          effectiveByUid.set(s.uid, cur);
        }
      }

      // Group matched effective scans by lot_id
      const effectiveByLot = new Map<string, number>();
      for (const [, v] of effectiveByUid.entries()) {
        if (v.matched_lot_id) {
          effectiveByLot.set(v.matched_lot_id, (effectiveByLot.get(v.matched_lot_id) ?? 0) + v.qty);
        }
      }

      const snapshot = await manager.find(PhysicalCountLot, {
        where: { physical_count_id: id },
      });

      const snapshotByLotId = new Map<string, PhysicalCountLot>();
      for (const s of snapshot) snapshotByLotId.set(s.lot_id, s);

      let shortage = 0;
      let overage = 0;
      let not_scanned = 0;
      let orphan = 0;
      let total_variance_value = 0;

      // SHORTAGE / OVERAGE / NOT_SCANNED
      for (const snap of snapshot) {
        const scanned = effectiveByLot.get(snap.lot_id) ?? 0;
        const expected = parseFloat(String(snap.expected_qty));
        const variance = scanned - expected;
        const unit_cost = snap.unit_cost != null ? parseFloat(String(snap.unit_cost)) : 0;
        const variance_value = variance * unit_cost;

        if (!effectiveByLot.has(snap.lot_id)) {
          // NOT_SCANNED
          const disc = manager.create(PhysicalCountDiscrepancy, {
            physical_count_id: id,
            type: PhysicalCountDiscrepancyType.NOT_SCANNED,
            lot_id: snap.lot_id,
            material_id: snap.material_id,
            uid: null,
            expected_qty: expected,
            scanned_qty: 0,
            variance: -expected,
            variance_value: -expected * unit_cost,
          });
          await manager.save(PhysicalCountDiscrepancy, disc);
          not_scanned += 1;
          total_variance_value += -expected * unit_cost;
        } else if (variance < 0) {
          const disc = manager.create(PhysicalCountDiscrepancy, {
            physical_count_id: id,
            type: PhysicalCountDiscrepancyType.SHORTAGE,
            lot_id: snap.lot_id,
            material_id: snap.material_id,
            uid: null,
            expected_qty: expected,
            scanned_qty: scanned,
            variance,
            variance_value,
          });
          await manager.save(PhysicalCountDiscrepancy, disc);
          shortage += 1;
          total_variance_value += variance_value;
        } else if (variance > 0) {
          const disc = manager.create(PhysicalCountDiscrepancy, {
            physical_count_id: id,
            type: PhysicalCountDiscrepancyType.OVERAGE,
            lot_id: snap.lot_id,
            material_id: snap.material_id,
            uid: null,
            expected_qty: expected,
            scanned_qty: scanned,
            variance,
            variance_value,
          });
          await manager.save(PhysicalCountDiscrepancy, disc);
          overage += 1;
          total_variance_value += variance_value;
        }
        // variance === 0 → no discrepancy row
      }

      // ORPHAN: scans with matched_lot_id null OR matched lot not in snapshot
      for (const [uid, v] of effectiveByUid.entries()) {
        const isOrphan =
          v.matched_lot_id === null || !snapshotByLotId.has(v.matched_lot_id);
        if (!isOrphan) continue;

        const lot = v.matched_lot_id
          ? await manager.findOne(InventoryLot, { where: { id: v.matched_lot_id } })
          : null;
        const unit_cost = lot?.unit_cost != null ? parseFloat(String(lot.unit_cost)) : 0;
        const variance_value = v.qty * unit_cost;
        const disc = manager.create(PhysicalCountDiscrepancy, {
          physical_count_id: id,
          type: PhysicalCountDiscrepancyType.ORPHAN,
          lot_id: v.matched_lot_id,
          material_id: lot?.material_id ?? null,
          uid,
          expected_qty: 0,
          scanned_qty: v.qty,
          variance: v.qty,
          variance_value,
        });
        await manager.save(PhysicalCountDiscrepancy, disc);
        orphan += 1;
        total_variance_value += variance_value;
      }

      count.shortage_count = shortage;
      count.overage_count = overage;
      count.not_scanned_count = not_scanned;
      count.orphan_count = orphan;
      count.total_scans = effectiveByUid.size;
      count.total_variance_value = total_variance_value;
      count.status = PhysicalCountStatus.PENDING_REVIEW;
      count.completed_at = new Date();
      await manager.save(PhysicalCount, count);

      return { shortage, overage, not_scanned, orphan, total_variance_value };
    });

    await this.auditService.emit({
      event_type: AuditEventType.PHYSICAL_COUNT_COMPLETED,
      entity_type: AuditEntityType.PHYSICAL_COUNT,
      entity_id: id,
      actor,
      new_value: { ...summary, count_number: count.count_number },
    });

    return this.findById(id);
  }

  // ==================== RESOLVE DISCREPANCY ====================

  async resolveDiscrepancy(
    countId: string,
    discrepancyId: string,
    dto: ResolveDiscrepancyDto,
    actor?: string,
  ): Promise<PhysicalCountDiscrepancy> {
    const count = await this.findById(countId);
    if (count.status !== PhysicalCountStatus.PENDING_REVIEW) {
      throw new BadRequestException(`Cannot resolve discrepancies; count status is "${count.status}"`);
    }

    const disc = await this.discrepancyRepository.findOne({
      where: { id: discrepancyId, physical_count_id: countId },
    });
    if (!disc) throw new NotFoundException(`Discrepancy "${discrepancyId}" not found`);

    // SCRAP_MISSING only valid for SHORTAGE / NOT_SCANNED
    if (
      dto.resolution_action === PhysicalCountResolutionAction.SCRAP_MISSING &&
      disc.type !== PhysicalCountDiscrepancyType.SHORTAGE &&
      disc.type !== PhysicalCountDiscrepancyType.NOT_SCANNED
    ) {
      throw new BadRequestException(
        `SCRAP_MISSING is only valid for SHORTAGE or NOT_SCANNED discrepancies`,
      );
    }

    // RECOUNT must carry the re-counted quantity — it is what the lot gets
    // adjusted to on approve. Only enforceable where there is a lot to write
    // back to; an ORPHAN scan that matched no lot has nothing to adjust.
    if (
      dto.resolution_action === PhysicalCountResolutionAction.RECOUNT &&
      disc.lot_id
    ) {
      if (dto.recount_qty == null) {
        throw new BadRequestException(
          `A recounted quantity is required when resolving as RECOUNT`,
        );
      }
      if (dto.recount_qty < 0) {
        throw new BadRequestException(`Recounted quantity cannot be negative`);
      }
    }

    disc.resolution_action = dto.resolution_action;
    disc.resolution_note = dto.resolution_note ?? null;
    disc.recount_qty =
      dto.resolution_action === PhysicalCountResolutionAction.RECOUNT
        ? (dto.recount_qty ?? null)
        : null;
    disc.resolved_by = actor ?? null;
    disc.resolved_at = new Date();
    await this.discrepancyRepository.save(disc);

    await this.auditService.emit({
      event_type: AuditEventType.PHYSICAL_COUNT_DISCREPANCY_RESOLVED,
      entity_type: AuditEntityType.PHYSICAL_COUNT_DISCREPANCY,
      entity_id: disc.id,
      actor,
      new_value: {
        type: disc.type,
        resolution_action: disc.resolution_action,
        resolution_note: disc.resolution_note,
        recount_qty: disc.recount_qty,
      },
    });

    return disc;
  }

  // ==================== APPROVE ====================

  async approveCount(id: string, actor?: string): Promise<PhysicalCount> {
    const count = await this.findById(id);
    if (count.status !== PhysicalCountStatus.PENDING_REVIEW) {
      throw new BadRequestException(`Cannot approve count with status "${count.status}"`);
    }

    const discrepancies = await this.discrepancyRepository.find({
      where: { physical_count_id: id },
    });
    const unresolved = discrepancies.filter((d) => !d.resolution_action);
    if (unresolved.length > 0) {
      throw new BadRequestException(
        `Cannot approve: ${unresolved.length} discrepancies are unresolved`,
      );
    }

    const recountLotIds: string[] = [];

    await this.dataSource.transaction(async (manager) => {
      for (const disc of discrepancies) {
        const action = disc.resolution_action!;
        if (action === PhysicalCountResolutionAction.ACCEPT_WITH_NOTE) {
          // No transaction
        } else if (
          action === PhysicalCountResolutionAction.RECOUNT &&
          disc.recount_qty == null
        ) {
          // Legacy rows resolved before recount_qty existed: defer to a child count.
          if (disc.lot_id) recountLotIds.push(disc.lot_id);
        } else if (
          action === PhysicalCountResolutionAction.ADJUST_TO_SCAN ||
          action === PhysicalCountResolutionAction.RECOUNT
        ) {
          if (!disc.lot_id) continue; // ORPHAN with no lot can't adjust; would have been ACCEPT
          const lot = await manager.findOne(InventoryLot, { where: { id: disc.lot_id } });
          if (!lot) continue;
          const isRecount = action === PhysicalCountResolutionAction.RECOUNT;
          // RECOUNT is authoritative over the scan — the reviewer physically re-counted.
          const target = isRecount
            ? parseFloat(String(disc.recount_qty))
            : disc.scanned_qty != null
              ? parseFloat(String(disc.scanned_qty))
              : 0;
          const live = parseFloat(String(lot.quantity));
          const adjustment = target - live;
          if (adjustment === 0) continue;

          const unitCost = lot.unit_cost != null ? parseFloat(String(lot.unit_cost)) : 0;
          const tx = manager.create(InventoryTransaction, {
            material_id: lot.material_id,
            transaction_type: TransactionType.ADJUSTMENT,
            quantity: adjustment,
            unit_cost: unitCost || null,
            reference_type: ReferenceType.CYCLE_COUNT,
            reference_id: count.id,
            reason: `Physical count ${count.count_number}: ${
              isRecount ? 'adjust to recount' : 'adjust to scan'
            }`,
            created_by: actor ?? null,
            lot_id: lot.id,
            owner_type: lot.owner_type,
            owner_id: lot.owner_id,
          });
          const savedTx = await manager.save(InventoryTransaction, tx);
          lot.quantity = target;
          await manager.save(InventoryLot, lot);

          disc.adjustment_transaction_id = savedTx.id;
          await manager.save(PhysicalCountDiscrepancy, disc);

          await this.auditService.emit({
            event_type: AuditEventType.PHYSICAL_COUNT_ADJUSTMENT,
            entity_type: AuditEntityType.INVENTORY_TRANSACTION,
            entity_id: savedTx.id,
            actor,
            new_value: {
              count_number: count.count_number,
              lot_id: lot.id,
              adjustment,
              new_qty: target,
              source: isRecount ? 'RECOUNT' : 'SCAN',
            },
          });
        } else if (action === PhysicalCountResolutionAction.SCRAP_MISSING) {
          if (!disc.lot_id) continue;
          const lot = await manager.findOne(InventoryLot, { where: { id: disc.lot_id } });
          if (!lot) continue;
          // For SHORTAGE: scrap = expected - scanned
          // For NOT_SCANNED: scrap = entire expected
          const expected = disc.expected_qty != null ? parseFloat(String(disc.expected_qty)) : 0;
          const scanned = disc.scanned_qty != null ? parseFloat(String(disc.scanned_qty)) : 0;
          const missing = expected - scanned;
          if (missing <= 0) continue;

          const unitCost = lot.unit_cost != null ? parseFloat(String(lot.unit_cost)) : 0;
          const tx = manager.create(InventoryTransaction, {
            material_id: lot.material_id,
            transaction_type: TransactionType.SCRAP,
            quantity: -missing,
            unit_cost: unitCost || null,
            reference_type: ReferenceType.CYCLE_COUNT,
            reference_id: count.id,
            reason: `Physical count ${count.count_number}: missing qty scrapped`,
            created_by: actor ?? null,
            lot_id: lot.id,
            owner_type: lot.owner_type,
            owner_id: lot.owner_id,
          });
          const savedTx = await manager.save(InventoryTransaction, tx);
          const remaining = parseFloat(String(lot.quantity)) - missing;
          lot.quantity = Math.max(0, remaining);
          if (lot.quantity === 0) lot.status = LotStatus.CONSUMED;
          await manager.save(InventoryLot, lot);

          disc.adjustment_transaction_id = savedTx.id;
          await manager.save(PhysicalCountDiscrepancy, disc);

          await this.auditService.emit({
            event_type: AuditEventType.PHYSICAL_COUNT_SCRAP,
            entity_type: AuditEntityType.INVENTORY_TRANSACTION,
            entity_id: savedTx.id,
            actor,
            new_value: {
              count_number: count.count_number,
              lot_id: lot.id,
              missing,
            },
          });
        }
      }

      count.status = PhysicalCountStatus.APPROVED;
      count.approved_at = new Date();
      count.approved_by = actor ?? null;
      await manager.save(PhysicalCount, count);

      // Spawn child recount if needed and we aren't already a recount child
      if (recountLotIds.length > 0 && !count.parent_count_id) {
        const childNumber = await this.generateCountNumber(manager);
        const child = manager.create(PhysicalCount, {
          count_number: childNumber,
          status: PhysicalCountStatus.PLANNED,
          customer_id: count.customer_id,
          parent_count_id: count.id,
          created_by: actor ?? null,
          notes: `Auto-spawned recount from ${count.count_number}`,
        });
        const savedChild = await manager.save(PhysicalCount, child);
        // Snapshot just the recount lots
        const recountLots = await manager.find(InventoryLot, {
          where: { id: In(recountLotIds) },
        });
        for (const lot of recountLots) {
          const snapshot = manager.create(PhysicalCountLot, {
            physical_count_id: savedChild.id,
            lot_id: lot.id,
            material_id: lot.material_id,
            customer_id: count.customer_id,
            expected_qty: parseFloat(String(lot.quantity)),
            unit_cost: lot.unit_cost != null ? parseFloat(String(lot.unit_cost)) : null,
            bin_at_snapshot: lot.bin,
          });
          await manager.save(PhysicalCountLot, snapshot);
        }
        savedChild.total_expected_lots = recountLots.length;
        await manager.save(PhysicalCount, savedChild);
      }
    });

    await this.auditService.emit({
      event_type: AuditEventType.PHYSICAL_COUNT_APPROVED,
      entity_type: AuditEntityType.PHYSICAL_COUNT,
      entity_id: id,
      actor,
      new_value: { count_number: count.count_number, recount_spawned: recountLotIds.length > 0 },
    });

    return this.findById(id);
  }

  // ==================== CANCEL ====================

  async cancelCount(id: string, actor?: string): Promise<PhysicalCount> {
    const count = await this.findById(id);
    if (count.status === PhysicalCountStatus.APPROVED) {
      throw new BadRequestException(`Cannot cancel an APPROVED count`);
    }
    if (count.status === PhysicalCountStatus.CANCELLED) {
      return count;
    }
    const oldStatus = count.status;
    count.status = PhysicalCountStatus.CANCELLED;
    await this.countRepository.save(count);

    await this.auditService.emitStateChange(
      AuditEventType.PHYSICAL_COUNT_CANCELLED,
      AuditEntityType.PHYSICAL_COUNT,
      id,
      { status: oldStatus },
      { status: PhysicalCountStatus.CANCELLED },
      actor,
    );
    return count;
  }

  // ==================== VARIANCE REPORT ====================

  async getVarianceReport(id: string) {
    const count = await this.findById(id);
    const discrepancies = await this.discrepancyRepository.find({
      where: { physical_count_id: id },
      relations: ['lot', 'material'],
      order: { type: 'ASC', created_at: 'ASC' },
    });

    type Row = {
      discrepancy_id: string;
      type: PhysicalCountDiscrepancyType;
      lot_id: string | null;
      uid: string | null;
      ipn: string | null;
      mfr: string | null;
      mpn: string | null;
      expected_qty: number | null;
      scanned_qty: number | null;
      recount_qty: number | null;
      variance: number;
      variance_value: number | null;
      resolution_action: PhysicalCountResolutionAction | null;
      resolution_note: string | null;
      resolved_by: string | null;
    };

    const toRow = (d: PhysicalCountDiscrepancy): Row => ({
      discrepancy_id: d.id,
      type: d.type,
      lot_id: d.lot_id,
      uid: d.uid ?? d.lot?.uid ?? null,
      ipn: d.material?.internal_part_number ?? null,
      mfr: d.material?.manufacturer ?? null,
      mpn: d.material?.manufacturer_pn ?? null,
      expected_qty: d.expected_qty != null ? parseFloat(String(d.expected_qty)) : null,
      scanned_qty: d.scanned_qty != null ? parseFloat(String(d.scanned_qty)) : null,
      recount_qty: d.recount_qty != null ? parseFloat(String(d.recount_qty)) : null,
      variance: parseFloat(String(d.variance)),
      variance_value: d.variance_value != null ? parseFloat(String(d.variance_value)) : null,
      resolution_action: d.resolution_action,
      resolution_note: d.resolution_note,
      resolved_by: d.resolved_by,
    });

    const by_type = {
      SHORTAGE: discrepancies.filter((d) => d.type === PhysicalCountDiscrepancyType.SHORTAGE).map(toRow),
      OVERAGE: discrepancies.filter((d) => d.type === PhysicalCountDiscrepancyType.OVERAGE).map(toRow),
      NOT_SCANNED: discrepancies.filter((d) => d.type === PhysicalCountDiscrepancyType.NOT_SCANNED).map(toRow),
      ORPHAN: discrepancies.filter((d) => d.type === PhysicalCountDiscrepancyType.ORPHAN).map(toRow),
    };

    const by_resolution_count = {
      ADJUST_TO_SCAN: discrepancies.filter((d) => d.resolution_action === PhysicalCountResolutionAction.ADJUST_TO_SCAN).length,
      ACCEPT_WITH_NOTE: discrepancies.filter((d) => d.resolution_action === PhysicalCountResolutionAction.ACCEPT_WITH_NOTE).length,
      RECOUNT: discrepancies.filter((d) => d.resolution_action === PhysicalCountResolutionAction.RECOUNT).length,
      SCRAP_MISSING: discrepancies.filter((d) => d.resolution_action === PhysicalCountResolutionAction.SCRAP_MISSING).length,
    };

    return {
      count: {
        id: count.id,
        count_number: count.count_number,
        customer: {
          id: count.customer.id,
          name: count.customer.name,
          code: count.customer.code,
        },
        status: count.status,
        bin_filter: count.bin_filter,
        category_filter: count.category_filter,
        started_at: count.started_at,
        completed_at: count.completed_at,
        approved_at: count.approved_at,
        counted_by: count.counted_by,
        approved_by: count.approved_by,
      },
      by_type,
      totals: {
        discrepancies_total: discrepancies.length,
        by_type_count: {
          SHORTAGE: by_type.SHORTAGE.length,
          OVERAGE: by_type.OVERAGE.length,
          NOT_SCANNED: by_type.NOT_SCANNED.length,
          ORPHAN: by_type.ORPHAN.length,
        },
        variance_value_total: parseFloat(String(count.total_variance_value)),
        by_resolution_count,
      },
    };
  }

  // ==================== HELPERS ====================

  private assertCounterLock(count: PhysicalCount, actor?: string): void {
    if (
      count.counted_by &&
      actor &&
      count.counted_by !== actor
    ) {
      throw new ForbiddenException(
        `This count is locked to user "${count.counted_by}"`,
      );
    }
  }

  private async generateCountNumber(manager?: EntityManager): Promise<string> {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `PC-${dateStr}-`;
    return this.sequenceGenerator.next(prefix, 'physical_counts', 'count_number', 3, manager);
  }
}
