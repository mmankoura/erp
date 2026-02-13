import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Order, OrderStatus } from '../../entities/order.entity';
import { ProductionLog, ProductionStage } from '../../entities/production-log.entity';
import { AuditService } from '../audit/audit.service';
import {
  AuditEventType,
  AuditEntityType,
} from '../../entities/audit-event.entity';

export interface MoveUnitsInput {
  order_id: string;
  from_stage: ProductionStage;
  to_stage: ProductionStage;
  quantity: number;
  notes?: string;
  created_by?: string;
}

export interface WipSummary {
  id: string; // alias for order_id (for DataTable compatibility)
  order_id: string;
  order_number: string;
  customer_name: string;
  product_name: string;
  total_quantity: number;
  quantity_not_started: number;
  quantity_in_kitting: number;
  quantity_in_smt: number;
  quantity_in_th: number;
  quantity_completed: number;
  quantity_shipped: number;
  due_date: Date;
  status: OrderStatus;
}

export interface StageSummary {
  stage: ProductionStage;
  order_count: number;
  total_units: number;
  orders: Array<{
    order_id: string;
    order_number: string;
    quantity: number;
    due_date: Date;
  }>;
}

@Injectable()
export class ProductionService {
  private readonly logger = new Logger(ProductionService.name);

  // Valid stage transitions
  private readonly validTransitions: Record<ProductionStage, ProductionStage[]> = {
    [ProductionStage.NOT_STARTED]: [ProductionStage.KITTING],
    [ProductionStage.KITTING]: [ProductionStage.SMT, ProductionStage.TH, ProductionStage.COMPLETED],
    [ProductionStage.SMT]: [ProductionStage.TH, ProductionStage.COMPLETED],
    [ProductionStage.TH]: [ProductionStage.COMPLETED],
    [ProductionStage.COMPLETED]: [ProductionStage.SHIPPED],
    [ProductionStage.SHIPPED]: [],
  };

  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(ProductionLog)
    private readonly productionLogRepository: Repository<ProductionLog>,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Start production for an order - move units to kitting
   */
  async startProduction(
    orderId: string,
    quantity?: number,
    createdBy?: string,
  ): Promise<Order> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: ['customer', 'product'],
    });

    if (!order) {
      throw new NotFoundException(`Order with ID "${orderId}" not found`);
    }

    // Calculate available quantity to start
    const availableToStart = order.quantity - order.quantity_in_kitting -
      order.quantity_in_smt - order.quantity_in_th -
      order.quantity_completed - order.quantity_shipped;

    if (availableToStart <= 0) {
      throw new BadRequestException('No units available to start production');
    }

    const qtyToMove = quantity ?? availableToStart;

    if (qtyToMove > availableToStart) {
      throw new BadRequestException(
        `Cannot start ${qtyToMove} units. Only ${availableToStart} available.`,
      );
    }

    return this.moveUnits({
      order_id: orderId,
      from_stage: ProductionStage.NOT_STARTED,
      to_stage: ProductionStage.KITTING,
      quantity: qtyToMove,
      created_by: createdBy,
    });
  }

  /**
   * Move units between production stages
   */
  async moveUnits(input: MoveUnitsInput): Promise<Order> {
    const order = await this.orderRepository.findOne({
      where: { id: input.order_id },
      relations: ['customer', 'product'],
    });

    if (!order) {
      throw new NotFoundException(`Order with ID "${input.order_id}" not found`);
    }

    // Validate transition
    if (!this.isValidTransition(input.from_stage, input.to_stage)) {
      throw new BadRequestException(
        `Invalid stage transition from ${input.from_stage} to ${input.to_stage}`,
      );
    }

    // Validate quantity available at source stage
    const sourceQty = this.getStageQuantity(order, input.from_stage);
    if (input.quantity > sourceQty) {
      throw new BadRequestException(
        `Cannot move ${input.quantity} units from ${input.from_stage}. Only ${sourceQty} available.`,
      );
    }

    await this.dataSource.transaction(async (manager) => {
      // Update source stage quantity
      this.updateStageQuantity(order, input.from_stage, -input.quantity);

      // Update destination stage quantity
      this.updateStageQuantity(order, input.to_stage, input.quantity);

      // Update stage start timestamps
      this.updateStageTimestamp(order, input.to_stage);

      // Check if production is complete
      if (input.to_stage === ProductionStage.COMPLETED) {
        const totalCompleted = order.quantity_completed + order.quantity_shipped;
        if (totalCompleted >= order.quantity) {
          order.production_completed_at = new Date();
        }
      }

      // Save order
      await manager.save(Order, order);

      // Create production log entry
      const log = manager.create(ProductionLog, {
        order_id: input.order_id,
        from_stage: input.from_stage,
        to_stage: input.to_stage,
        quantity: input.quantity,
        notes: input.notes ?? null,
        created_by: input.created_by ?? null,
      });
      await manager.save(ProductionLog, log);

      // Emit audit event
      await this.auditService.emit({
        event_type: AuditEventType.PRODUCTION_STAGE_MOVED,
        entity_type: AuditEntityType.PRODUCTION_LOG,
        entity_id: log.id,
        actor: input.created_by,
        new_value: {
          order_id: input.order_id,
          order_number: order.order_number,
          from_stage: input.from_stage,
          to_stage: input.to_stage,
          quantity: input.quantity,
        },
      });
    });

    return this.orderRepository.findOne({
      where: { id: input.order_id },
      relations: ['customer', 'product'],
    }) as Promise<Order>;
  }

  /**
   * Get quantity at a specific stage
   */
  private getStageQuantity(order: Order, stage: ProductionStage): number {
    switch (stage) {
      case ProductionStage.NOT_STARTED:
        return order.quantity - order.quantity_in_kitting - order.quantity_in_smt -
               order.quantity_in_th - order.quantity_completed - order.quantity_shipped;
      case ProductionStage.KITTING:
        return order.quantity_in_kitting;
      case ProductionStage.SMT:
        return order.quantity_in_smt;
      case ProductionStage.TH:
        return order.quantity_in_th;
      case ProductionStage.COMPLETED:
        return order.quantity_completed;
      case ProductionStage.SHIPPED:
        return order.quantity_shipped;
      default:
        return 0;
    }
  }

  /**
   * Update quantity at a stage
   */
  private updateStageQuantity(order: Order, stage: ProductionStage, delta: number): void {
    switch (stage) {
      case ProductionStage.KITTING:
        order.quantity_in_kitting += delta;
        break;
      case ProductionStage.SMT:
        order.quantity_in_smt += delta;
        break;
      case ProductionStage.TH:
        order.quantity_in_th += delta;
        break;
      case ProductionStage.COMPLETED:
        order.quantity_completed += delta;
        break;
      case ProductionStage.SHIPPED:
        order.quantity_shipped += delta;
        break;
      // NOT_STARTED doesn't have a column - it's computed
    }
  }

  /**
   * Update stage start timestamp if not already set
   */
  private updateStageTimestamp(order: Order, stage: ProductionStage): void {
    const now = new Date();
    switch (stage) {
      case ProductionStage.KITTING:
        if (!order.kitting_started_at) order.kitting_started_at = now;
        break;
      case ProductionStage.SMT:
        if (!order.smt_started_at) order.smt_started_at = now;
        break;
      case ProductionStage.TH:
        if (!order.th_started_at) order.th_started_at = now;
        break;
      case ProductionStage.COMPLETED:
        if (!order.production_completed_at) order.production_completed_at = now;
        break;
    }
  }

  /**
   * Check if a stage transition is valid
   */
  private isValidTransition(from: ProductionStage, to: ProductionStage): boolean {
    return this.validTransitions[from]?.includes(to) ?? false;
  }

  /**
   * Get WIP summary for all active orders
   */
  async getWipSummary(): Promise<WipSummary[]> {
    const orders = await this.orderRepository.find({
      where: [
        { status: OrderStatus.KITTING },
        { status: OrderStatus.SMT },
        { status: OrderStatus.TH },
      ],
      relations: ['customer', 'product'],
      order: { due_date: 'ASC' },
    });

    return orders.map((order) => ({
      id: order.id, // alias for DataTable compatibility
      order_id: order.id,
      order_number: order.order_number,
      customer_name: order.customer?.name ?? 'Unknown',
      product_name: order.product?.name ?? 'Unknown',
      total_quantity: order.quantity,
      quantity_not_started: order.quantity - order.quantity_in_kitting -
        order.quantity_in_smt - order.quantity_in_th -
        order.quantity_completed - order.quantity_shipped,
      quantity_in_kitting: order.quantity_in_kitting,
      quantity_in_smt: order.quantity_in_smt,
      quantity_in_th: order.quantity_in_th,
      quantity_completed: order.quantity_completed,
      quantity_shipped: order.quantity_shipped,
      due_date: order.due_date,
      status: order.status,
    }));
  }

  /**
   * Get summary by production stage
   */
  async getStageSummary(): Promise<StageSummary[]> {
    const orders = await this.orderRepository.find({
      where: [
        { status: OrderStatus.KITTING },
        { status: OrderStatus.SMT },
        { status: OrderStatus.TH },
      ],
      relations: ['customer', 'product'],
      order: { due_date: 'ASC' },
    });

    const stages: ProductionStage[] = [
      ProductionStage.KITTING,
      ProductionStage.SMT,
      ProductionStage.TH,
      ProductionStage.COMPLETED,
    ];

    return stages.map((stage) => {
      const ordersAtStage = orders
        .map((order) => ({
          order,
          quantity: this.getStageQuantity(order, stage),
        }))
        .filter((o) => o.quantity > 0);

      return {
        stage,
        order_count: ordersAtStage.length,
        total_units: ordersAtStage.reduce((sum, o) => sum + o.quantity, 0),
        orders: ordersAtStage.map((o) => ({
          order_id: o.order.id,
          order_number: o.order.order_number,
          quantity: o.quantity,
          due_date: o.order.due_date,
        })),
      };
    });
  }

  /**
   * Get production logs for an order
   */
  async getOrderProductionLogs(
    orderId: string,
    limit: number = 50,
  ): Promise<ProductionLog[]> {
    return this.productionLogRepository.find({
      where: { order_id: orderId },
      order: { created_at: 'DESC' },
      take: limit,
    });
  }

  /**
   * Get WIP details for a specific order
   */
  async getOrderWip(orderId: string): Promise<{
    order: Order;
    stages: Array<{
      stage: ProductionStage;
      quantity: number;
      started_at: Date | null;
    }>;
    logs: ProductionLog[];
  }> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: ['customer', 'product'],
    });

    if (!order) {
      throw new NotFoundException(`Order with ID "${orderId}" not found`);
    }

    const logs = await this.getOrderProductionLogs(orderId, 20);

    const notStartedQty = order.quantity - order.quantity_in_kitting -
      order.quantity_in_smt - order.quantity_in_th -
      order.quantity_completed - order.quantity_shipped;

    return {
      order,
      stages: [
        { stage: ProductionStage.NOT_STARTED, quantity: notStartedQty, started_at: null },
        { stage: ProductionStage.KITTING, quantity: order.quantity_in_kitting, started_at: order.kitting_started_at },
        { stage: ProductionStage.SMT, quantity: order.quantity_in_smt, started_at: order.smt_started_at },
        { stage: ProductionStage.TH, quantity: order.quantity_in_th, started_at: order.th_started_at },
        { stage: ProductionStage.COMPLETED, quantity: order.quantity_completed, started_at: order.production_completed_at },
        { stage: ProductionStage.SHIPPED, quantity: order.quantity_shipped, started_at: null },
      ],
      logs,
    };
  }

  /**
   * Complete and ship units (convenience method)
   */
  async shipUnits(
    orderId: string,
    quantity: number,
    createdBy?: string,
  ): Promise<Order> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException(`Order with ID "${orderId}" not found`);
    }

    // Can ship from completed stage
    if (order.quantity_completed < quantity) {
      throw new BadRequestException(
        `Cannot ship ${quantity} units. Only ${order.quantity_completed} completed.`,
      );
    }

    return this.moveUnits({
      order_id: orderId,
      from_stage: ProductionStage.COMPLETED,
      to_stage: ProductionStage.SHIPPED,
      quantity,
      created_by: createdBy,
      notes: 'Shipped to customer',
    });
  }
}
