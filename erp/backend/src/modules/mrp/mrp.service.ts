import { Injectable, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Order, OrderStatus } from '../../entities/order.entity';
import { BomItem } from '../../entities/bom-item.entity';
import { Material } from '../../entities/material.entity';
import { Customer } from '../../entities/customer.entity';
import { InventoryService } from '../inventory/inventory.service';
import { PurchaseOrdersService } from '../purchase-orders/purchase-orders.service';

export interface MaterialRequirement {
  material_id: string;
  material: Material;
  bom_quantity: number;
  scrap_factor: number;
  required_quantity: number;
  reference_designators: string | null;
  resource_type: string | null;
}

export interface OrderRequirements {
  order_id: string;
  order_number: string;
  product_name: string;
  order_quantity: number;
  bom_revision_id: string;
  bom_revision_number: string;
  requirements: MaterialRequirement[];
  total_line_items: number;
}

export interface MaterialShortage {
  material_id: string;
  material: Material;
  quantity_on_hand: number;
  quantity_allocated: number;
  quantity_available: number;
  quantity_on_order: number;
  total_required: number;
  shortage: number;
  orders: Array<{
    order_id: string;
    order_number: string;
    product_name: string;
    required_quantity: number;
    allocated_quantity: number;
    due_date: Date;
  }>;
}

export interface ShortageReport {
  generated_at: Date;
  total_materials_with_shortage: number;
  total_orders_analyzed: number;
  shortages: MaterialShortage[];
}

// Enhanced shortage interfaces for new views
export interface EnhancedOrderInfo {
  order_id: string;
  order_number: string;
  product_id: string;
  product_name: string;
  customer_id: string;
  customer_name: string;
  customer_code: string;
  required_quantity: number;
  allocated_quantity: number;
  due_date: Date;
}

export interface ResourceTypeUsage {
  resource_type: string;
  quantity_required: number;
  reference_designators: string | null;
}

export interface EnhancedMaterialShortage {
  material_id: string;
  material: Material;
  quantity_on_hand: number;
  quantity_allocated: number;
  quantity_available: number;
  quantity_on_order: number;
  total_required: number;
  shortage: number;
  orders: EnhancedOrderInfo[];
  resource_type_usages: ResourceTypeUsage[];
  affected_products: Array<{
    product_id: string;
    product_name: string;
    quantity_required: number;
  }>;
}

export interface EnhancedShortageReport {
  generated_at: Date;
  total_materials_with_shortage: number;
  total_orders_analyzed: number;
  shortages: EnhancedMaterialShortage[];
}

export interface CustomerShortage {
  customer_id: string;
  customer_name: string;
  customer_code: string;
  total_orders_affected: number;
  total_shortage_items: number;
  orders: Array<{
    order_id: string;
    order_number: string;
    product_name: string;
    due_date: Date;
    shortages: Array<{
      material_id: string;
      ipn: string;
      description: string | null;
      shortage: number;
    }>;
  }>;
}

export interface ShortagesByCustomerReport {
  generated_at: Date;
  total_customers_affected: number;
  customers: CustomerShortage[];
}

export interface ResourceTypeShortage {
  resource_type: string;
  total_materials_short: number;
  total_shortage_quantity: number;
  materials: Array<{
    material_id: string;
    ipn: string;
    description: string | null;
    shortage: number;
    total_required: number;
    quantity_available: number;
    quantity_on_order: number;
    affected_orders_count: number;
  }>;
}

export interface ShortagesByResourceTypeReport {
  generated_at: Date;
  resource_types: ResourceTypeShortage[];
}

export type BuildabilityStatus = 'CAN_BUILD' | 'PARTIAL' | 'BLOCKED';

export interface OrderBuildability {
  order_id: string;
  order_number: string;
  customer_id: string;
  customer_name: string;
  customer_code: string;
  product_id: string;
  product_name: string;
  due_date: Date;
  quantity: number;
  status: BuildabilityStatus;
  materials_ready: number;
  materials_short: number;
  materials_total: number;
  critical_shortages: Array<{
    material_id: string;
    ipn: string;
    description: string | null;
    required: number;
    available: number;
    on_order: number;
    shortage: number;        // Per-order shortage: how much THIS order is short
    global_shortage: number; // Global shortage: total demand - total supply across ALL orders
  }>;
}

export interface OrderBuildabilityReport {
  generated_at: Date;
  total_orders: number;
  can_build_count: number;
  partial_count: number;
  blocked_count: number;
  orders: OrderBuildability[];
}

@Injectable()
export class MrpService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(BomItem)
    private readonly bomItemRepository: Repository<BomItem>,
    @InjectRepository(Material)
    private readonly materialRepository: Repository<Material>,
    private readonly inventoryService: InventoryService,
    @Inject(forwardRef(() => PurchaseOrdersService))
    private readonly purchaseOrdersService: PurchaseOrdersService,
  ) {}

  /**
   * Calculate material requirements for a single order
   */
  async getOrderRequirements(orderId: string): Promise<OrderRequirements> {
    // Get the order with its product and BOM revision
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: ['product', 'bom_revision'],
    });

    if (!order) {
      throw new NotFoundException(`Order with ID "${orderId}" not found`);
    }

    // Get BOM items for the order's locked BOM revision
    const bomItems = await this.bomItemRepository.find({
      where: { bom_revision_id: order.bom_revision_id },
      relations: ['material'],
      order: { line_number: 'ASC' },
    });

    // Calculate requirements for each material
    const requirements: MaterialRequirement[] = bomItems.map((item) => {
      const bomQuantity = parseFloat(String(item.quantity_required));
      const scrapFactor = parseFloat(String(item.scrap_factor)) || 0;

      // required = order_qty × bom_qty × (1 + scrap_factor / 100)
      const requiredQuantity =
        order.quantity * bomQuantity * (1 + scrapFactor / 100);

      return {
        material_id: item.material_id,
        material: item.material,
        bom_quantity: bomQuantity,
        scrap_factor: scrapFactor,
        required_quantity: Math.ceil(requiredQuantity * 10000) / 10000, // Round to 4 decimals
        reference_designators: item.reference_designators,
        resource_type: item.resource_type,
      };
    });

    return {
      order_id: order.id,
      order_number: order.order_number,
      product_name: order.product?.name ?? 'Unknown',
      order_quantity: order.quantity,
      bom_revision_id: order.bom_revision_id,
      bom_revision_number: order.bom_revision?.revision_number ?? 'Unknown',
      requirements,
      total_line_items: requirements.length,
    };
  }

  /**
   * Calculate material shortages across all active orders
   * Active orders: PENDING, CONFIRMED, IN_PRODUCTION
   *
   * IMPORTANT: This now uses AVAILABLE quantity (on_hand - allocated)
   * to properly account for materials already reserved for other orders.
   */
  async getShortages(
    includeStatuses?: OrderStatus[],
  ): Promise<ShortageReport> {
    // Default to orders that need materials
    const statuses = includeStatuses ?? [
      OrderStatus.ENTERED,
      OrderStatus.KITTING,
      OrderStatus.SMT,
      OrderStatus.TH,
    ];

    // Get all active orders
    const orders = await this.orderRepository.find({
      where: { status: In(statuses) },
      relations: ['product', 'bom_revision'],
      order: { due_date: 'ASC' },
    });

    if (orders.length === 0) {
      return {
        generated_at: new Date(),
        total_materials_with_shortage: 0,
        total_orders_analyzed: 0,
        shortages: [],
      };
    }

    // Get all BOM revision IDs from orders
    const bomRevisionIds = [...new Set(orders.map((o) => o.bom_revision_id))];

    // Get all BOM items for these revisions
    const bomItems = await this.bomItemRepository.find({
      where: { bom_revision_id: In(bomRevisionIds) },
      relations: ['material'],
    });

    // Build a map of bom_revision_id -> items
    const bomItemsByRevision = new Map<string, BomItem[]>();
    for (const item of bomItems) {
      const items = bomItemsByRevision.get(item.bom_revision_id) ?? [];
      items.push(item);
      bomItemsByRevision.set(item.bom_revision_id, items);
    }

    // Get existing allocations for all orders
    const orderIds = orders.map((o) => o.id);
    const allocationsByOrder = new Map<string, Map<string, number>>();

    for (const orderId of orderIds) {
      const allocations = await this.inventoryService.getAllocationsByOrder(orderId, false);
      const materialMap = new Map<string, number>();
      for (const alloc of allocations) {
        materialMap.set(alloc.material_id, parseFloat(String(alloc.quantity)));
      }
      allocationsByOrder.set(orderId, materialMap);
    }

    // Calculate total requirements per material across all orders
    const materialRequirements = new Map<
      string,
      {
        material: Material;
        total_required: number;
        orders: Array<{
          order_id: string;
          order_number: string;
          product_name: string;
          required_quantity: number;
          allocated_quantity: number;
          due_date: Date;
        }>;
      }
    >();

    for (const order of orders) {
      const items = bomItemsByRevision.get(order.bom_revision_id) ?? [];
      const orderAllocations = allocationsByOrder.get(order.id) ?? new Map();

      for (const item of items) {
        const bomQuantity = parseFloat(String(item.quantity_required));
        const scrapFactor = parseFloat(String(item.scrap_factor)) || 0;
        const requiredQuantity =
          order.quantity * bomQuantity * (1 + scrapFactor / 100);
        const allocatedQuantity = orderAllocations.get(item.material_id) ?? 0;

        const existing = materialRequirements.get(item.material_id);
        if (existing) {
          existing.total_required += requiredQuantity;
          existing.orders.push({
            order_id: order.id,
            order_number: order.order_number,
            product_name: order.product?.name ?? 'Unknown',
            required_quantity: requiredQuantity,
            allocated_quantity: allocatedQuantity,
            due_date: order.due_date,
          });
        } else {
          materialRequirements.set(item.material_id, {
            material: item.material,
            total_required: requiredQuantity,
            orders: [
              {
                order_id: order.id,
                order_number: order.order_number,
                product_name: order.product?.name ?? 'Unknown',
                required_quantity: requiredQuantity,
                allocated_quantity: allocatedQuantity,
                due_date: order.due_date,
              },
            ],
          });
        }
      }
    }

    // Get current stock levels (with allocation info) for all required materials
    const materialIds = [...materialRequirements.keys()];
    const stockLevels = new Map<string, { on_hand: number; allocated: number; available: number; on_order: number }>();

    // Get on-order quantities for all materials in one batch
    const onOrderQuantities = await this.purchaseOrdersService.getQuantitiesOnOrder(materialIds);

    for (const materialId of materialIds) {
      const stock = await this.inventoryService.getStockByMaterialId(materialId);
      stockLevels.set(materialId, {
        on_hand: stock.quantity_on_hand,
        allocated: stock.quantity_allocated,
        available: stock.quantity_available,
        on_order: onOrderQuantities.get(materialId) ?? 0,
      });
    }

    // Calculate shortages factoring in on-order quantities
    const shortages: MaterialShortage[] = [];

    for (const [materialId, req] of materialRequirements) {
      const stock = stockLevels.get(materialId) ?? { on_hand: 0, allocated: 0, available: 0, on_order: 0 };

      // Effective supply = on_hand + on_order (materials expected from open POs)
      // Shortage is calculated against this effective supply
      const effectiveSupply = stock.on_hand + stock.on_order;
      const shortage = req.total_required - effectiveSupply;

      if (shortage > 0) {
        shortages.push({
          material_id: materialId,
          material: req.material,
          quantity_on_hand: stock.on_hand,
          quantity_allocated: stock.allocated,
          quantity_available: stock.available,
          quantity_on_order: stock.on_order,
          total_required: Math.ceil(req.total_required * 10000) / 10000,
          shortage: Math.ceil(shortage * 10000) / 10000,
          orders: req.orders.map((o) => ({
            ...o,
            required_quantity: Math.ceil(o.required_quantity * 10000) / 10000,
            allocated_quantity: Math.ceil(o.allocated_quantity * 10000) / 10000,
          })),
        });
      }
    }

    // Sort by shortage amount (descending)
    shortages.sort((a, b) => b.shortage - a.shortage);

    return {
      generated_at: new Date(),
      total_materials_with_shortage: shortages.length,
      total_orders_analyzed: orders.length,
      shortages,
    };
  }

  /**
   * Get a summary of requirements for all active orders
   * Useful for procurement planning
   *
   * Now includes allocation information for each material
   */
  async getRequirementsSummary(): Promise<{
    generated_at: Date;
    total_orders: number;
    materials: Array<{
      material_id: string;
      material: Material;
      total_required: number;
      quantity_on_hand: number;
      quantity_allocated: number;
      quantity_available: number;
      quantity_on_order: number;
      net_requirement: number;
    }>;
  }> {
    const statuses = [
      OrderStatus.ENTERED,
      OrderStatus.KITTING,
      OrderStatus.SMT,
      OrderStatus.TH,
    ];

    const orders = await this.orderRepository.find({
      where: { status: In(statuses) },
      relations: ['product', 'bom_revision'],
    });

    const bomRevisionIds = [...new Set(orders.map((o) => o.bom_revision_id))];

    const bomItems = await this.bomItemRepository.find({
      where: { bom_revision_id: In(bomRevisionIds) },
      relations: ['material'],
    });

    const bomItemsByRevision = new Map<string, BomItem[]>();
    for (const item of bomItems) {
      const items = bomItemsByRevision.get(item.bom_revision_id) ?? [];
      items.push(item);
      bomItemsByRevision.set(item.bom_revision_id, items);
    }

    const materialRequirements = new Map<
      string,
      { material: Material; total_required: number }
    >();

    for (const order of orders) {
      const items = bomItemsByRevision.get(order.bom_revision_id) ?? [];

      for (const item of items) {
        const bomQuantity = parseFloat(String(item.quantity_required));
        const scrapFactor = parseFloat(String(item.scrap_factor)) || 0;
        const requiredQuantity =
          order.quantity * bomQuantity * (1 + scrapFactor / 100);

        const existing = materialRequirements.get(item.material_id);
        if (existing) {
          existing.total_required += requiredQuantity;
        } else {
          materialRequirements.set(item.material_id, {
            material: item.material,
            total_required: requiredQuantity,
          });
        }
      }
    }

    const materials: Array<{
      material_id: string;
      material: Material;
      total_required: number;
      quantity_on_hand: number;
      quantity_allocated: number;
      quantity_available: number;
      quantity_on_order: number;
      net_requirement: number;
    }> = [];

    // Get all material IDs for batch on-order lookup
    const materialIds = [...materialRequirements.keys()];
    const onOrderQuantities = await this.purchaseOrdersService.getQuantitiesOnOrder(materialIds);

    for (const [materialId, req] of materialRequirements) {
      const stock = await this.inventoryService.getStockByMaterialId(materialId);
      const quantityOnOrder = onOrderQuantities.get(materialId) ?? 0;

      // Net requirement factors in on-order quantities
      // Net = total_required - on_hand - on_order
      const effectiveSupply = stock.quantity_on_hand + quantityOnOrder;
      const netRequirement = Math.max(0, req.total_required - effectiveSupply);

      materials.push({
        material_id: materialId,
        material: req.material,
        total_required: Math.ceil(req.total_required * 10000) / 10000,
        quantity_on_hand: stock.quantity_on_hand,
        quantity_allocated: stock.quantity_allocated,
        quantity_available: stock.quantity_available,
        quantity_on_order: quantityOnOrder,
        net_requirement: Math.ceil(netRequirement * 10000) / 10000,
      });
    }

    // Sort by net requirement (descending)
    materials.sort((a, b) => b.net_requirement - a.net_requirement);

    return {
      generated_at: new Date(),
      total_orders: orders.length,
      materials,
    };
  }

  /**
   * Get availability status for an order
   * Shows which materials are fully available, partially available, or unavailable
   */
  async getOrderAvailability(orderId: string): Promise<{
    order_id: string;
    order_number: string;
    status: 'FULLY_AVAILABLE' | 'PARTIALLY_AVAILABLE' | 'NOT_AVAILABLE';
    materials: Array<{
      material_id: string;
      material: Material;
      required_quantity: number;
      quantity_available: number;
      quantity_on_order: number;
      quantity_allocated_to_order: number;
      can_fulfill: boolean;
      shortage: number;
    }>;
  }> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: ['product', 'bom_revision'],
    });

    if (!order) {
      throw new NotFoundException(`Order with ID "${orderId}" not found`);
    }

    const bomItems = await this.bomItemRepository.find({
      where: { bom_revision_id: order.bom_revision_id },
      relations: ['material'],
      order: { line_number: 'ASC' },
    });

    // Get existing allocations for this order
    const existingAllocations = await this.inventoryService.getAllocationsByOrder(orderId, false);
    const allocationMap = new Map<string, number>();
    for (const alloc of existingAllocations) {
      allocationMap.set(alloc.material_id, parseFloat(String(alloc.quantity)));
    }

    const materials: Array<{
      material_id: string;
      material: Material;
      required_quantity: number;
      quantity_available: number;
      quantity_on_order: number;
      quantity_allocated_to_order: number;
      can_fulfill: boolean;
      shortage: number;
    }> = [];

    let fullyAvailable = 0;
    let partiallyAvailable = 0;
    let notAvailable = 0;

    // Get on-order quantities for all BOM materials
    const bomMaterialIds = bomItems.map((item) => item.material_id);
    const onOrderQuantities = await this.purchaseOrdersService.getQuantitiesOnOrder(bomMaterialIds);

    for (const item of bomItems) {
      const bomQuantity = parseFloat(String(item.quantity_required));
      const scrapFactor = parseFloat(String(item.scrap_factor)) || 0;
      const requiredQuantity = order.quantity * bomQuantity * (1 + scrapFactor / 100);

      const stock = await this.inventoryService.getStockByMaterialId(item.material_id);
      const allocatedToOrder = allocationMap.get(item.material_id) ?? 0;
      const quantityOnOrder = onOrderQuantities.get(item.material_id) ?? 0;

      // Available for this order = general available + already allocated to this order + on order
      const effectiveAvailable = stock.quantity_available + allocatedToOrder + quantityOnOrder;
      const canFulfill = effectiveAvailable >= requiredQuantity;
      const shortage = Math.max(0, requiredQuantity - effectiveAvailable);

      materials.push({
        material_id: item.material_id,
        material: item.material,
        required_quantity: Math.ceil(requiredQuantity * 10000) / 10000,
        quantity_available: stock.quantity_available,
        quantity_on_order: quantityOnOrder,
        quantity_allocated_to_order: allocatedToOrder,
        can_fulfill: canFulfill,
        shortage: Math.ceil(shortage * 10000) / 10000,
      });

      if (canFulfill) {
        fullyAvailable++;
      } else if (effectiveAvailable > 0) {
        partiallyAvailable++;
      } else {
        notAvailable++;
      }
    }

    let status: 'FULLY_AVAILABLE' | 'PARTIALLY_AVAILABLE' | 'NOT_AVAILABLE';
    if (fullyAvailable === materials.length) {
      status = 'FULLY_AVAILABLE';
    } else if (notAvailable === materials.length) {
      status = 'NOT_AVAILABLE';
    } else {
      status = 'PARTIALLY_AVAILABLE';
    }

    return {
      order_id: orderId,
      order_number: order.order_number,
      status,
      materials,
    };
  }

  /**
   * Get enhanced shortages with customer info, resource types, and affected products
   */
  async getEnhancedShortages(
    includeStatuses?: OrderStatus[],
  ): Promise<EnhancedShortageReport> {
    const statuses = includeStatuses ?? [
      OrderStatus.ENTERED,
      OrderStatus.KITTING,
      OrderStatus.SMT,
      OrderStatus.TH,
    ];

    // Get all active orders with customer info
    const orders = await this.orderRepository.find({
      where: { status: In(statuses) },
      relations: ['product', 'bom_revision', 'customer'],
      order: { due_date: 'ASC' },
    });

    if (orders.length === 0) {
      return {
        generated_at: new Date(),
        total_materials_with_shortage: 0,
        total_orders_analyzed: 0,
        shortages: [],
      };
    }

    const bomRevisionIds = [...new Set(orders.map((o) => o.bom_revision_id))];

    const bomItems = await this.bomItemRepository.find({
      where: { bom_revision_id: In(bomRevisionIds) },
      relations: ['material'],
    });

    const bomItemsByRevision = new Map<string, BomItem[]>();
    for (const item of bomItems) {
      const items = bomItemsByRevision.get(item.bom_revision_id) ?? [];
      items.push(item);
      bomItemsByRevision.set(item.bom_revision_id, items);
    }

    // Get existing allocations for all orders
    const orderIds = orders.map((o) => o.id);
    const allocationsByOrder = new Map<string, Map<string, number>>();

    for (const orderId of orderIds) {
      const allocations = await this.inventoryService.getAllocationsByOrder(orderId, false);
      const materialMap = new Map<string, number>();
      for (const alloc of allocations) {
        materialMap.set(alloc.material_id, parseFloat(String(alloc.quantity)));
      }
      allocationsByOrder.set(orderId, materialMap);
    }

    // Track material requirements with enhanced info
    const materialRequirements = new Map<
      string,
      {
        material: Material;
        total_required: number;
        orders: EnhancedOrderInfo[];
        resource_type_usages: Map<string, { quantity: number; refdes: string | null }>;
        affected_products: Map<string, { name: string; quantity: number }>;
      }
    >();

    for (const order of orders) {
      const items = bomItemsByRevision.get(order.bom_revision_id) ?? [];
      const orderAllocations = allocationsByOrder.get(order.id) ?? new Map();

      for (const item of items) {
        const bomQuantity = parseFloat(String(item.quantity_required));
        const scrapFactor = parseFloat(String(item.scrap_factor)) || 0;
        const requiredQuantity =
          order.quantity * bomQuantity * (1 + scrapFactor / 100);
        const allocatedQuantity = orderAllocations.get(item.material_id) ?? 0;
        const resourceType = item.resource_type ?? 'UNKNOWN';

        const existing = materialRequirements.get(item.material_id);
        if (existing) {
          existing.total_required += requiredQuantity;
          existing.orders.push({
            order_id: order.id,
            order_number: order.order_number,
            product_id: order.product_id,
            product_name: order.product?.name ?? 'Unknown',
            customer_id: order.customer_id,
            customer_name: order.customer?.name ?? 'Unknown',
            customer_code: order.customer?.code ?? '',
            required_quantity: requiredQuantity,
            allocated_quantity: allocatedQuantity,
            due_date: order.due_date,
          });

          // Track resource type usage
          const rtUsage = existing.resource_type_usages.get(resourceType);
          if (rtUsage) {
            rtUsage.quantity += requiredQuantity;
            if (item.reference_designators) {
              rtUsage.refdes = rtUsage.refdes
                ? `${rtUsage.refdes}, ${item.reference_designators}`
                : item.reference_designators;
            }
          } else {
            existing.resource_type_usages.set(resourceType, {
              quantity: requiredQuantity,
              refdes: item.reference_designators,
            });
          }

          // Track affected products
          const productUsage = existing.affected_products.get(order.product_id);
          if (productUsage) {
            productUsage.quantity += requiredQuantity;
          } else {
            existing.affected_products.set(order.product_id, {
              name: order.product?.name ?? 'Unknown',
              quantity: requiredQuantity,
            });
          }
        } else {
          const resourceTypeUsages = new Map<string, { quantity: number; refdes: string | null }>();
          resourceTypeUsages.set(resourceType, {
            quantity: requiredQuantity,
            refdes: item.reference_designators,
          });

          const affectedProducts = new Map<string, { name: string; quantity: number }>();
          affectedProducts.set(order.product_id, {
            name: order.product?.name ?? 'Unknown',
            quantity: requiredQuantity,
          });

          materialRequirements.set(item.material_id, {
            material: item.material,
            total_required: requiredQuantity,
            orders: [
              {
                order_id: order.id,
                order_number: order.order_number,
                product_id: order.product_id,
                product_name: order.product?.name ?? 'Unknown',
                customer_id: order.customer_id,
                customer_name: order.customer?.name ?? 'Unknown',
                customer_code: order.customer?.code ?? '',
                required_quantity: requiredQuantity,
                allocated_quantity: allocatedQuantity,
                due_date: order.due_date,
              },
            ],
            resource_type_usages: resourceTypeUsages,
            affected_products: affectedProducts,
          });
        }
      }
    }

    // Get stock levels and on-order quantities
    const materialIds = [...materialRequirements.keys()];
    const stockLevels = new Map<string, { on_hand: number; allocated: number; available: number; on_order: number }>();
    const onOrderQuantities = await this.purchaseOrdersService.getQuantitiesOnOrder(materialIds);

    for (const materialId of materialIds) {
      const stock = await this.inventoryService.getStockByMaterialId(materialId);
      stockLevels.set(materialId, {
        on_hand: stock.quantity_on_hand,
        allocated: stock.quantity_allocated,
        available: stock.quantity_available,
        on_order: onOrderQuantities.get(materialId) ?? 0,
      });
    }

    // Calculate shortages
    const shortages: EnhancedMaterialShortage[] = [];

    for (const [materialId, req] of materialRequirements) {
      const stock = stockLevels.get(materialId) ?? { on_hand: 0, allocated: 0, available: 0, on_order: 0 };
      const effectiveSupply = stock.on_hand + stock.on_order;
      const shortage = req.total_required - effectiveSupply;

      if (shortage > 0) {
        shortages.push({
          material_id: materialId,
          material: req.material,
          quantity_on_hand: stock.on_hand,
          quantity_allocated: stock.allocated,
          quantity_available: stock.available,
          quantity_on_order: stock.on_order,
          total_required: Math.ceil(req.total_required * 10000) / 10000,
          shortage: Math.ceil(shortage * 10000) / 10000,
          orders: req.orders.map((o) => ({
            ...o,
            required_quantity: Math.ceil(o.required_quantity * 10000) / 10000,
            allocated_quantity: Math.ceil(o.allocated_quantity * 10000) / 10000,
          })),
          resource_type_usages: Array.from(req.resource_type_usages.entries()).map(([rt, usage]) => ({
            resource_type: rt,
            quantity_required: Math.ceil(usage.quantity * 10000) / 10000,
            reference_designators: usage.refdes,
          })),
          affected_products: Array.from(req.affected_products.entries()).map(([productId, usage]) => ({
            product_id: productId,
            product_name: usage.name,
            quantity_required: Math.ceil(usage.quantity * 10000) / 10000,
          })),
        });
      }
    }

    shortages.sort((a, b) => b.shortage - a.shortage);

    return {
      generated_at: new Date(),
      total_materials_with_shortage: shortages.length,
      total_orders_analyzed: orders.length,
      shortages,
    };
  }

  /**
   * Get shortages grouped by customer
   */
  async getShortagesByCustomer(
    includeStatuses?: OrderStatus[],
  ): Promise<ShortagesByCustomerReport> {
    const enhancedReport = await this.getEnhancedShortages(includeStatuses);

    // Group shortages by customer
    const customerMap = new Map<string, CustomerShortage>();

    for (const shortage of enhancedReport.shortages) {
      for (const order of shortage.orders) {
        let customerData = customerMap.get(order.customer_id);

        if (!customerData) {
          customerData = {
            customer_id: order.customer_id,
            customer_name: order.customer_name,
            customer_code: order.customer_code,
            total_orders_affected: 0,
            total_shortage_items: 0,
            orders: [],
          };
          customerMap.set(order.customer_id, customerData);
        }

        // Find or create order entry
        let orderEntry = customerData.orders.find((o) => o.order_id === order.order_id);
        if (!orderEntry) {
          orderEntry = {
            order_id: order.order_id,
            order_number: order.order_number,
            product_name: order.product_name,
            due_date: order.due_date,
            shortages: [],
          };
          customerData.orders.push(orderEntry);
        }

        orderEntry.shortages.push({
          material_id: shortage.material_id,
          ipn: shortage.material.internal_part_number,
          description: shortage.material.description,
          shortage: shortage.shortage,
        });
      }
    }

    // Calculate totals
    const customers = Array.from(customerMap.values()).map((customer) => {
      customer.total_orders_affected = customer.orders.length;
      customer.total_shortage_items = customer.orders.reduce(
        (sum, order) => sum + order.shortages.length,
        0,
      );
      // Sort orders by due date
      customer.orders.sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
      return customer;
    });

    // Sort customers by total shortage items (descending)
    customers.sort((a, b) => b.total_shortage_items - a.total_shortage_items);

    return {
      generated_at: new Date(),
      total_customers_affected: customers.length,
      customers,
    };
  }

  /**
   * Get shortages grouped by resource type (SMT, TH, MECH, PCB)
   */
  async getShortagesByResourceType(
    includeStatuses?: OrderStatus[],
  ): Promise<ShortagesByResourceTypeReport> {
    const enhancedReport = await this.getEnhancedShortages(includeStatuses);

    // Group materials by resource type (a material can appear in multiple types)
    const resourceTypeMap = new Map<string, ResourceTypeShortage>();

    for (const shortage of enhancedReport.shortages) {
      for (const rtUsage of shortage.resource_type_usages) {
        let rtData = resourceTypeMap.get(rtUsage.resource_type);

        if (!rtData) {
          rtData = {
            resource_type: rtUsage.resource_type,
            total_materials_short: 0,
            total_shortage_quantity: 0,
            materials: [],
          };
          resourceTypeMap.set(rtUsage.resource_type, rtData);
        }

        // Check if this material is already in this resource type
        const existingMaterial = rtData.materials.find((m) => m.material_id === shortage.material_id);
        if (!existingMaterial) {
          rtData.materials.push({
            material_id: shortage.material_id,
            ipn: shortage.material.internal_part_number,
            description: shortage.material.description,
            shortage: shortage.shortage,
            total_required: shortage.total_required,
            quantity_available: shortage.quantity_available,
            quantity_on_order: shortage.quantity_on_order,
            affected_orders_count: shortage.orders.length,
          });
          rtData.total_materials_short++;
          rtData.total_shortage_quantity += shortage.shortage;
        }
      }
    }

    // Sort resource types by priority (SMT, TH, MECH, PCB, others)
    const priorityOrder = ['SMT', 'TH', 'MECH', 'PCB', 'DNP', 'UNKNOWN'];
    const resourceTypes = Array.from(resourceTypeMap.values()).sort((a, b) => {
      const aIndex = priorityOrder.indexOf(a.resource_type);
      const bIndex = priorityOrder.indexOf(b.resource_type);
      return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
    });

    // Sort materials within each type by shortage (descending)
    for (const rt of resourceTypes) {
      rt.materials.sort((a, b) => b.shortage - a.shortage);
    }

    return {
      generated_at: new Date(),
      resource_types: resourceTypes,
    };
  }

  /**
   * Get order buildability status - which orders can be built, are partial, or blocked
   *
   * Uses the GLOBAL shortage calculation to determine if materials are short.
   * A material is considered short for an order if:
   * 1. The order requires that material, AND
   * 2. The material has a global shortage (total demand > total supply)
   */
  async getOrderBuildability(
    includeStatuses?: OrderStatus[],
  ): Promise<OrderBuildabilityReport> {
    const statuses = includeStatuses ?? [
      OrderStatus.ENTERED,
      OrderStatus.KITTING,
      OrderStatus.SMT,
      OrderStatus.TH,
    ];

    const orders = await this.orderRepository.find({
      where: { status: In(statuses) },
      relations: ['product', 'bom_revision', 'customer'],
      order: { due_date: 'ASC' },
    });

    if (orders.length === 0) {
      return {
        generated_at: new Date(),
        total_orders: 0,
        can_build_count: 0,
        partial_count: 0,
        blocked_count: 0,
        orders: [],
      };
    }

    const bomRevisionIds = [...new Set(orders.map((o) => o.bom_revision_id))];

    const bomItems = await this.bomItemRepository.find({
      where: { bom_revision_id: In(bomRevisionIds) },
      relations: ['material'],
    });

    const bomItemsByRevision = new Map<string, BomItem[]>();
    for (const item of bomItems) {
      const items = bomItemsByRevision.get(item.bom_revision_id) ?? [];
      items.push(item);
      bomItemsByRevision.set(item.bom_revision_id, items);
    }

    // Get all material IDs across all BOMs for batch stock lookup
    const allMaterialIds = [...new Set(bomItems.map((item) => item.material_id))];
    const onOrderQuantities = await this.purchaseOrdersService.getQuantitiesOnOrder(allMaterialIds);

    // Pre-fetch stock levels for all materials
    const stockLevels = new Map<string, { on_hand: number; allocated: number; available: number }>();
    for (const materialId of allMaterialIds) {
      const stock = await this.inventoryService.getStockByMaterialId(materialId);
      stockLevels.set(materialId, {
        on_hand: stock.quantity_on_hand,
        allocated: stock.quantity_allocated,
        available: stock.quantity_available,
      });
    }

    // Calculate TOTAL requirements per material across ALL orders (for global shortage calc)
    const totalMaterialRequirements = new Map<string, number>();
    for (const order of orders) {
      const items = bomItemsByRevision.get(order.bom_revision_id) ?? [];
      for (const item of items) {
        const bomQuantity = parseFloat(String(item.quantity_required));
        const scrapFactor = parseFloat(String(item.scrap_factor)) || 0;
        const requiredQuantity = order.quantity * bomQuantity * (1 + scrapFactor / 100);

        const existing = totalMaterialRequirements.get(item.material_id) ?? 0;
        totalMaterialRequirements.set(item.material_id, existing + requiredQuantity);
      }
    }

    // Calculate GLOBAL shortages (same logic as getShortages/getEnhancedShortages)
    const globalShortages = new Map<string, number>();
    for (const [materialId, totalRequired] of totalMaterialRequirements) {
      const stock = stockLevels.get(materialId) ?? { on_hand: 0, allocated: 0, available: 0 };
      const quantityOnOrder = onOrderQuantities.get(materialId) ?? 0;
      const effectiveSupply = stock.on_hand + quantityOnOrder;
      const shortage = totalRequired - effectiveSupply;
      if (shortage > 0) {
        globalShortages.set(materialId, shortage);
      }
    }

    // Get allocations for all orders (for display purposes)
    const allocationsByOrder = new Map<string, Map<string, number>>();
    for (const order of orders) {
      const allocations = await this.inventoryService.getAllocationsByOrder(order.id, false);
      const materialMap = new Map<string, number>();
      for (const alloc of allocations) {
        materialMap.set(alloc.material_id, parseFloat(String(alloc.quantity)));
      }
      allocationsByOrder.set(order.id, materialMap);
    }

    const orderBuildability: OrderBuildability[] = [];
    let canBuildCount = 0;
    let partialCount = 0;
    let blockedCount = 0;

    for (const order of orders) {
      const items = bomItemsByRevision.get(order.bom_revision_id) ?? [];
      const orderAllocations = allocationsByOrder.get(order.id) ?? new Map();

      let materialsReady = 0;
      let materialsShort = 0;
      const criticalShortages: Array<{
        material_id: string;
        ipn: string;
        description: string | null;
        required: number;
        available: number;
        on_order: number;
        shortage: number;
        global_shortage: number;
      }> = [];

      for (const item of items) {
        const bomQuantity = parseFloat(String(item.quantity_required));
        const scrapFactor = parseFloat(String(item.scrap_factor)) || 0;
        const requiredQuantity = order.quantity * bomQuantity * (1 + scrapFactor / 100);

        const stock = stockLevels.get(item.material_id) ?? { on_hand: 0, allocated: 0, available: 0 };
        const allocatedToOrder = orderAllocations.get(item.material_id) ?? 0;
        const quantityOnOrder = onOrderQuantities.get(item.material_id) ?? 0;

        // Check if this material has a GLOBAL shortage (total demand > total supply)
        const globalShortage = globalShortages.get(item.material_id) ?? 0;

        // Check if THIS ORDER specifically can be fulfilled from current supply
        // (available + already allocated to this order + on order)
        const effectiveAvailable = stock.available + allocatedToOrder;
        const totalSupplyForOrder = effectiveAvailable + quantityOnOrder;
        const orderShortage = Math.max(0, requiredQuantity - totalSupplyForOrder);

        // Material is short if there's EITHER a global shortage OR this order can't be fulfilled
        const isShort = globalShortage > 0 || orderShortage > 0;

        if (isShort) {
          materialsShort++;
          criticalShortages.push({
            material_id: item.material_id,
            ipn: item.material.internal_part_number,
            description: item.material.description,
            required: Math.ceil(requiredQuantity * 10000) / 10000,
            available: effectiveAvailable,
            on_order: quantityOnOrder,
            // Show the per-order shortage (how much this specific order is short)
            shortage: Math.ceil(orderShortage * 10000) / 10000,
            // Also include global shortage info
            global_shortage: Math.ceil(globalShortage * 10000) / 10000,
          });
        } else {
          materialsReady++;
        }
      }

      let status: BuildabilityStatus;
      if (materialsShort === 0) {
        status = 'CAN_BUILD';
        canBuildCount++;
      } else if (materialsReady === 0) {
        status = 'BLOCKED';
        blockedCount++;
      } else {
        status = 'PARTIAL';
        partialCount++;
      }

      // Sort critical shortages by shortage amount (descending)
      criticalShortages.sort((a, b) => b.shortage - a.shortage);

      orderBuildability.push({
        order_id: order.id,
        order_number: order.order_number,
        customer_id: order.customer_id,
        customer_name: order.customer?.name ?? 'Unknown',
        customer_code: order.customer?.code ?? '',
        product_id: order.product_id,
        product_name: order.product?.name ?? 'Unknown',
        due_date: order.due_date,
        quantity: order.quantity,
        status,
        materials_ready: materialsReady,
        materials_short: materialsShort,
        materials_total: items.length,
        critical_shortages: criticalShortages,
      });
    }

    return {
      generated_at: new Date(),
      total_orders: orders.length,
      can_build_count: canBuildCount,
      partial_count: partialCount,
      blocked_count: blockedCount,
      orders: orderBuildability,
    };
  }
}
