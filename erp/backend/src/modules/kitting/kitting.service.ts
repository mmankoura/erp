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
import { InventoryLot } from '../../entities/inventory-lot.entity';
import { InventoryService } from '../inventory/inventory.service';
import { AuditService } from '../audit/audit.service';
import {
  AuditEventType,
  AuditEntityType,
} from '../../entities/audit-event.entity';
import type { ResourceType } from '../../entities/bom-item.entity';
import { CreateKittingListDto, ScanUidDto, CompleteKittingListDto } from './dto';

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

      return this.findOne(kittingList.id);
    });
  }

  /**
   * List all kitting lists
   */
  async findAll(): Promise<KittingList[]> {
    return this.kittingListRepository.find({
      relations: ['orders', 'orders.order', 'orders.order.customer', 'orders.order.product'],
      order: { created_at: 'DESC' },
    });
  }

  /**
   * Get a single kitting list with full details
   */
  async findOne(id: string): Promise<KittingList> {
    const kittingList = await this.kittingListRepository.findOne({
      where: { id },
      relations: [
        'orders',
        'orders.order',
        'orders.order.customer',
        'orders.order.product',
        'items',
        'items.material',
        'items.scans',
        'items.scans.uid',
      ],
    });

    if (!kittingList) {
      throw new NotFoundException(`Kitting list with ID "${id}" not found`);
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

    const itemsWithStock: KittingItemWithStock[] = await Promise.all(
      kittingList.items.map(async (item) => {
        const stock = await this.inventoryService.getStockByMaterialId(item.material_id);
        // Get UIDs for this material to show location info
        const uids = await this.inventoryLotRepository.find({
          where: { material_id: item.material_id, status: In(['ACTIVE'] as any) },
          order: { location: 'ASC' },
        });

        return {
          ...item,
          quantity_on_hand: stock.quantity_on_hand,
          quantity_available: stock.quantity_available,
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

    // Find matching kitting list item by material_id
    const matchingItems = kittingList.items.filter(
      (item) => item.material_id === inventoryLot.material_id,
    );

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

      // Transition list to IN_PROGRESS if still PRINTED
      if (kittingList.status === KittingListStatus.PRINTED) {
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

      // Mark list as completed
      await manager.update(KittingList, id, {
        status: KittingListStatus.COMPLETED,
        completed_at: new Date(),
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
        },
      });

      return this.findOne(id);
    });
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
   * Groups by (material_id, resource_type) and sums qty_per × order_qty × (1 + scrap_factor/100).
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
        // Skip DNP items
        if (item.resource_type === 'DNP') continue;

        const bomQuantity = parseFloat(String(item.quantity_required));
        const scrapFactor = parseFloat(String(item.scrap_factor)) || 0;
        const requiredQuantity =
          order.quantity * bomQuantity * (1 + scrapFactor / 100);
        const rounded = Math.ceil(requiredQuantity * 10000) / 10000;

        const key = `${item.material_id}::${item.resource_type ?? 'NULL'}`;

        if (aggregation.has(key)) {
          aggregation.get(key)!.total_qty_required += rounded;
        } else {
          aggregation.set(key, {
            material_id: item.material_id,
            resource_type: item.resource_type,
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

    const latest = await this.kittingListRepository
      .createQueryBuilder('kl')
      .where('kl.list_number LIKE :prefix', { prefix: `${prefix}%` })
      .orderBy('kl.list_number', 'DESC')
      .getOne();

    let seq = 1;
    if (latest) {
      const lastSeq = parseInt(latest.list_number.replace(prefix, ''), 10);
      if (!isNaN(lastSeq)) seq = lastSeq + 1;
    }

    return `${prefix}${String(seq).padStart(3, '0')}`;
  }
}

export interface KittingItemWithStock extends KittingListItem {
  quantity_on_hand: number;
  quantity_available: number;
  uid_locations: Array<{
    uid: string;
    quantity: number;
    location: string;
  }>;
}
