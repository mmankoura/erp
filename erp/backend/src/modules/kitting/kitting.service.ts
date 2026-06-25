import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { KittingList, KittingListStatus } from '../../entities/kitting-list.entity';
import { KittingListOrder } from '../../entities/kitting-list-order.entity';
import { KittingListItem } from '../../entities/kitting-list-item.entity';
import { KittingListScan } from '../../entities/kitting-list-scan.entity';
import { Order, OrderStatus } from '../../entities/order.entity';
import { BomItem } from '../../entities/bom-item.entity';
import { BomItemAlternate } from '../../entities/bom-item-alternate.entity';
import { InventoryLot, LotStatus } from '../../entities/inventory-lot.entity';
import { InventoryService } from '../inventory/inventory.service';
import { AuditService } from '../audit/audit.service';
import {
  AuditEventType,
  AuditEntityType,
} from '../../entities/audit-event.entity';
import type { ResourceType } from '../../entities/bom-item.entity';
import { CreateKittingListDto, ScanUidDto, CompleteKittingListDto } from './dto';
import { SequenceGeneratorService } from '../shared/sequence-generator.service';

@Injectable()
export class KittingService {
  private readonly logger = new Logger(KittingService.name);

  constructor(
    @InjectRepository(KittingList)
    private readonly kittingListRepository: Repository<KittingList>,
    @InjectRepository(KittingListOrder)
    private readonly kittingListOrderRepository: Repository<KittingListOrder>,
    @InjectRepository(KittingListItem)
    private readonly kittingListItemRepository: Repository<KittingListItem>,
    @InjectRepository(KittingListScan)
    private readonly kittingListScanRepository: Repository<KittingListScan>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(BomItem)
    private readonly bomItemRepository: Repository<BomItem>,
    @InjectRepository(InventoryLot)
    private readonly inventoryLotRepository: Repository<InventoryLot>,
    private readonly inventoryService: InventoryService,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly sequenceGenerator: SequenceGeneratorService,
  ) {}

  /**
   * Create a kitting list from one or more orders.
   * Aggregates BOM requirements across all selected orders.
   */
  async create(dto: CreateKittingListDto): Promise<KittingList> {
    // Validate orders exist and are in valid status
    const orders = await this.orderRepository.find({
      where: { id: In(dto.order_ids) },
      relations: ['customer', 'product'],
    });

    if (orders.length !== dto.order_ids.length) {
      const foundIds = orders.map((o) => o.id);
      const missingIds = dto.order_ids.filter((id) => !foundIds.includes(id));
      throw new NotFoundException(`Orders not found: ${missingIds.join(', ')}`);
    }

    const invalidOrders = orders.filter(
      (o) => o.status !== OrderStatus.ENTERED && o.status !== OrderStatus.KITTING,
    );
    if (invalidOrders.length > 0) {
      throw new BadRequestException(
        `Orders must be in ENTERED or KITTING status. Invalid: ${invalidOrders.map((o) => o.order_number).join(', ')}`,
      );
    }

    // Generate list number: KIT-YYYYMMDD-NNN
    const listNumber = await this.generateListNumber();

    return this.dataSource.transaction(async (manager) => {
      // Create the kitting list
      const kittingList = manager.create(KittingList, {
        list_number: listNumber,
        status: KittingListStatus.DRAFT,
        created_by: dto.created_by ?? null,
        notes: dto.notes ?? null,
      });
      await manager.save(KittingList, kittingList);

      // Create kitting list order entries
      const kittingListOrders = orders.map((order) =>
        manager.create(KittingListOrder, {
          kitting_list_id: kittingList.id,
          order_id: order.id,
          order_quantity: order.quantity,
        }),
      );
      await manager.save(KittingListOrder, kittingListOrders);

      // Aggregate BOM requirements across all orders
      const aggregatedItems = await this.aggregateRequirements(orders);

      // Create kitting list items
      const kittingListItems = aggregatedItems.map((item) =>
        manager.create(KittingListItem, {
          kitting_list_id: kittingList.id,
          material_id: item.material_id,
          resource_type: item.resource_type,
          total_qty_required: item.total_qty_required,
        }),
      );
      await manager.save(KittingListItem, kittingListItems);

      // Emit audit event
      await this.auditService.emit({
        event_type: AuditEventType.KITTING_LIST_CREATED,
        entity_type: AuditEntityType.KITTING_LIST,
        entity_id: kittingList.id,
        actor: dto.created_by,
        new_value: {
          list_number: listNumber,
          order_count: orders.length,
          order_numbers: orders.map((o) => o.order_number),
          item_count: kittingListItems.length,
        },
      });

      // Reload within the transaction so we can see the uncommitted row
      const result = await manager
        .createQueryBuilder(KittingList, 'kl')
        .where('kl.id = :id', { id: kittingList.id })
        .leftJoinAndSelect('kl.orders', 'orders')
        .leftJoinAndSelect('orders.order', 'order')
        .leftJoinAndSelect('order.customer', 'customer')
        .leftJoinAndSelect('order.product', 'product')
        .leftJoinAndSelect('kl.items', 'items')
        .leftJoinAndSelect('items.material', 'material')
        .leftJoinAndSelect('items.scans', 'scans')
        .leftJoinAndSelect('scans.uid', 'uid')
        .withDeleted()
        .getOne();

      return result!;
    });
  }

  /**
   * List all kitting lists
   */
  async findAll(): Promise<KittingList[]> {
    return this.kittingListRepository
      .createQueryBuilder('kl')
      .leftJoinAndSelect('kl.orders', 'orders')
      .leftJoinAndSelect('orders.order', 'order')
      .leftJoinAndSelect('order.customer', 'customer')
      .leftJoinAndSelect('order.product', 'product')
      .withDeleted()
      .orderBy('kl.created_at', 'DESC')
      .getMany();
  }

  /**
   * Get a single kitting list with full details
   */
  async findOne(id: string): Promise<KittingList> {
    const kittingList = await this.kittingListRepository
      .createQueryBuilder('kl')
      .where('kl.id = :id', { id })
      .leftJoinAndSelect('kl.orders', 'orders')
      .leftJoinAndSelect('orders.order', 'order')
      .leftJoinAndSelect('order.customer', 'customer')
      .leftJoinAndSelect('order.product', 'product')
      .leftJoinAndSelect('kl.items', 'items')
      .leftJoinAndSelect('items.material', 'material')
      .leftJoinAndSelect('items.scans', 'scans')
      .leftJoinAndSelect('scans.uid', 'uid')
      .withDeleted()
      .getOne();

    if (!kittingList) {
      throw new NotFoundException(`Kitting list with ID "${id}" not found`);
    }

    // Always use the material's resource_type as the source of truth
    for (const item of kittingList.items ?? []) {
      item.resource_type = item.material?.resource_type ?? item.resource_type;
    }

    return kittingList;
  }

  /**
   * Get kitting list items enriched with stock levels, grouped by resource type
   */
  async getWithStock(id: string): Promise<{
    kitting_list: KittingList;
    smt_items: KittingItemWithStock[];
    th_items: KittingItemWithStock[];
    other_items: KittingItemWithStock[];
  }> {
    const kittingList = await this.findOne(id);

    // Load all BOM item alternates for materials on this kitting list
    const materialIds = kittingList.items.map((i) => i.material_id);
    const allAlternates = materialIds.length > 0
      ? await this.dataSource.getRepository(BomItemAlternate).find({
          where: { bom_item: { material_id: In(materialIds) } },
          relations: ['bom_item', 'material'],
          order: { priority: 'ASC' },
        })
      : [];

    // Group alternates by primary material_id
    const altsByMaterial = new Map<string, BomItemAlternate[]>();
    for (const alt of allAlternates) {
      const key = alt.bom_item.material_id;
      const existing = altsByMaterial.get(key) ?? [];
      if (!existing.some((e) => e.material_id === alt.material_id)) {
        existing.push(alt);
      }
      altsByMaterial.set(key, existing);
    }

    const itemsWithStock: KittingItemWithStock[] = await Promise.all(
      kittingList.items.map(async (item) => {
        const stock = await this.inventoryService.getStockByMaterialId(item.material_id);
        // Get UIDs for this material to show location info
        const uids = await this.inventoryLotRepository.find({
          where: { material_id: item.material_id, status: LotStatus.ACTIVE },
          order: { location: 'ASC' },
        });

        // Check alternates if primary stock is insufficient
        const alts = altsByMaterial.get(item.material_id) ?? [];
        const alternateInfos: KittingAlternateInfo[] = [];
        let useAlternate = false;
        const qtyNeeded = parseFloat(String(item.total_qty_required));

        if (stock.quantity_on_hand < qtyNeeded && alts.length > 0) {
          let remaining = qtyNeeded - stock.quantity_on_hand;
          for (const alt of alts) {
            const altStock = await this.inventoryService.getStockByMaterialId(alt.material_id);
            if (altStock.quantity_on_hand > 0) {
              const useQty = Math.min(remaining, altStock.quantity_on_hand);
              alternateInfos.push({
                material_id: alt.material_id,
                ipn: alt.material?.internal_part_number ?? '',
                quantity_on_hand: altStock.quantity_on_hand,
                use_quantity: Math.ceil(useQty),
              });
              remaining -= useQty;
              useAlternate = true;
              if (remaining <= 0) break;
            }
          }

          // Also include alternate UIDs in uid_locations
          for (const altInfo of alternateInfos) {
            const altUids = await this.inventoryLotRepository.find({
              where: { material_id: altInfo.material_id, status: LotStatus.ACTIVE },
              order: { location: 'ASC' },
            });
            for (const u of altUids) {
              uids.push(u);
            }
          }
        }

        // Compute shortage live (required vs. scanned/verified). The stored
        // is_short/shortage_qty columns are only written at completion, so for
        // an active list they would always read 0 — recompute here so the
        // Shortages card and Shortage Report reflect the current scan progress.
        const qtyVerified = parseFloat(String(item.qty_verified));
        const shortageQty = Math.max(0, qtyNeeded - qtyVerified);

        return {
          ...item,
          is_short: shortageQty > 0,
          shortage_qty: Math.ceil(shortageQty * 10000) / 10000,
          quantity_on_hand: stock.quantity_on_hand,
          quantity_available: stock.quantity_available,
          use_alternate: useAlternate,
          alternates: alternateInfos,
          uid_locations: uids.map((u) => ({
            uid: u.uid,
            quantity: u.quantity,
            location: u.location,
          })),
        };
      }),
    );

    const smtItems = itemsWithStock.filter((i) => i.resource_type === 'SMT');
    const thItems = itemsWithStock.filter((i) => i.resource_type === 'TH');
    const otherItems = itemsWithStock.filter(
      (i) => i.resource_type !== 'SMT' && i.resource_type !== 'TH',
    );

    return {
      kitting_list: kittingList,
      smt_items: smtItems,
      th_items: thItems,
      other_items: otherItems,
    };
  }

  /**
   * Mark kitting list as printed
   */
  async markPrinted(id: string, actor?: string): Promise<KittingList> {
    const kittingList = await this.findOne(id);

    if (
      kittingList.status !== KittingListStatus.DRAFT &&
      kittingList.status !== KittingListStatus.PRINTED
    ) {
      throw new BadRequestException(
        `Cannot print a kitting list in ${kittingList.status} status`,
      );
    }

    kittingList.status = KittingListStatus.PRINTED;
    kittingList.printed_at = new Date();
    await this.kittingListRepository.save(kittingList);

    await this.auditService.emit({
      event_type: AuditEventType.KITTING_LIST_PRINTED,
      entity_type: AuditEntityType.KITTING_LIST,
      entity_id: id,
      actor,
    });

    return this.findOne(id);
  }

  /**
   * Scan a UID to verify against kitting list.
   * Looks up the UID, finds the matching kitting list item, records the scan,
   * and updates the UID location to WIP.
   */
  async scanUid(kittingListId: string, dto: ScanUidDto): Promise<{
    scan: KittingListScan;
    item: KittingListItem;
  }> {
    const kittingList = await this.findOne(kittingListId);

    if (
      kittingList.status !== KittingListStatus.DRAFT &&
      kittingList.status !== KittingListStatus.PRINTED &&
      kittingList.status !== KittingListStatus.IN_PROGRESS
    ) {
      throw new BadRequestException(
        `Cannot scan UIDs for a kitting list in ${kittingList.status} status`,
      );
    }

    // Look up the UID
    const inventoryLot = await this.inventoryLotRepository.findOne({
      where: { uid: dto.uid },
      relations: ['material'],
    });

    if (!inventoryLot) {
      throw new NotFoundException(`UID "${dto.uid}" not found`);
    }

    // Find matching kitting list item by material_id (primary or alternate)
    let matchingItems = kittingList.items.filter(
      (item) => item.material_id === inventoryLot.material_id,
    );

    // If no direct match, check if the scanned material is an alternate for any kitting item
    if (matchingItems.length === 0) {
      const alternates = await this.dataSource.getRepository(BomItemAlternate).find({
        where: { material_id: inventoryLot.material_id },
        relations: ['bom_item'],
      });
      if (alternates.length > 0) {
        const primaryMaterialIds = alternates.map((a) => a.bom_item.material_id);
        matchingItems = kittingList.items.filter(
          (item) => primaryMaterialIds.includes(item.material_id),
        );
      }
    }

    if (matchingItems.length === 0) {
      throw new BadRequestException(
        `Material "${inventoryLot.material?.internal_part_number}" (UID: ${dto.uid}) is not on this kitting list`,
      );
    }

    // If multiple matches (same material, different resource types), pick the one with the most remaining need
    const matchingItem = matchingItems.reduce((best, item) => {
      const bestRemaining = parseFloat(String(best.total_qty_required)) - parseFloat(String(best.qty_verified));
      const itemRemaining = parseFloat(String(item.total_qty_required)) - parseFloat(String(item.qty_verified));
      return itemRemaining > bestRemaining ? item : best;
    });

    // Check if this UID was already scanned for this kitting list
    const existingScan = await this.kittingListScanRepository.findOne({
      where: {
        kitting_list_item_id: In(kittingList.items.map((i) => i.id)),
        uid_id: inventoryLot.id,
      },
    });

    if (existingScan) {
      throw new BadRequestException(
        `UID "${dto.uid}" has already been scanned for this kitting list`,
      );
    }

    const uidQuantity = parseFloat(String(inventoryLot.quantity));

    return this.dataSource.transaction(async (manager) => {
      // Create the scan record
      const scan = manager.create(KittingListScan, {
        kitting_list_item_id: matchingItem.id,
        uid_id: inventoryLot.id,
        uid_code: dto.uid,
        quantity: uidQuantity,
        scanned_by: dto.scanned_by ?? null,
      });
      await manager.save(KittingListScan, scan);

      // Update qty_verified on the item
      const newQtyVerified = parseFloat(String(matchingItem.qty_verified)) + uidQuantity;
      await manager.update(KittingListItem, matchingItem.id, {
        qty_verified: newQtyVerified,
      });

      // Update UID location to WIP
      await manager.update(InventoryLot, inventoryLot.id, {
        location: 'WIP',
      });

      // Transition list to IN_PROGRESS on first scan (skips the PRINTED gate)
      if (
        kittingList.status === KittingListStatus.DRAFT ||
        kittingList.status === KittingListStatus.PRINTED
      ) {
        await manager.update(KittingList, kittingListId, {
          status: KittingListStatus.IN_PROGRESS,
        });
      }

      // Emit audit event
      await this.auditService.emit({
        event_type: AuditEventType.KITTING_UID_SCANNED,
        entity_type: AuditEntityType.KITTING_LIST,
        entity_id: kittingListId,
        actor: dto.scanned_by,
        new_value: {
          uid: dto.uid,
          material_ipn: inventoryLot.material?.internal_part_number,
          quantity: uidQuantity,
          item_id: matchingItem.id,
        },
      });

      // Reload the updated item
      const updatedItem = await manager.findOne(KittingListItem, {
        where: { id: matchingItem.id },
        relations: ['material', 'scans', 'scans.uid'],
      });

      return { scan, item: updatedItem! };
    });
  }

  /**
   * Complete the kitting list. Calculates shortages on all items.
   */
  async complete(id: string, dto: CompleteKittingListDto): Promise<KittingList> {
    const kittingList = await this.findOne(id);

    if (
      kittingList.status !== KittingListStatus.DRAFT &&
      kittingList.status !== KittingListStatus.PRINTED &&
      kittingList.status !== KittingListStatus.IN_PROGRESS
    ) {
      throw new BadRequestException(
        `Cannot complete a kitting list in ${kittingList.status} status`,
      );
    }

    return this.dataSource.transaction(async (manager) => {
      // Calculate shortages for each item
      let totalShortages = 0;
      for (const item of kittingList.items) {
        const qtyRequired = parseFloat(String(item.total_qty_required));
        const qtyVerified = parseFloat(String(item.qty_verified));
        const isShort = qtyVerified < qtyRequired;
        const shortageQty = isShort ? qtyRequired - qtyVerified : 0;

        if (isShort) totalShortages++;

        await manager.update(KittingListItem, item.id, {
          is_short: isShort,
          shortage_qty: Math.ceil(shortageQty * 10000) / 10000,
        });
      }

      // If anything is still short, park the kit in AWAITING_MATERIALS so it
      // can be resumed once the buyer purchases and receives the shortage.
      // Only a fully-picked kit is truly COMPLETED.
      const hasShortages = totalShortages > 0;
      await manager.update(KittingList, id, {
        status: hasShortages
          ? KittingListStatus.AWAITING_MATERIALS
          : KittingListStatus.COMPLETED,
        completed_at: hasShortages ? null : new Date(),
      });

      // Emit audit event
      await this.auditService.emit({
        event_type: AuditEventType.KITTING_LIST_COMPLETED,
        entity_type: AuditEntityType.KITTING_LIST,
        entity_id: id,
        actor: dto.completed_by,
        new_value: {
          list_number: kittingList.list_number,
          total_items: kittingList.items.length,
          items_short: totalShortages,
          parked_awaiting_materials: hasShortages,
        },
      });

      return this.findOne(id);
    });
  }

  /**
   * Resume a kit that was parked awaiting materials. Flips it back to
   * IN_PROGRESS so the operator can scan in the now-received shortage material
   * against this kit. Only valid from AWAITING_MATERIALS.
   */
  async resume(id: string, actor?: string): Promise<KittingList> {
    const kittingList = await this.findOne(id);

    if (kittingList.status !== KittingListStatus.AWAITING_MATERIALS) {
      throw new BadRequestException(
        `Cannot resume a kitting list in ${kittingList.status} status`,
      );
    }

    kittingList.status = KittingListStatus.IN_PROGRESS;
    kittingList.completed_at = null;
    await this.kittingListRepository.save(kittingList);

    await this.auditService.emit({
      event_type: AuditEventType.KITTING_LIST_RESUMED,
      entity_type: AuditEntityType.KITTING_LIST,
      entity_id: id,
      actor,
      new_value: { list_number: kittingList.list_number },
    });

    return this.findOne(id);
  }

  /**
   * Cancel a kitting list (only DRAFT or PRINTED)
   */
  async cancel(id: string, actor?: string): Promise<KittingList> {
    const kittingList = await this.findOne(id);

    if (
      kittingList.status !== KittingListStatus.DRAFT &&
      kittingList.status !== KittingListStatus.PRINTED
    ) {
      throw new BadRequestException(
        `Cannot cancel a kitting list in ${kittingList.status} status`,
      );
    }

    kittingList.status = KittingListStatus.CANCELLED;
    await this.kittingListRepository.save(kittingList);

    await this.auditService.emit({
      event_type: AuditEventType.KITTING_LIST_CANCELLED,
      entity_type: AuditEntityType.KITTING_LIST,
      entity_id: id,
      actor,
    });

    return this.findOne(id);
  }

  // ==================== Private Helpers ====================

  /**
   * Aggregate BOM requirements across multiple orders.
   * Groups by material_id and sums qty_per × order_qty × (1 + scrap_factor/100).
   * Resource type is read from the material, not the BOM item.
   */
  private async aggregateRequirements(
    orders: Order[],
  ): Promise<Array<{
    material_id: string;
    resource_type: ResourceType | null;
    total_qty_required: number;
  }>> {
    const aggregation = new Map<string, {
      material_id: string;
      resource_type: ResourceType | null;
      total_qty_required: number;
    }>();

    for (const order of orders) {
      const bomItems = await this.bomItemRepository.find({
        where: { bom_revision_id: order.bom_revision_id },
        relations: ['material'],
      });

      for (const item of bomItems) {
        // Skip DNP materials
        if (item.material?.resource_type === 'DNP') continue;

        const bomQuantity = parseFloat(String(item.quantity_required));
        const scrapFactor = parseFloat(String(item.scrap_factor)) || 0;
        const requiredQuantity =
          order.quantity * bomQuantity * (1 + scrapFactor / 100);
        const rounded = Math.ceil(requiredQuantity * 10000) / 10000;

        const key = item.material_id;

        if (aggregation.has(key)) {
          aggregation.get(key)!.total_qty_required += rounded;
        } else {
          aggregation.set(key, {
            material_id: item.material_id,
            resource_type: item.material?.resource_type ?? null,
            total_qty_required: rounded,
          });
        }
      }
    }

    return Array.from(aggregation.values());
  }

  /**
   * Generate a kitting list number: KIT-YYYYMMDD-NNN
   */
  private async generateListNumber(): Promise<string> {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `KIT-${dateStr}-`;

    return this.sequenceGenerator.next(prefix, 'kitting_lists', 'list_number', 3);
  }
}

export interface KittingAlternateInfo {
  material_id: string;
  ipn: string;
  quantity_on_hand: number;
  use_quantity: number;
}

export interface KittingItemWithStock extends KittingListItem {
  quantity_on_hand: number;
  quantity_available: number;
  use_alternate: boolean;
  alternates: KittingAlternateInfo[];
  uid_locations: Array<{
    uid: string;
    quantity: number;
    location: string;
  }>;
}
