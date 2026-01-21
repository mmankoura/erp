import { Injectable, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Order, OrderStatus } from '../../entities/order.entity';
import { BomItem } from '../../entities/bom-item.entity';
import { Material } from '../../entities/material.entity';
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
      OrderStatus.PENDING,
      OrderStatus.CONFIRMED,
      OrderStatus.IN_PRODUCTION,
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
      OrderStatus.PENDING,
      OrderStatus.CONFIRMED,
      OrderStatus.IN_PRODUCTION,
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
}
