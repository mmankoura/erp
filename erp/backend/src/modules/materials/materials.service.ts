import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Material } from '../../entities/material.entity';
import { BomItem } from '../../entities/bom-item.entity';
import { BomRevision } from '../../entities/bom-revision.entity';
import { Order, OrderStatus } from '../../entities/order.entity';
import {
  CreateMaterialDto,
  UpdateMaterialDto,
  BulkCreateMaterialDto,
} from './dto';
import { FilterMaterialsDto } from './dto/filter-materials.dto';
import { AuditService } from '../audit/audit.service';
import {
  AuditEventType,
  AuditEntityType,
} from '../../entities/audit-event.entity';

/** Outcome of a bulk part-number lookup, partitioned by how confident the match is. */
export interface ResolvePartNumbersResult {
  matched: Array<{
    /** The part number as submitted. */
    part_number: string;
    material_id: string;
    internal_part_number: string;
    description: string | null;
    manufacturer: string | null;
    manufacturer_pn: string | null;
    resource_type: Material['resource_type'];
    customer_id: string | null;
  }>;
  /** Found only by ignoring case. Offered as a suggestion for the caller to accept. */
  case_mismatch: Array<{
    part_number: string;
    suggested: string;
    material_id: string;
  }>;
  /** No material exists; importing these would create them. */
  missing: string[];
}

// Active order statuses for where-used analysis
const ACTIVE_ORDER_STATUSES = [
  OrderStatus.ENTERED,
  OrderStatus.KITTING,
  OrderStatus.SMT,
  OrderStatus.TH,
];

export interface WhereUsedProduct {
  product_id: string;
  product_name: string;
  product_part_number: string;
  bom_revision_id: string;
  revision_number: string;
  is_active_revision: boolean;
  quantity_per_unit: number;
  resource_type: string | null;
}

export interface WhereUsedOrder {
  order_id: string;
  order_number: string;
  customer_name: string;
  product_name: string;
  order_quantity: number;
  total_required: number;
  status: OrderStatus;
  due_date: Date;
}

export interface UsageSummary {
  total_products: number;
  active_bom_count: number;
  open_orders_count: number;
  total_qty_required_by_open_orders: number;
}

@Injectable()
export class MaterialsService {
  constructor(
    @InjectRepository(Material)
    private readonly materialRepository: Repository<Material>,
    @InjectRepository(BomItem)
    private readonly bomItemRepository: Repository<BomItem>,
    @InjectRepository(BomRevision)
    private readonly bomRevisionRepository: Repository<BomRevision>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    private readonly auditService: AuditService,
  ) {}

  async findAll(): Promise<Material[]> {
    return this.materialRepository.find({
      relations: ['customer'],
      order: { internal_part_number: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Material> {
    const material = await this.materialRepository.findOne({
      where: { id },
      relations: ['customer'],
    });
    if (!material) {
      throw new NotFoundException(`Material with ID "${id}" not found`);
    }
    return material;
  }

  async findByPartNumber(partNumber: string): Promise<Material | null> {
    return this.materialRepository.findOne({
      where: { internal_part_number: partNumber },
    });
  }

  /**
   * Resolve many internal part numbers at once.
   *
   * Importing a BOM means asking "which of these 250 parts do we already have?"
   * There was no way to ask that, so the product page loads the entire material
   * catalogue into a dropdown to do it client-side.
   *
   * Case mismatches come back as *suggestions* rather than being silently
   * resolved. The existing import path rewrites the part number in place on a
   * case-insensitive hit and only warns, but then re-looks it up with an exact
   * match at commit time — so a preview that matched can create a duplicate
   * material on commit. Handing the decision back to the caller closes that.
   */
  async resolveByPartNumbers(
    partNumbers: string[],
  ): Promise<ResolvePartNumbersResult> {
    const unique = Array.from(
      new Set(partNumbers.map((p) => p.trim()).filter(Boolean)),
    );
    if (unique.length === 0) {
      return { matched: [], case_mismatch: [], missing: [] };
    }

    const exact = await this.materialRepository.find({
      where: { internal_part_number: In(unique) },
    });
    const byExact = new Map(exact.map((m) => [m.internal_part_number, m]));

    // Only the leftovers are worth a second, looser pass.
    const unresolved = unique.filter((p) => !byExact.has(p));
    const loose = unresolved.length
      ? await this.materialRepository
          .createQueryBuilder('material')
          .where('LOWER(material.internal_part_number) IN (:...lowered)', {
            lowered: unresolved.map((p) => p.toLowerCase()),
          })
          .getMany()
      : [];
    const byLower = new Map(
      loose.map((m) => [m.internal_part_number.toLowerCase(), m]),
    );

    const result: ResolvePartNumbersResult = {
      matched: [],
      case_mismatch: [],
      missing: [],
    };

    for (const partNumber of unique) {
      const hit = byExact.get(partNumber);
      if (hit) {
        result.matched.push({
          part_number: partNumber,
          material_id: hit.id,
          internal_part_number: hit.internal_part_number,
          description: hit.description,
          manufacturer: hit.manufacturer,
          manufacturer_pn: hit.manufacturer_pn,
          resource_type: hit.resource_type,
          customer_id: hit.customer_id,
        });
        continue;
      }

      const nearly = byLower.get(partNumber.toLowerCase());
      if (nearly) {
        result.case_mismatch.push({
          part_number: partNumber,
          suggested: nearly.internal_part_number,
          material_id: nearly.id,
        });
        continue;
      }

      result.missing.push(partNumber);
    }

    return result;
  }

  async create(createMaterialDto: CreateMaterialDto): Promise<Material> {
    const existing = await this.findByPartNumber(
      createMaterialDto.internal_part_number,
    );
    if (existing) {
      throw new ConflictException(
        `Material with part number "${createMaterialDto.internal_part_number}" already exists`,
      );
    }

    const material = this.materialRepository.create(createMaterialDto);
    return this.materialRepository.save(material);
  }

  async bulkCreate(
    bulkCreateDto: BulkCreateMaterialDto,
  ): Promise<{ created: Material[]; errors: Array<{ partNumber: string; error: string }> }> {
    const created: Material[] = [];
    const errors: Array<{ partNumber: string; error: string }> = [];

    // Check for duplicates within the input
    const partNumbers = bulkCreateDto.materials.map(m => m.internal_part_number);
    const duplicatesInInput = partNumbers.filter(
      (pn, index) => partNumbers.indexOf(pn) !== index,
    );
    if (duplicatesInInput.length > 0) {
      throw new ConflictException(
        `Duplicate part numbers in request: ${[...new Set(duplicatesInInput)].join(', ')}`,
      );
    }

    // Check for existing materials
    const existingMaterials = await this.materialRepository.find({
      where: { internal_part_number: In(partNumbers) },
    });
    const existingPartNumbers = new Set(
      existingMaterials.map(m => m.internal_part_number),
    );

    for (const dto of bulkCreateDto.materials) {
      if (existingPartNumbers.has(dto.internal_part_number)) {
        errors.push({
          partNumber: dto.internal_part_number,
          error: 'Material already exists',
        });
        continue;
      }

      const material = this.materialRepository.create(dto);
      const saved = await this.materialRepository.save(material);
      created.push(saved);
    }

    return { created, errors };
  }

  async update(
    id: string,
    updateMaterialDto: UpdateMaterialDto,
  ): Promise<Material> {
    const material = await this.findOne(id);

    // If updating part number, check for conflicts
    if (
      updateMaterialDto.internal_part_number &&
      updateMaterialDto.internal_part_number !== material.internal_part_number
    ) {
      const existing = await this.findByPartNumber(
        updateMaterialDto.internal_part_number,
      );
      if (existing) {
        throw new ConflictException(
          `Material with part number "${updateMaterialDto.internal_part_number}" already exists`,
        );
      }
    }

    Object.assign(material, updateMaterialDto);
    return this.materialRepository.save(material);
  }

  async remove(id: string, actor?: string): Promise<void> {
    const material = await this.findOne(id);
    await this.materialRepository.softRemove(material);

    // Emit audit event
    await this.auditService.emitDelete(
      AuditEventType.MATERIAL_DELETED,
      AuditEntityType.MATERIAL,
      id,
      {
        internal_part_number: material.internal_part_number,
        manufacturer_pn: material.manufacturer_pn,
        manufacturer: material.manufacturer,
        description: material.description,
        customer_id: material.customer_id,
      },
      actor,
    );
  }

  async restore(id: string): Promise<Material> {
    const material = await this.materialRepository.findOne({
      where: { id },
      withDeleted: true,
    });

    if (!material) {
      throw new NotFoundException(`Material with ID "${id}" not found`);
    }

    if (!material.deleted_at) {
      throw new ConflictException(`Material with ID "${id}" is not deleted`);
    }

    await this.materialRepository.restore(id);
    return this.findOne(id);
  }

  async findAllIncludingDeleted(): Promise<Material[]> {
    return this.materialRepository.find({
      withDeleted: true,
      order: { internal_part_number: 'ASC' },
    });
  }

  // ============ Where-Used Analysis ============

  /**
   * Get all products/BOMs that use this material
   * Filters to active BOM revisions only by default
   */
  async getWhereUsedProducts(
    materialId: string,
    activeRevisionsOnly: boolean = true,
  ): Promise<WhereUsedProduct[]> {
    // Verify material exists
    await this.findOne(materialId);

    const query = this.bomItemRepository
      .createQueryBuilder('item')
      .innerJoin('item.bom_revision', 'revision')
      .innerJoin('revision.product', 'product')
      .select([
        'product.id AS product_id',
        'product.name AS product_name',
        'product.part_number AS product_part_number',
        'revision.id AS bom_revision_id',
        'revision.revision_number AS revision_number',
        'revision.is_active AS is_active_revision',
        'item.quantity_required AS quantity_per_unit',
        'item.resource_type AS resource_type',
      ])
      .where('item.material_id = :materialId', { materialId });

    if (activeRevisionsOnly) {
      query.andWhere('revision.is_active = true');
    }

    query.orderBy('product.name', 'ASC');

    const results = await query.getRawMany();

    return results.map(row => ({
      product_id: row.product_id,
      product_name: row.product_name,
      product_part_number: row.product_part_number,
      bom_revision_id: row.bom_revision_id,
      revision_number: row.revision_number,
      is_active_revision: row.is_active_revision,
      quantity_per_unit: parseFloat(row.quantity_per_unit),
      resource_type: row.resource_type,
    }));
  }

  /**
   * Get all open orders that need this material
   */
  async getWhereUsedOrders(materialId: string): Promise<WhereUsedOrder[]> {
    // Verify material exists
    await this.findOne(materialId);

    const results = await this.orderRepository
      .createQueryBuilder('order')
      .innerJoin('order.bom_revision', 'revision')
      .innerJoin('revision.items', 'item')
      .innerJoin('order.customer', 'customer')
      .innerJoin('order.product', 'product')
      .select([
        'order.id AS order_id',
        'order.order_number AS order_number',
        'customer.name AS customer_name',
        'product.name AS product_name',
        'order.quantity AS order_quantity',
        'item.quantity_required AS qty_per_unit',
        'order.status AS status',
        'order.due_date AS due_date',
      ])
      .where('item.material_id = :materialId', { materialId })
      .andWhere('order.status IN (:...statuses)', { statuses: ACTIVE_ORDER_STATUSES })
      .andWhere('order.deleted_at IS NULL')
      .orderBy('order.due_date', 'ASC')
      .getRawMany();

    return results.map(row => ({
      order_id: row.order_id,
      order_number: row.order_number,
      customer_name: row.customer_name,
      product_name: row.product_name,
      order_quantity: parseInt(row.order_quantity),
      total_required: parseInt(row.order_quantity) * parseFloat(row.qty_per_unit),
      status: row.status,
      due_date: row.due_date,
    }));
  }

  /**
   * Get usage summary for a material
   */
  async getUsageSummary(materialId: string): Promise<UsageSummary> {
    // Verify material exists
    await this.findOne(materialId);

    // Count unique products with active BOMs using this material
    const productCountResult = await this.bomItemRepository
      .createQueryBuilder('item')
      .innerJoin('item.bom_revision', 'revision')
      .select('COUNT(DISTINCT revision.product_id)', 'count')
      .where('item.material_id = :materialId', { materialId })
      .andWhere('revision.is_active = true')
      .getRawOne();

    // Count active BOM revisions using this material
    const bomCountResult = await this.bomItemRepository
      .createQueryBuilder('item')
      .innerJoin('item.bom_revision', 'revision')
      .select('COUNT(DISTINCT revision.id)', 'count')
      .where('item.material_id = :materialId', { materialId })
      .andWhere('revision.is_active = true')
      .getRawOne();

    // Get open orders info
    const ordersResult = await this.orderRepository
      .createQueryBuilder('order')
      .innerJoin('order.bom_revision', 'revision')
      .innerJoin('revision.items', 'item')
      .select([
        'COUNT(DISTINCT order.id) AS order_count',
        'COALESCE(SUM(order.quantity * item.quantity_required), 0) AS total_qty',
      ])
      .where('item.material_id = :materialId', { materialId })
      .andWhere('order.status IN (:...statuses)', { statuses: ACTIVE_ORDER_STATUSES })
      .andWhere('order.deleted_at IS NULL')
      .getRawOne();

    return {
      total_products: parseInt(productCountResult?.count || '0'),
      active_bom_count: parseInt(bomCountResult?.count || '0'),
      open_orders_count: parseInt(ordersResult?.order_count || '0'),
      total_qty_required_by_open_orders: parseFloat(ordersResult?.total_qty || '0'),
    };
  }

  // ============ Relational Filtering ============

  async filterMaterials(dto: FilterMaterialsDto): Promise<Material[]> {
    if (!dto.filters || dto.filters.length === 0) {
      return this.findAll();
    }

    const logic = dto.logic || 'OR';
    const materialIdSets: Set<string>[] = [];

    for (const filter of dto.filters) {
      if (filter.ids.length === 0) continue;

      if (filter.type === 'product_revision') {
        // Get materials used in specified BOM revisions
        const items = await this.bomItemRepository.find({
          where: { bom_revision_id: In(filter.ids) },
          select: ['material_id'],
        });
        materialIdSets.push(new Set(items.map((i) => i.material_id)));
      } else if (filter.type === 'order') {
        // Get materials used by specified orders (via their BOM revisions)
        const orders = await this.orderRepository.find({
          where: { id: In(filter.ids) },
          select: ['bom_revision_id'],
        });
        const revisionIds = orders
          .map((o) => o.bom_revision_id)
          .filter(Boolean);
        if (revisionIds.length > 0) {
          const items = await this.bomItemRepository.find({
            where: { bom_revision_id: In(revisionIds) },
            select: ['material_id'],
          });
          materialIdSets.push(new Set(items.map((i) => i.material_id)));
        } else {
          materialIdSets.push(new Set());
        }
      }
    }

    if (materialIdSets.length === 0) {
      return this.findAll();
    }

    let resultIds: Set<string>;
    if (logic === 'AND') {
      // Intersection of all sets
      resultIds = materialIdSets.reduce((acc, set) => {
        return new Set([...acc].filter((id) => set.has(id)));
      });
    } else {
      // Union of all sets
      resultIds = new Set<string>();
      for (const set of materialIdSets) {
        for (const id of set) {
          resultIds.add(id);
        }
      }
    }

    if (resultIds.size === 0) {
      return [];
    }

    return this.materialRepository.find({
      where: { id: In([...resultIds]) },
      relations: ['customer'],
      order: { internal_part_number: 'ASC' },
    });
  }
}
