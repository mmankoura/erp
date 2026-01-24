import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import {
  InventoryTransaction,
  TransactionType,
  ReferenceType,
  InventoryBucket,
  OwnerType,
} from '../../entities/inventory-transaction.entity';
import {
  InventoryAllocation,
  AllocationStatus,
} from '../../entities/inventory-allocation.entity';
import { Material } from '../../entities/material.entity';
import { Order } from '../../entities/order.entity';
import { BomItem } from '../../entities/bom-item.entity';
import {
  CreateTransactionDto,
  CreateAllocationDto,
  UpdateAllocationDto,
} from './dto';
import { AuditService } from '../audit/audit.service';
import {
  AuditEventType,
  AuditEntityType,
} from '../../entities/audit-event.entity';
import { PurchaseOrdersService } from '../purchase-orders/purchase-orders.service';

export interface MaterialStock {
  material_id: string;
  material: Material;
  quantity_on_hand: number;
  quantity_allocated: number;
  quantity_available: number;
  quantity_on_order: number;
  owner_type?: OwnerType;
  owner_id?: string | null;
}

export interface OwnerFilter {
  owner_type?: OwnerType;
  owner_id?: string | null;
}

export interface StockLevel {
  material_id: string;
  quantity_on_hand: number;
}

export interface AllocationSummary {
  material_id: string;
  quantity_allocated: number;
}

export interface OrderAllocationResult {
  order_id: string;
  order_number: string;
  total_materials: number;
  fully_allocated: number;
  partially_allocated: number;
  not_allocated: number;
  allocations: Array<{
    material_id: string;
    material: Material;
    required_quantity: number;
    allocated_quantity: number;
    shortage: number;
  }>;
}

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    @InjectRepository(InventoryTransaction)
    private readonly transactionRepository: Repository<InventoryTransaction>,
    @InjectRepository(InventoryAllocation)
    private readonly allocationRepository: Repository<InventoryAllocation>,
    @InjectRepository(Material)
    private readonly materialRepository: Repository<Material>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(BomItem)
    private readonly bomItemRepository: Repository<BomItem>,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    @Inject(forwardRef(() => PurchaseOrdersService))
    private readonly purchaseOrdersService: PurchaseOrdersService,
  ) {}

  // ==================== STOCK QUERIES ====================

  /**
   * Get all materials with their current stock levels including allocation info
   */
  async findAllStock(): Promise<MaterialStock[]> {
    // Get all materials
    const materials = await this.materialRepository.find({
      where: { deleted_at: undefined },
      order: { internal_part_number: 'ASC' },
    });

    // Get stock levels for all materials
    const stockLevels = await this.transactionRepository
      .createQueryBuilder('t')
      .select('t.material_id', 'material_id')
      .addSelect('COALESCE(SUM(t.quantity), 0)', 'quantity_on_hand')
      .groupBy('t.material_id')
      .getRawMany<StockLevel>();

    // Get allocated quantities for all materials
    const allocations = await this.allocationRepository
      .createQueryBuilder('a')
      .select('a.material_id', 'material_id')
      .addSelect('COALESCE(SUM(a.quantity), 0)', 'quantity_allocated')
      .where('a.status = :status', { status: AllocationStatus.ACTIVE })
      .groupBy('a.material_id')
      .getRawMany<AllocationSummary>();

    // Get quantities on order from purchase orders
    const materialIds = materials.map((m) => m.id);
    const onOrderMap = await this.purchaseOrdersService.getQuantitiesOnOrder(materialIds);

    // Create maps for quick lookup
    const stockMap = new Map<string, number>();
    for (const level of stockLevels) {
      stockMap.set(level.material_id, parseFloat(String(level.quantity_on_hand)));
    }

    const allocationMap = new Map<string, number>();
    for (const alloc of allocations) {
      allocationMap.set(alloc.material_id, parseFloat(String(alloc.quantity_allocated)));
    }

    // Combine materials with their stock and allocation info
    return materials.map((material) => {
      const quantityOnHand = stockMap.get(material.id) ?? 0;
      const quantityAllocated = allocationMap.get(material.id) ?? 0;
      const quantityOnOrder = onOrderMap.get(material.id) ?? 0;
      return {
        material_id: material.id,
        material,
        quantity_on_hand: quantityOnHand,
        quantity_allocated: quantityAllocated,
        quantity_available: quantityOnHand - quantityAllocated,
        quantity_on_order: quantityOnOrder,
      };
    });
  }

  /**
   * Get stock level for a specific material
   */
  async getStockByMaterialId(materialId: string): Promise<MaterialStock> {
    const material = await this.materialRepository.findOne({
      where: { id: materialId },
    });

    if (!material) {
      throw new NotFoundException(`Material with ID "${materialId}" not found`);
    }

    const quantityOnHand = await this.getQuantityOnHand(materialId);
    const quantityAllocated = await this.getAllocatedQuantity(materialId);
    const quantityOnOrder = await this.purchaseOrdersService.getQuantityOnOrder(materialId);

    return {
      material_id: materialId,
      material,
      quantity_on_hand: quantityOnHand,
      quantity_allocated: quantityAllocated,
      quantity_available: quantityOnHand - quantityAllocated,
      quantity_on_order: quantityOnOrder,
    };
  }

  /**
   * Get quantity on hand for a material (sum of all transactions)
   */
  async getQuantityOnHand(materialId: string): Promise<number> {
    const result = await this.transactionRepository
      .createQueryBuilder('t')
      .select('COALESCE(SUM(t.quantity), 0)', 'quantity_on_hand')
      .where('t.material_id = :materialId', { materialId })
      .getRawOne<{ quantity_on_hand: string }>();

    return parseFloat(result?.quantity_on_hand ?? '0');
  }

  /**
   * Get total allocated quantity for a material (only ACTIVE allocations)
   */
  async getAllocatedQuantity(materialId: string): Promise<number> {
    const result = await this.allocationRepository
      .createQueryBuilder('a')
      .select('COALESCE(SUM(a.quantity), 0)', 'quantity_allocated')
      .where('a.material_id = :materialId', { materialId })
      .andWhere('a.status = :status', { status: AllocationStatus.ACTIVE })
      .getRawOne<{ quantity_allocated: string }>();

    return parseFloat(result?.quantity_allocated ?? '0');
  }

  /**
   * Get available quantity for a material (on hand - allocated)
   */
  async getAvailableQuantity(materialId: string): Promise<number> {
    const quantityOnHand = await this.getQuantityOnHand(materialId);
    const quantityAllocated = await this.getAllocatedQuantity(materialId);
    return quantityOnHand - quantityAllocated;
  }

  // ==================== OWNER-AWARE STOCK QUERIES ====================

  /**
   * Get quantity on hand for a material filtered by owner
   */
  async getQuantityOnHandByOwner(
    materialId: string,
    ownerType: OwnerType,
    ownerId: string | null,
  ): Promise<number> {
    const query = this.transactionRepository
      .createQueryBuilder('t')
      .select('COALESCE(SUM(t.quantity), 0)', 'quantity_on_hand')
      .where('t.material_id = :materialId', { materialId })
      .andWhere('t.owner_type = :ownerType', { ownerType });

    if (ownerType === OwnerType.CUSTOMER && ownerId) {
      query.andWhere('t.owner_id = :ownerId', { ownerId });
    } else {
      query.andWhere('t.owner_id IS NULL');
    }

    const result = await query.getRawOne<{ quantity_on_hand: string }>();
    return parseFloat(result?.quantity_on_hand ?? '0');
  }

  /**
   * Get allocated quantity for a material filtered by owner
   */
  async getAllocatedQuantityByOwner(
    materialId: string,
    ownerType: OwnerType,
    ownerId: string | null,
  ): Promise<number> {
    const query = this.allocationRepository
      .createQueryBuilder('a')
      .select('COALESCE(SUM(a.quantity), 0)', 'quantity_allocated')
      .where('a.material_id = :materialId', { materialId })
      .andWhere('a.status = :status', { status: AllocationStatus.ACTIVE })
      .andWhere('a.owner_type = :ownerType', { ownerType });

    if (ownerType === OwnerType.CUSTOMER && ownerId) {
      query.andWhere('a.owner_id = :ownerId', { ownerId });
    } else {
      query.andWhere('a.owner_id IS NULL');
    }

    const result = await query.getRawOne<{ quantity_allocated: string }>();
    return parseFloat(result?.quantity_allocated ?? '0');
  }

  /**
   * Get available quantity for a material filtered by owner (on hand - allocated)
   */
  async getAvailableQuantityByOwner(
    materialId: string,
    ownerType: OwnerType,
    ownerId: string | null,
  ): Promise<number> {
    const quantityOnHand = await this.getQuantityOnHandByOwner(materialId, ownerType, ownerId);
    const quantityAllocated = await this.getAllocatedQuantityByOwner(materialId, ownerType, ownerId);
    return quantityOnHand - quantityAllocated;
  }

  /**
   * Get available quantity for an order based on its order type
   * - TURNKEY orders: Use COMPANY inventory
   * - CONSIGNMENT orders: Use only the customer's own inventory
   */
  async getAvailableQuantityForOrder(
    materialId: string,
    order: Order,
  ): Promise<number> {
    if (order.order_type === 'CONSIGNMENT') {
      return this.getAvailableQuantityByOwner(materialId, OwnerType.CUSTOMER, order.customer_id);
    } else {
      return this.getAvailableQuantityByOwner(materialId, OwnerType.COMPANY, null);
    }
  }

  /**
   * Get available quantities for multiple materials filtered by owner
   */
  async getAvailableQuantitiesByOwner(
    materialIds: string[],
    ownerType: OwnerType,
    ownerId: string | null,
  ): Promise<Map<string, number>> {
    if (materialIds.length === 0) {
      return new Map();
    }

    // Get on-hand quantities for this owner
    const stockQuery = this.transactionRepository
      .createQueryBuilder('t')
      .select('t.material_id', 'material_id')
      .addSelect('COALESCE(SUM(t.quantity), 0)', 'quantity_on_hand')
      .where('t.material_id IN (:...materialIds)', { materialIds })
      .andWhere('t.owner_type = :ownerType', { ownerType });

    if (ownerType === OwnerType.CUSTOMER && ownerId) {
      stockQuery.andWhere('t.owner_id = :ownerId', { ownerId });
    } else {
      stockQuery.andWhere('t.owner_id IS NULL');
    }

    const stockLevels = await stockQuery
      .groupBy('t.material_id')
      .getRawMany<StockLevel>();

    // Get allocated quantities for this owner
    const allocationQuery = this.allocationRepository
      .createQueryBuilder('a')
      .select('a.material_id', 'material_id')
      .addSelect('COALESCE(SUM(a.quantity), 0)', 'quantity_allocated')
      .where('a.material_id IN (:...materialIds)', { materialIds })
      .andWhere('a.status = :status', { status: AllocationStatus.ACTIVE })
      .andWhere('a.owner_type = :ownerType', { ownerType });

    if (ownerType === OwnerType.CUSTOMER && ownerId) {
      allocationQuery.andWhere('a.owner_id = :ownerId', { ownerId });
    } else {
      allocationQuery.andWhere('a.owner_id IS NULL');
    }

    const allocations = await allocationQuery
      .groupBy('a.material_id')
      .getRawMany<AllocationSummary>();

    const stockMap = new Map<string, number>();
    for (const level of stockLevels) {
      stockMap.set(level.material_id, parseFloat(String(level.quantity_on_hand)));
    }

    const allocationMap = new Map<string, number>();
    for (const alloc of allocations) {
      allocationMap.set(alloc.material_id, parseFloat(String(alloc.quantity_allocated)));
    }

    const availableMap = new Map<string, number>();
    for (const materialId of materialIds) {
      const onHand = stockMap.get(materialId) ?? 0;
      const allocated = allocationMap.get(materialId) ?? 0;
      availableMap.set(materialId, onHand - allocated);
    }

    return availableMap;
  }

  /**
   * Get available quantities for multiple materials in a single query
   */
  async getAvailableQuantities(materialIds: string[]): Promise<Map<string, number>> {
    if (materialIds.length === 0) {
      return new Map();
    }

    // Get on-hand quantities
    const stockLevels = await this.transactionRepository
      .createQueryBuilder('t')
      .select('t.material_id', 'material_id')
      .addSelect('COALESCE(SUM(t.quantity), 0)', 'quantity_on_hand')
      .where('t.material_id IN (:...materialIds)', { materialIds })
      .groupBy('t.material_id')
      .getRawMany<StockLevel>();

    // Get allocated quantities
    const allocations = await this.allocationRepository
      .createQueryBuilder('a')
      .select('a.material_id', 'material_id')
      .addSelect('COALESCE(SUM(a.quantity), 0)', 'quantity_allocated')
      .where('a.material_id IN (:...materialIds)', { materialIds })
      .andWhere('a.status = :status', { status: AllocationStatus.ACTIVE })
      .groupBy('a.material_id')
      .getRawMany<AllocationSummary>();

    const stockMap = new Map<string, number>();
    for (const level of stockLevels) {
      stockMap.set(level.material_id, parseFloat(String(level.quantity_on_hand)));
    }

    const allocationMap = new Map<string, number>();
    for (const alloc of allocations) {
      allocationMap.set(alloc.material_id, parseFloat(String(alloc.quantity_allocated)));
    }

    const availableMap = new Map<string, number>();
    for (const materialId of materialIds) {
      const onHand = stockMap.get(materialId) ?? 0;
      const allocated = allocationMap.get(materialId) ?? 0;
      availableMap.set(materialId, onHand - allocated);
    }

    return availableMap;
  }

  // ==================== TRANSACTION OPERATIONS ====================

  /**
   * Get transaction history for a material
   */
  async getTransactionsByMaterialId(
    materialId: string,
    limit: number = 100,
  ): Promise<InventoryTransaction[]> {
    // Verify material exists
    const material = await this.materialRepository.findOne({
      where: { id: materialId },
    });

    if (!material) {
      throw new NotFoundException(`Material with ID "${materialId}" not found`);
    }

    return this.transactionRepository.find({
      where: { material_id: materialId },
      order: { created_at: 'DESC' },
      take: limit,
      relations: ['material'],
    });
  }

  /**
   * Record an inventory transaction
   */
  async createTransaction(
    dto: CreateTransactionDto,
  ): Promise<InventoryTransaction> {
    // Verify material exists
    const material = await this.materialRepository.findOne({
      where: { id: dto.material_id },
    });

    if (!material) {
      throw new NotFoundException(
        `Material with ID "${dto.material_id}" not found`,
      );
    }

    // Validate quantity based on transaction type
    let quantity = dto.quantity;

    if (
      dto.transaction_type === TransactionType.CONSUMPTION ||
      dto.transaction_type === TransactionType.SCRAP
    ) {
      quantity = -Math.abs(quantity);
    } else if (
      dto.transaction_type === TransactionType.RECEIPT ||
      dto.transaction_type === TransactionType.RETURN
    ) {
      quantity = Math.abs(quantity);
    }

    // Check if this would result in negative inventory
    const currentStock = await this.getQuantityOnHand(dto.material_id);
    const newStock = currentStock + quantity;

    if (newStock < 0) {
      throw new BadRequestException(
        `Insufficient stock. Current: ${currentStock}, Change: ${quantity}, Would result in: ${newStock}`,
      );
    }

    const transaction = this.transactionRepository.create({
      material_id: dto.material_id,
      transaction_type: dto.transaction_type,
      quantity,
      reference_type: dto.reference_type ?? ReferenceType.MANUAL,
      reference_id: dto.reference_id ?? null,
      reason: dto.reason ?? null,
      created_by: dto.created_by ?? null,
      // Phase 1 inventory dimensions (optional)
      location_id: dto.location_id ?? null,
      lot_id: dto.lot_id ?? null,
      bucket: dto.bucket ?? InventoryBucket.RAW,
      // Costing support (optional)
      unit_cost: dto.unit_cost ?? null,
      // Ownership dimension
      owner_type: dto.owner_type ?? OwnerType.COMPANY,
      owner_id: dto.owner_id ?? null,
    });

    const saved = await this.transactionRepository.save(transaction);

    // Emit audit event for significant transaction types
    const auditEventType = this.mapTransactionTypeToAuditEvent(dto.transaction_type);
    if (auditEventType) {
      await this.auditService.emitCreate(
        auditEventType,
        AuditEntityType.INVENTORY_TRANSACTION,
        saved.id,
        {
          material_id: dto.material_id,
          transaction_type: dto.transaction_type,
          quantity: quantity,
          reference_type: dto.reference_type,
          unit_cost: dto.unit_cost,
        },
        dto.created_by,
        {
          reference_id: dto.reference_id,
          reason: dto.reason,
          bucket: dto.bucket ?? InventoryBucket.RAW,
        },
      );
    }

    return this.transactionRepository.findOne({
      where: { id: saved.id },
      relations: ['material'],
    }) as Promise<InventoryTransaction>;
  }

  /**
   * Map transaction type to corresponding audit event type
   */
  private mapTransactionTypeToAuditEvent(transactionType: TransactionType): AuditEventType | null {
    switch (transactionType) {
      case TransactionType.ADJUSTMENT:
        return AuditEventType.INVENTORY_ADJUSTED;
      case TransactionType.RECEIPT:
        return AuditEventType.INVENTORY_RECEIVED;
      case TransactionType.CONSUMPTION:
        return AuditEventType.INVENTORY_CONSUMED;
      case TransactionType.SCRAP:
        return AuditEventType.INVENTORY_SCRAPPED;
      default:
        return null;
    }
  }

  /**
   * Set stock to a specific level (convenience method)
   */
  async setStockLevel(
    materialId: string,
    targetQuantity: number,
    reason?: string,
    createdBy?: string,
  ): Promise<InventoryTransaction> {
    if (targetQuantity < 0) {
      throw new BadRequestException('Target quantity cannot be negative');
    }

    const currentStock = await this.getQuantityOnHand(materialId);
    const adjustmentQuantity = targetQuantity - currentStock;

    if (adjustmentQuantity === 0) {
      throw new BadRequestException(
        `Stock is already at ${targetQuantity}. No adjustment needed.`,
      );
    }

    return this.createTransaction({
      material_id: materialId,
      transaction_type: TransactionType.ADJUSTMENT,
      quantity: adjustmentQuantity,
      reference_type: ReferenceType.MANUAL,
      reason: reason ?? `Stock level set to ${targetQuantity}`,
      created_by: createdBy,
    });
  }

  /**
   * Get materials with stock at or below threshold
   */
  async getLowStockMaterials(threshold: number = 0): Promise<MaterialStock[]> {
    const allStock = await this.findAllStock();
    return allStock.filter((item) => item.quantity_available <= threshold);
  }

  /**
   * Get recent transactions across all materials
   */
  async getRecentTransactions(
    limit: number = 50,
  ): Promise<InventoryTransaction[]> {
    return this.transactionRepository.find({
      order: { created_at: 'DESC' },
      take: limit,
      relations: ['material'],
    });
  }

  // ==================== ALLOCATION OPERATIONS ====================

  /**
   * Create a single allocation
   */
  async createAllocation(dto: CreateAllocationDto): Promise<InventoryAllocation> {
    // Verify material exists
    const material = await this.materialRepository.findOne({
      where: { id: dto.material_id },
    });
    if (!material) {
      throw new NotFoundException(`Material with ID "${dto.material_id}" not found`);
    }

    // Verify order exists
    const order = await this.orderRepository.findOne({
      where: { id: dto.order_id },
    });
    if (!order) {
      throw new NotFoundException(`Order with ID "${dto.order_id}" not found`);
    }

    // Check if an active allocation already exists for this material+order
    const existing = await this.allocationRepository.findOne({
      where: {
        material_id: dto.material_id,
        order_id: dto.order_id,
        status: AllocationStatus.ACTIVE,
      },
    });

    if (existing) {
      throw new ConflictException(
        `Active allocation already exists for material ${dto.material_id} on order ${dto.order_id}. Use update instead.`,
      );
    }

    // Check available quantity
    const available = await this.getAvailableQuantity(dto.material_id);
    if (dto.quantity > available) {
      throw new BadRequestException(
        `Insufficient available stock. Available: ${available}, Requested: ${dto.quantity}`,
      );
    }

    const allocation = this.allocationRepository.create({
      material_id: dto.material_id,
      order_id: dto.order_id,
      quantity: dto.quantity,
      status: AllocationStatus.ACTIVE,
      created_by: dto.created_by ?? null,
      // Ownership dimension
      owner_type: dto.owner_type ?? OwnerType.COMPANY,
      owner_id: dto.owner_id ?? null,
    });

    const saved = await this.allocationRepository.save(allocation);

    return this.allocationRepository.findOne({
      where: { id: saved.id },
      relations: ['material', 'order'],
    }) as Promise<InventoryAllocation>;
  }

  /**
   * Update an existing allocation quantity
   */
  async updateAllocation(
    allocationId: string,
    dto: UpdateAllocationDto,
  ): Promise<InventoryAllocation> {
    const allocation = await this.allocationRepository.findOne({
      where: { id: allocationId },
      relations: ['material', 'order'],
    });

    if (!allocation) {
      throw new NotFoundException(`Allocation with ID "${allocationId}" not found`);
    }

    if (allocation.status !== AllocationStatus.ACTIVE) {
      throw new BadRequestException(
        `Cannot update allocation with status "${allocation.status}"`,
      );
    }

    if (dto.quantity !== undefined) {
      // Calculate how much additional allocation is needed
      const additionalNeeded = dto.quantity - allocation.quantity;

      if (additionalNeeded > 0) {
        // Check if we have enough available
        const available = await this.getAvailableQuantity(allocation.material_id);
        if (additionalNeeded > available) {
          throw new BadRequestException(
            `Insufficient available stock. Additional needed: ${additionalNeeded}, Available: ${available}`,
          );
        }
      }

      allocation.quantity = dto.quantity;
    }

    return this.allocationRepository.save(allocation);
  }

  /**
   * Cancel an allocation (release the reserved stock)
   */
  async cancelAllocation(allocationId: string): Promise<InventoryAllocation> {
    const allocation = await this.allocationRepository.findOne({
      where: { id: allocationId },
      relations: ['material', 'order'],
    });

    if (!allocation) {
      throw new NotFoundException(`Allocation with ID "${allocationId}" not found`);
    }

    if (allocation.status !== AllocationStatus.ACTIVE) {
      throw new BadRequestException(
        `Cannot cancel allocation with status "${allocation.status}"`,
      );
    }

    allocation.status = AllocationStatus.CANCELLED;
    return this.allocationRepository.save(allocation);
  }

  /**
   * Get allocations for a specific material
   */
  async getAllocationsByMaterial(
    materialId: string,
    includeInactive: boolean = false,
  ): Promise<InventoryAllocation[]> {
    const where: any = { material_id: materialId };
    if (!includeInactive) {
      where.status = AllocationStatus.ACTIVE;
    }

    return this.allocationRepository.find({
      where,
      relations: ['material', 'order'],
      order: { created_at: 'DESC' },
    });
  }

  /**
   * Get allocations for a specific order
   */
  async getAllocationsByOrder(
    orderId: string,
    includeInactive: boolean = false,
  ): Promise<InventoryAllocation[]> {
    const where: any = { order_id: orderId };
    if (!includeInactive) {
      where.status = AllocationStatus.ACTIVE;
    }

    return this.allocationRepository.find({
      where,
      relations: ['material', 'order'],
      order: { created_at: 'DESC' },
    });
  }

  /**
   * Allocate materials for an entire order based on its BOM
   * Returns what was allocated and what couldn't be allocated
   *
   * Ownership rules:
   * - TURNKEY orders: Use COMPANY inventory only
   * - CONSIGNMENT orders: Use only the customer's own inventory
   */
  async allocateForOrder(
    orderId: string,
    createdBy?: string,
    allocateAvailableOnly: boolean = false,
  ): Promise<OrderAllocationResult> {
    // Get the order with its BOM revision
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: ['product', 'bom_revision'],
    });

    if (!order) {
      throw new NotFoundException(`Order with ID "${orderId}" not found`);
    }

    // Determine ownership scope based on order type
    const ownerType = order.order_type === 'CONSIGNMENT' ? OwnerType.CUSTOMER : OwnerType.COMPANY;
    const ownerId = order.order_type === 'CONSIGNMENT' ? order.customer_id : null;

    // Get BOM items for the order's locked BOM revision
    const bomItems = await this.bomItemRepository.find({
      where: { bom_revision_id: order.bom_revision_id },
      relations: ['material'],
      order: { line_number: 'ASC' },
    });

    // Calculate requirements and available quantities FOR THIS OWNER ONLY
    const materialIds = bomItems.map((item) => item.material_id);
    const availableQuantities = await this.getAvailableQuantitiesByOwner(materialIds, ownerType, ownerId);

    // Get existing active allocations for this order
    const existingAllocations = await this.allocationRepository.find({
      where: { order_id: orderId, status: AllocationStatus.ACTIVE },
    });
    const existingAllocationMap = new Map<string, number>();
    for (const alloc of existingAllocations) {
      existingAllocationMap.set(alloc.material_id, parseFloat(String(alloc.quantity)));
    }

    const results: OrderAllocationResult = {
      order_id: orderId,
      order_number: order.order_number,
      total_materials: bomItems.length,
      fully_allocated: 0,
      partially_allocated: 0,
      not_allocated: 0,
      allocations: [],
    };

    // Use a transaction for atomicity
    await this.dataSource.transaction(async (manager) => {
      for (const item of bomItems) {
        const bomQuantity = parseFloat(String(item.quantity_required));
        const scrapFactor = parseFloat(String(item.scrap_factor)) || 0;
        const requiredQuantity = order.quantity * bomQuantity * (1 + scrapFactor / 100);

        const existingAllocation = existingAllocationMap.get(item.material_id) ?? 0;
        const additionalNeeded = requiredQuantity - existingAllocation;

        // Adjust available quantity to account for what we've already allocated in this batch
        let available = availableQuantities.get(item.material_id) ?? 0;

        let allocatedQuantity = existingAllocation;
        let shortage = 0;

        if (additionalNeeded > 0) {
          const toAllocate = allocateAvailableOnly
            ? Math.min(additionalNeeded, available)
            : additionalNeeded;

          if (toAllocate > available && !allocateAvailableOnly) {
            throw new BadRequestException(
              `Insufficient stock for material ${item.material.internal_part_number}. ` +
              `Required: ${requiredQuantity}, Available: ${available + existingAllocation}`,
            );
          }

          if (toAllocate > 0) {
            if (existingAllocation > 0) {
              // Update existing allocation
              const existing = existingAllocations.find(
                (a) => a.material_id === item.material_id,
              );
              if (existing) {
                existing.quantity = existingAllocation + toAllocate;
                await manager.save(InventoryAllocation, existing);
              }
            } else {
              // Create new allocation with ownership
              const newAllocation = manager.create(InventoryAllocation, {
                material_id: item.material_id,
                order_id: orderId,
                quantity: toAllocate,
                status: AllocationStatus.ACTIVE,
                created_by: createdBy ?? null,
                owner_type: ownerType,
                owner_id: ownerId,
              });
              await manager.save(InventoryAllocation, newAllocation);
            }

            allocatedQuantity = existingAllocation + toAllocate;
            available -= toAllocate;
            availableQuantities.set(item.material_id, available);
          }

          shortage = Math.max(0, requiredQuantity - allocatedQuantity);
        }

        results.allocations.push({
          material_id: item.material_id,
          material: item.material,
          required_quantity: Math.ceil(requiredQuantity * 10000) / 10000,
          allocated_quantity: Math.ceil(allocatedQuantity * 10000) / 10000,
          shortage: Math.ceil(shortage * 10000) / 10000,
        });

        if (shortage === 0) {
          results.fully_allocated++;
        } else if (allocatedQuantity > 0) {
          results.partially_allocated++;
        } else {
          results.not_allocated++;
        }
      }
    });

    // Emit audit event for order allocation
    await this.auditService.emitCreate(
      AuditEventType.ORDER_ALLOCATED,
      AuditEntityType.ORDER,
      orderId,
      {
        order_number: order.order_number,
        total_materials: results.total_materials,
        fully_allocated: results.fully_allocated,
        partially_allocated: results.partially_allocated,
        not_allocated: results.not_allocated,
      },
      createdBy,
      { allocate_available_only: allocateAvailableOnly },
    );

    return results;
  }

  /**
   * Deallocate all materials for an order
   */
  async deallocateForOrder(orderId: string, createdBy?: string): Promise<{ cancelled: number }> {
    const allocations = await this.allocationRepository.find({
      where: { order_id: orderId, status: AllocationStatus.ACTIVE },
      relations: ['order'],
    });

    if (allocations.length === 0) {
      return { cancelled: 0 };
    }

    const orderNumber = allocations[0]?.order?.order_number ?? 'Unknown';

    for (const allocation of allocations) {
      allocation.status = AllocationStatus.CANCELLED;
    }

    await this.allocationRepository.save(allocations);

    // Emit audit event for order deallocation
    await this.auditService.emit({
      event_type: AuditEventType.ORDER_DEALLOCATED,
      entity_type: AuditEntityType.ORDER,
      entity_id: orderId,
      actor: createdBy,
      new_value: {
        cancelled_count: allocations.length,
        order_number: orderNumber,
      },
    });

    return { cancelled: allocations.length };
  }

  /**
   * Convert allocation to consumption (when materials are actually used)
   * This cancels the allocation and creates a consumption transaction
   */
  async consumeAllocation(
    allocationId: string,
    quantity?: number,
    createdBy?: string,
  ): Promise<{ allocation: InventoryAllocation; transaction: InventoryTransaction }> {
    const allocation = await this.allocationRepository.findOne({
      where: { id: allocationId },
      relations: ['material', 'order'],
    });

    if (!allocation) {
      throw new NotFoundException(`Allocation with ID "${allocationId}" not found`);
    }

    if (allocation.status !== AllocationStatus.ACTIVE) {
      throw new BadRequestException(
        `Cannot consume allocation with status "${allocation.status}"`,
      );
    }

    const consumeQuantity = quantity ?? parseFloat(String(allocation.quantity));

    if (consumeQuantity > parseFloat(String(allocation.quantity))) {
      throw new BadRequestException(
        `Cannot consume more than allocated. Allocated: ${allocation.quantity}, Requested: ${consumeQuantity}`,
      );
    }

    let updatedAllocation: InventoryAllocation;
    let transaction: InventoryTransaction;

    await this.dataSource.transaction(async (manager) => {
      // If consuming partial, reduce allocation; if full, mark as consumed
      if (consumeQuantity < parseFloat(String(allocation.quantity))) {
        allocation.quantity = parseFloat(String(allocation.quantity)) - consumeQuantity;
        updatedAllocation = await manager.save(InventoryAllocation, allocation);
      } else {
        allocation.status = AllocationStatus.CONSUMED;
        updatedAllocation = await manager.save(InventoryAllocation, allocation);
      }

      // Create consumption transaction with preserved ownership
      const newTransaction = manager.create(InventoryTransaction, {
        material_id: allocation.material_id,
        transaction_type: TransactionType.CONSUMPTION,
        quantity: -Math.abs(consumeQuantity),
        reference_type: ReferenceType.WORK_ORDER,
        reference_id: allocation.order_id,
        reason: `Consumed from allocation ${allocationId}`,
        created_by: createdBy ?? null,
        // Preserve ownership from allocation
        owner_type: allocation.owner_type,
        owner_id: allocation.owner_id,
      });
      transaction = await manager.save(InventoryTransaction, newTransaction);
    });

    return { allocation: updatedAllocation!, transaction: transaction! };
  }

  /**
   * Consume all active allocations for an order
   * Used when order is completed - converts all remaining allocations to consumption transactions
   */
  async consumeAllocationsForOrder(
    orderId: string,
    createdBy?: string,
  ): Promise<{
    consumed: number;
    transactions: InventoryTransaction[];
  }> {
    const allocations = await this.allocationRepository.find({
      where: { order_id: orderId, status: AllocationStatus.ACTIVE },
      relations: ['material'],
    });

    if (allocations.length === 0) {
      return { consumed: 0, transactions: [] };
    }

    const transactions: InventoryTransaction[] = [];

    await this.dataSource.transaction(async (manager) => {
      for (const allocation of allocations) {
        const consumeQuantity = parseFloat(String(allocation.quantity));

        // Mark allocation as consumed
        allocation.status = AllocationStatus.CONSUMED;
        await manager.save(InventoryAllocation, allocation);

        // Create consumption transaction with preserved ownership
        const transaction = manager.create(InventoryTransaction, {
          material_id: allocation.material_id,
          transaction_type: TransactionType.CONSUMPTION,
          quantity: -Math.abs(consumeQuantity),
          reference_type: ReferenceType.WORK_ORDER,
          reference_id: orderId,
          reason: `Order completed - consumed ${consumeQuantity} ${allocation.material?.internal_part_number ?? 'units'}`,
          created_by: createdBy ?? null,
          // Preserve ownership from allocation
          owner_type: allocation.owner_type,
          owner_id: allocation.owner_id,
        });
        const saved = await manager.save(InventoryTransaction, transaction);
        transactions.push(saved);
      }
    });

    return { consumed: allocations.length, transactions };
  }

  /**
   * Get allocation summary for all active orders
   */
  async getAllocationSummary(): Promise<{
    total_allocations: number;
    total_quantity_allocated: number;
    by_order: Array<{
      order_id: string;
      order_number: string;
      allocation_count: number;
      total_allocated: number;
    }>;
  }> {
    const allocations = await this.allocationRepository.find({
      where: { status: AllocationStatus.ACTIVE },
      relations: ['order'],
    });

    const orderMap = new Map<string, { order_number: string; count: number; total: number }>();

    for (const alloc of allocations) {
      const existing = orderMap.get(alloc.order_id);
      const qty = parseFloat(String(alloc.quantity));
      if (existing) {
        existing.count++;
        existing.total += qty;
      } else {
        orderMap.set(alloc.order_id, {
          order_number: alloc.order?.order_number ?? 'Unknown',
          count: 1,
          total: qty,
        });
      }
    }

    const byOrder = Array.from(orderMap.entries()).map(([orderId, data]) => ({
      order_id: orderId,
      order_number: data.order_number,
      allocation_count: data.count,
      total_allocated: data.total,
    }));

    return {
      total_allocations: allocations.length,
      total_quantity_allocated: allocations.reduce(
        (sum, a) => sum + parseFloat(String(a.quantity)),
        0,
      ),
      by_order: byOrder,
    };
  }
}
