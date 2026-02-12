import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order, OrderStatus, OrderProductionType } from '../../entities/order.entity';
import { BomItem, ResourceType } from '../../entities/bom-item.entity';
import { Product } from '../../entities/product.entity';
import { Customer } from '../../entities/customer.entity';
import { BomRevision } from '../../entities/bom-revision.entity';
import { CreateOrderDto, UpdateOrderDto } from './dto';
import { InventoryService } from '../inventory/inventory.service';
import { AuditService } from '../audit/audit.service';
import {
  AuditEventType,
  AuditEntityType,
} from '../../entities/audit-event.entity';

export interface OrderFilters {
  status?: OrderStatus;
  customer_id?: string;
  product_id?: string;
  due_date_from?: string;
  due_date_to?: string;
  includeDeleted?: boolean;
}

// Statuses that require materials (allocations matter)
const ACTIVE_STATUSES = [
  OrderStatus.ENTERED,
  OrderStatus.KITTING,
  OrderStatus.SMT,
  OrderStatus.TH,
];

// Terminal statuses where allocations should be cleaned up
const TERMINAL_STATUSES = [
  OrderStatus.SHIPPED,
  OrderStatus.CANCELLED,
];

// Production statuses (on the floor)
const PRODUCTION_STATUSES = [
  OrderStatus.SMT,
  OrderStatus.TH,
];

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    @InjectRepository(BomRevision)
    private readonly bomRevisionRepository: Repository<BomRevision>,
    private readonly inventoryService: InventoryService,
    private readonly auditService: AuditService,
  ) {}

  async findAll(filters?: OrderFilters): Promise<Order[]> {
    const queryBuilder = this.orderRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.customer', 'customer')
      .leftJoinAndSelect('order.product', 'product')
      .leftJoinAndSelect('order.bom_revision', 'bom_revision');

    if (filters?.includeDeleted) {
      queryBuilder.withDeleted();
    }

    if (filters?.status) {
      queryBuilder.andWhere('order.status = :status', { status: filters.status });
    }

    if (filters?.customer_id) {
      queryBuilder.andWhere('order.customer_id = :customerId', {
        customerId: filters.customer_id,
      });
    }

    if (filters?.product_id) {
      queryBuilder.andWhere('order.product_id = :productId', {
        productId: filters.product_id,
      });
    }

    if (filters?.due_date_from) {
      queryBuilder.andWhere('order.due_date >= :fromDate', {
        fromDate: filters.due_date_from,
      });
    }

    if (filters?.due_date_to) {
      queryBuilder.andWhere('order.due_date <= :toDate', {
        toDate: filters.due_date_to,
      });
    }

    return queryBuilder
      .orderBy('order.due_date', 'ASC')
      .addOrderBy('order.created_at', 'DESC')
      .getMany();
  }

  async findOne(id: string): Promise<Order> {
    const order = await this.orderRepository.findOne({
      where: { id },
      relations: [
        'customer',
        'product',
        'bom_revision',
        'bom_revision.items',
        'bom_revision.items.material',
      ],
    });
    if (!order) {
      throw new NotFoundException(`Order with ID "${id}" not found`);
    }
    return order;
  }

  async findByOrderNumber(orderNumber: string): Promise<Order> {
    const order = await this.orderRepository.findOne({
      where: { order_number: orderNumber },
      relations: ['customer', 'product', 'bom_revision'],
    });
    if (!order) {
      throw new NotFoundException(
        `Order with number "${orderNumber}" not found`,
      );
    }
    return order;
  }

  async create(dto: CreateOrderDto): Promise<Order> {
    // Verify customer exists
    const customer = await this.customerRepository.findOne({
      where: { id: dto.customer_id },
    });
    if (!customer) {
      throw new NotFoundException(
        `Customer with ID "${dto.customer_id}" not found`,
      );
    }

    // Verify product exists
    const product = await this.productRepository.findOne({
      where: { id: dto.product_id },
    });
    if (!product) {
      throw new NotFoundException(
        `Product with ID "${dto.product_id}" not found`,
      );
    }

    // Determine BOM revision to use
    let bomRevisionId = dto.bom_revision_id;
    if (!bomRevisionId) {
      // Use active BOM revision for the product
      if (!product.active_bom_revision_id) {
        throw new BadRequestException(
          `Product "${product.part_number}" has no active BOM revision. Please specify a BOM revision or set an active revision for the product.`,
        );
      }
      bomRevisionId = product.active_bom_revision_id;
    } else {
      // Verify the specified BOM revision exists and belongs to this product
      const bomRevision = await this.bomRevisionRepository.findOne({
        where: { id: bomRevisionId },
      });
      if (!bomRevision) {
        throw new NotFoundException(
          `BOM revision with ID "${bomRevisionId}" not found`,
        );
      }
      if (bomRevision.product_id !== dto.product_id) {
        throw new BadRequestException(
          `BOM revision "${bomRevision.revision_number}" does not belong to product "${product.part_number}"`,
        );
      }
    }

    // Generate order number
    const orderNumber = await this.generateOrderNumber();

    // Determine production type from BOM
    const productionType = await this.determineProductionType(bomRevisionId);

    const order = this.orderRepository.create({
      ...dto,
      order_number: orderNumber,
      bom_revision_id: bomRevisionId,
      due_date: new Date(dto.due_date),
      production_type: productionType,
    });

    const saved = await this.orderRepository.save(order);
    const createdOrder = await this.findOne(saved.id);

    // Emit audit event for order creation
    await this.auditService.emitCreate(
      AuditEventType.ORDER_CREATED,
      AuditEntityType.ORDER,
      createdOrder.id,
      {
        order_number: createdOrder.order_number,
        customer_id: createdOrder.customer_id,
        product_id: createdOrder.product_id,
        quantity: createdOrder.quantity,
        status: createdOrder.status,
        due_date: createdOrder.due_date,
      },
      undefined, // actor - will be populated when auth is implemented
    );

    return createdOrder;
  }

  async update(id: string, dto: UpdateOrderDto): Promise<Order> {
    const order = await this.findOne(id);

    // Validate quantity_shipped doesn't exceed quantity
    if (dto.quantity_shipped !== undefined) {
      const newQuantity = dto.quantity ?? order.quantity;
      if (dto.quantity_shipped > newQuantity) {
        throw new BadRequestException(
          `Quantity shipped (${dto.quantity_shipped}) cannot exceed order quantity (${newQuantity})`,
        );
      }
    }

    if (dto.quantity !== undefined && order.quantity_shipped > dto.quantity) {
      throw new BadRequestException(
        `Cannot reduce quantity below already shipped amount (${order.quantity_shipped})`,
      );
    }

    Object.assign(order, dto);
    if (dto.due_date) {
      order.due_date = new Date(dto.due_date);
    }

    await this.orderRepository.save(order);
    return this.findOne(id);
  }

  /**
   * Update order status with automatic allocation handling
   *
   * Status transitions and allocation behavior:
   * - → CANCELLED: Deallocate all materials (release back to available)
   * - → SHIPPED: Consume all remaining allocations (create consumption transactions)
   * - → ON_HOLD: Save previous status for resume
   * - ON_HOLD → Previous: Restore previous status
   * - → SMT/TH: Issue materials to production floor
   */
  async updateStatus(
    id: string,
    status: OrderStatus,
    createdBy?: string,
  ): Promise<Order> {
    const order = await this.findOne(id);
    const previousStatus = order.status;

    // Validate status transition
    this.validateStatusTransition(previousStatus, status);

    // Handle ON_HOLD special cases
    if (status === OrderStatus.ON_HOLD) {
      // Save current status to restore later
      order.previous_status = previousStatus;
    } else if (previousStatus === OrderStatus.ON_HOLD && order.previous_status) {
      // Resuming from ON_HOLD - validate we're returning to previous status
      if (status !== order.previous_status) {
        throw new BadRequestException(
          `When resuming from ON_HOLD, must return to previous status (${order.previous_status}), not ${status}`,
        );
      }
      order.previous_status = null;
    }

    order.status = status;
    await this.orderRepository.save(order);

    // Emit audit event for status change
    await this.auditService.emitStateChange(
      AuditEventType.ORDER_STATUS_CHANGED,
      AuditEntityType.ORDER,
      order.id,
      { status: previousStatus },
      { status: status },
      createdBy,
      { order_number: order.order_number },
    );

    // Handle allocation lifecycle based on new status
    await this.handleStatusChange(order.id, previousStatus, status, createdBy);

    return this.findOne(id);
  }

  /**
   * Ship a quantity and handle allocations appropriately
   * Order should already be in SMT or TH status before shipping
   */
  async shipQuantity(
    id: string,
    quantityToShip: number,
    createdBy?: string,
  ): Promise<Order> {
    const order = await this.findOne(id);

    if (quantityToShip <= 0) {
      throw new BadRequestException('Quantity to ship must be positive');
    }

    // Validate order is in a shippable state
    if (!PRODUCTION_STATUSES.includes(order.status) && order.status !== OrderStatus.SHIPPED) {
      throw new BadRequestException(
        `Cannot ship order in ${order.status} status. Order must be in SMT, TH, or SHIPPED status.`,
      );
    }

    const newShippedTotal = order.quantity_shipped + quantityToShip;
    if (newShippedTotal > order.quantity) {
      throw new BadRequestException(
        `Cannot ship ${quantityToShip} units. Only ${order.balance} remaining.`,
      );
    }

    const previousShipped = order.quantity_shipped;
    order.quantity_shipped = newShippedTotal;
    const previousStatus = order.status;

    // Auto-update status to SHIPPED when first shipment occurs or when fully shipped
    if (newShippedTotal > 0 && order.status !== OrderStatus.SHIPPED) {
      order.status = OrderStatus.SHIPPED;
    }

    await this.orderRepository.save(order);

    // Emit audit event for shipment
    await this.auditService.emitStateChange(
      AuditEventType.ORDER_SHIPPED,
      AuditEntityType.ORDER,
      order.id,
      { quantity_shipped: previousShipped, status: previousStatus },
      { quantity_shipped: newShippedTotal, status: order.status },
      createdBy,
      {
        order_number: order.order_number,
        quantity_shipped_now: quantityToShip,
        balance_remaining: order.quantity - newShippedTotal,
      },
    );

    // If status changed to SHIPPED, handle the transition
    if (order.status === OrderStatus.SHIPPED && previousStatus !== OrderStatus.SHIPPED) {
      await this.handleStatusChange(order.id, previousStatus, OrderStatus.SHIPPED, createdBy);
    }

    return this.findOne(id);
  }

  /**
   * Cancel an order and release all allocations
   * Can only cancel orders in ENTERED or KITTING status (before production)
   */
  async cancel(id: string, createdBy?: string): Promise<Order> {
    const order = await this.findOne(id);

    if (order.status === OrderStatus.CANCELLED) {
      throw new BadRequestException('Order is already cancelled');
    }

    if (order.status === OrderStatus.SHIPPED) {
      throw new BadRequestException('Cannot cancel a shipped order');
    }

    // Can only cancel before production starts
    if (PRODUCTION_STATUSES.includes(order.status)) {
      throw new BadRequestException(
        `Cannot cancel order in ${order.status} status. Order is already in production.`,
      );
    }

    const previousStatus = order.status;
    order.status = OrderStatus.CANCELLED;
    await this.orderRepository.save(order);

    // Emit audit event for cancellation
    await this.auditService.emitStateChange(
      AuditEventType.ORDER_CANCELLED,
      AuditEntityType.ORDER,
      order.id,
      { status: previousStatus },
      { status: OrderStatus.CANCELLED },
      createdBy,
      { order_number: order.order_number },
    );

    // Deallocate all materials
    await this.handleStatusChange(order.id, previousStatus, OrderStatus.CANCELLED, createdBy);

    return this.findOne(id);
  }

  async remove(id: string, createdBy?: string): Promise<void> {
    const order = await this.findOne(id);

    // Deallocate before soft delete
    const result = await this.inventoryService.deallocateForOrder(id, createdBy);
    if (result.cancelled > 0) {
      this.logger.log(
        `Deallocated ${result.cancelled} materials for deleted order ${order.order_number}`,
      );
    }

    await this.orderRepository.softRemove(order);

    // Emit audit event for deletion
    await this.auditService.emitDelete(
      AuditEventType.ORDER_DELETED,
      AuditEntityType.ORDER,
      order.id,
      {
        order_number: order.order_number,
        status: order.status,
        customer_id: order.customer_id,
        product_id: order.product_id,
      },
      createdBy,
      { deallocated_materials: result.cancelled },
    );
  }

  async bulkDelete(ids: string[], createdBy?: string): Promise<{ deleted: number }> {
    if (!ids || ids.length === 0) {
      return { deleted: 0 };
    }

    let deletedCount = 0;
    for (const id of ids) {
      try {
        await this.remove(id, createdBy);
        deletedCount++;
      } catch (error) {
        this.logger.warn(`Failed to delete order ${id}: ${(error as Error).message}`);
      }
    }

    return { deleted: deletedCount };
  }

  async restore(id: string): Promise<Order> {
    const order = await this.orderRepository.findOne({
      where: { id },
      withDeleted: true,
    });

    if (!order) {
      throw new NotFoundException(`Order with ID "${id}" not found`);
    }

    if (!order.deleted_at) {
      throw new ConflictException(`Order with ID "${id}" is not deleted`);
    }

    await this.orderRepository.restore(id);
    return this.findOne(id);
  }

  // ============ Allocation Lifecycle Handlers ============

  /**
   * Handle allocation changes when order status changes
   *
   * New workflow:
   * - CANCELLED: Release all allocations
   * - SHIPPED: Production complete, trigger return workflow (handled separately)
   * - KITTING: Begin allocation/picking process
   * - SMT: Issue SMT materials to floor
   * - TH: Issue TH materials to floor, trigger SMT material return
   * - ON_HOLD: No allocation changes (materials stay where they are)
   */
  private async handleStatusChange(
    orderId: string,
    previousStatus: OrderStatus,
    newStatus: OrderStatus,
    createdBy?: string,
  ): Promise<void> {
    if (newStatus === OrderStatus.CANCELLED) {
      // CANCELLED: Release all allocations back to available inventory
      const result = await this.inventoryService.deallocateForOrder(orderId, createdBy);
      if (result.cancelled > 0) {
        this.logger.log(
          `Order cancelled: deallocated ${result.cancelled} material allocations`,
        );
      }
    } else if (newStatus === OrderStatus.SHIPPED) {
      // SHIPPED: Production complete
      // Note: Material return/consumption is handled via separate return workflow
      // This ensures counting happens before qty_on_hand is updated
      this.logger.log(
        `Order shipped: materials should be returned via return workflow`,
      );
    } else if (newStatus === OrderStatus.ON_HOLD) {
      // ON_HOLD: No allocation changes, materials stay in current state
      this.logger.log(
        `Order on hold: allocations unchanged`,
      );
    }
    // Note: KITTING, SMT, TH transitions are handled via separate pick/issue endpoints
    // to ensure proper material tracking and counting workflows
  }

  /**
   * Validate that a status transition is allowed
   *
   * New workflow:
   * ENTERED → KITTING → SMT → TH → SHIPPED
   *                   → TH → SHIPPED (SMT-only skips TH)
   *        → KITTING → SMT → SHIPPED (SMT-only orders)
   *        → KITTING → TH → SHIPPED (TH-only orders)
   *
   * Any status → ON_HOLD → Previous status (resume)
   * ENTERED or KITTING → CANCELLED
   */
  private validateStatusTransition(from: OrderStatus, to: OrderStatus): void {
    // Define allowed transitions
    const allowedTransitions: Record<OrderStatus, OrderStatus[]> = {
      [OrderStatus.ENTERED]: [
        OrderStatus.KITTING,
        OrderStatus.ON_HOLD,
        OrderStatus.CANCELLED,
      ],
      [OrderStatus.KITTING]: [
        OrderStatus.SMT,
        OrderStatus.TH,        // For TH-only orders
        OrderStatus.ON_HOLD,
        OrderStatus.CANCELLED,
      ],
      [OrderStatus.SMT]: [
        OrderStatus.TH,
        OrderStatus.SHIPPED,   // For SMT-only orders
        OrderStatus.ON_HOLD,
      ],
      [OrderStatus.TH]: [
        OrderStatus.SHIPPED,
        OrderStatus.ON_HOLD,
      ],
      [OrderStatus.SHIPPED]: [],  // Terminal state
      [OrderStatus.ON_HOLD]: [
        // Can return to any non-terminal status (validated separately)
        OrderStatus.ENTERED,
        OrderStatus.KITTING,
        OrderStatus.SMT,
        OrderStatus.TH,
      ],
      [OrderStatus.CANCELLED]: [],  // Terminal state
    };

    if (!allowedTransitions[from].includes(to)) {
      throw new BadRequestException(
        `Invalid status transition from ${from} to ${to}`,
      );
    }
  }

  /**
   * Determine production type from BOM resource types
   */
  async determineProductionType(bomRevisionId: string): Promise<OrderProductionType> {
    const bomItems = await this.bomRevisionRepository
      .createQueryBuilder('revision')
      .leftJoinAndSelect('revision.items', 'item')
      .where('revision.id = :id', { id: bomRevisionId })
      .getOne();

    if (!bomItems || !bomItems.items) {
      return OrderProductionType.SMT_AND_TH; // Default to both
    }

    const hasSMT = bomItems.items.some(item => item.resource_type === ResourceType.SMT);
    const hasTH = bomItems.items.some(item => item.resource_type === ResourceType.TH);

    if (hasSMT && hasTH) {
      return OrderProductionType.SMT_AND_TH;
    } else if (hasSMT) {
      return OrderProductionType.SMT_ONLY;
    } else if (hasTH) {
      return OrderProductionType.TH_ONLY;
    }

    // Default to SMT_AND_TH if no resource types specified
    return OrderProductionType.SMT_AND_TH;
  }

  // ============ Helper Methods ============

  private async generateOrderNumber(): Promise<string> {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `ORD-${dateStr}-`;

    // Find the highest sequence number for today
    const latestOrder = await this.orderRepository
      .createQueryBuilder('order')
      .where('order.order_number LIKE :prefix', { prefix: `${prefix}%` })
      .orderBy('order.order_number', 'DESC')
      .getOne();

    let sequence = 1;
    if (latestOrder) {
      const lastSequence = parseInt(
        latestOrder.order_number.replace(prefix, ''),
        10,
      );
      sequence = lastSequence + 1;
    }

    return `${prefix}${sequence.toString().padStart(4, '0')}`;
  }

  // ============ Statistics Methods ============

  async getOrderStats(): Promise<{
    total: number;
    byStatus: Record<OrderStatus, number>;
    overdueCount: number;
  }> {
    const orders = await this.orderRepository.find();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const byStatus: Record<OrderStatus, number> = {
      [OrderStatus.ENTERED]: 0,
      [OrderStatus.KITTING]: 0,
      [OrderStatus.SMT]: 0,
      [OrderStatus.TH]: 0,
      [OrderStatus.SHIPPED]: 0,
      [OrderStatus.ON_HOLD]: 0,
      [OrderStatus.CANCELLED]: 0,
    };

    let overdueCount = 0;

    for (const order of orders) {
      byStatus[order.status]++;
      if (
        order.due_date < today &&
        !TERMINAL_STATUSES.includes(order.status)
      ) {
        overdueCount++;
      }
    }

    return {
      total: orders.length,
      byStatus,
      overdueCount,
    };
  }

  async getActiveOrders(): Promise<Order[]> {
    return this.orderRepository.find({
      where: ACTIVE_STATUSES.map(status => ({ status })),
      relations: ['customer', 'product', 'bom_revision'],
      order: { due_date: 'ASC' },
    });
  }
}
