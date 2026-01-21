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
import { Repository, DataSource, In, MoreThanOrEqual } from 'typeorm';
import {
  PurchaseOrder,
  PurchaseOrderStatus,
} from '../../entities/purchase-order.entity';
import { PurchaseOrderLine } from '../../entities/purchase-order-line.entity';
import { Material } from '../../entities/material.entity';
import { Supplier } from '../../entities/supplier.entity';
import { ReceivingInspection } from '../../entities/receiving-inspection.entity';
import {
  InventoryTransaction,
  TransactionType,
  ReferenceType,
  InventoryBucket,
} from '../../entities/inventory-transaction.entity';
import {
  CreatePurchaseOrderDto,
  UpdatePurchaseOrderDto,
  ReceiveAgainstPODto,
  AddLineDto,
  UpdateLineDto,
} from './dto';
import { AuditService } from '../audit/audit.service';
import { ReceivingInspectionService } from '../receiving-inspection/receiving-inspection.service';

// Open statuses for quantity_on_order calculation
const OPEN_PO_STATUSES = [
  PurchaseOrderStatus.SUBMITTED,
  PurchaseOrderStatus.CONFIRMED,
  PurchaseOrderStatus.PARTIALLY_RECEIVED,
];

export interface QuantityOnOrder {
  material_id: string;
  quantity_on_order: number;
}

export interface ReceiptResult {
  purchase_order: PurchaseOrder;
  inspections: ReceivingInspection[];
  lines_updated: number;
  status_changed: boolean;
}

export interface PurchaseOrderFilters {
  status?: PurchaseOrderStatus;
  supplier_id?: string;
  from_date?: string;
  to_date?: string;
  includeDeleted?: boolean;
}

@Injectable()
export class PurchaseOrdersService {
  private readonly logger = new Logger(PurchaseOrdersService.name);

  constructor(
    @InjectRepository(PurchaseOrder)
    private readonly poRepository: Repository<PurchaseOrder>,
    @InjectRepository(PurchaseOrderLine)
    private readonly poLineRepository: Repository<PurchaseOrderLine>,
    @InjectRepository(Material)
    private readonly materialRepository: Repository<Material>,
    @InjectRepository(Supplier)
    private readonly supplierRepository: Repository<Supplier>,
    @InjectRepository(InventoryTransaction)
    private readonly transactionRepository: Repository<InventoryTransaction>,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    @Inject(forwardRef(() => ReceivingInspectionService))
    private readonly receivingInspectionService: ReceivingInspectionService,
  ) {}

  // ==================== CRUD OPERATIONS ====================

  async findAll(filters?: PurchaseOrderFilters): Promise<PurchaseOrder[]> {
    const queryBuilder = this.poRepository
      .createQueryBuilder('po')
      .leftJoinAndSelect('po.supplier', 'supplier')
      .leftJoinAndSelect('po.lines', 'lines')
      .leftJoinAndSelect('lines.material', 'material');

    if (filters?.status) {
      queryBuilder.andWhere('po.status = :status', { status: filters.status });
    }

    if (filters?.supplier_id) {
      queryBuilder.andWhere('po.supplier_id = :supplierId', {
        supplierId: filters.supplier_id,
      });
    }

    if (filters?.from_date) {
      queryBuilder.andWhere('po.order_date >= :fromDate', {
        fromDate: filters.from_date,
      });
    }

    if (filters?.to_date) {
      queryBuilder.andWhere('po.order_date <= :toDate', {
        toDate: filters.to_date,
      });
    }

    if (filters?.includeDeleted) {
      queryBuilder.withDeleted();
    }

    return queryBuilder
      .orderBy('po.created_at', 'DESC')
      .addOrderBy('lines.line_number', 'ASC')
      .getMany();
  }

  async findOne(id: string): Promise<PurchaseOrder> {
    const po = await this.poRepository.findOne({
      where: { id },
      relations: ['supplier', 'lines', 'lines.material'],
    });

    if (!po) {
      throw new NotFoundException(`Purchase Order with ID "${id}" not found`);
    }

    // Sort lines by line_number
    if (po.lines) {
      po.lines.sort((a, b) => a.line_number - b.line_number);
    }

    return po;
  }

  async findByPoNumber(poNumber: string): Promise<PurchaseOrder | null> {
    return this.poRepository.findOne({
      where: { po_number: poNumber },
      relations: ['supplier', 'lines', 'lines.material'],
    });
  }

  async create(dto: CreatePurchaseOrderDto): Promise<PurchaseOrder> {
    // Verify supplier exists
    const supplier = await this.supplierRepository.findOne({
      where: { id: dto.supplier_id },
    });
    if (!supplier) {
      throw new NotFoundException(
        `Supplier with ID "${dto.supplier_id}" not found`,
      );
    }

    // Generate PO number if not provided
    const poNumber = dto.po_number ?? (await this.generatePoNumber());

    // Check for duplicate PO number
    const existing = await this.findByPoNumber(poNumber);
    if (existing) {
      throw new ConflictException(`PO number "${poNumber}" already exists`);
    }

    // Verify all materials exist
    if (dto.lines && dto.lines.length > 0) {
      const materialIds = dto.lines.map((l) => l.material_id);
      const materials = await this.materialRepository.findBy({
        id: In(materialIds),
      });
      if (materials.length !== materialIds.length) {
        throw new BadRequestException('One or more materials not found');
      }
    }

    // Create PO with lines
    const po = this.poRepository.create({
      po_number: poNumber,
      supplier_id: dto.supplier_id,
      status: dto.status ?? PurchaseOrderStatus.DRAFT,
      order_date: new Date(dto.order_date),
      expected_date: dto.expected_date ? new Date(dto.expected_date) : null,
      currency: dto.currency ?? 'USD',
      notes: dto.notes ?? null,
      created_by: dto.created_by ?? null,
      lines:
        dto.lines?.map((line, index) => ({
          material_id: line.material_id,
          line_number: index + 1,
          quantity_ordered: line.quantity_ordered,
          quantity_received: 0,
          unit_cost: line.unit_cost ?? null,
          notes: line.notes ?? null,
        })) ?? [],
    });

    // Calculate total amount
    if (po.lines && po.lines.length > 0) {
      po.total_amount = po.lines.reduce((sum, line) => {
        const lineCost = line.unit_cost
          ? parseFloat(String(line.quantity_ordered)) *
            parseFloat(String(line.unit_cost))
          : 0;
        return sum + lineCost;
      }, 0);
    }

    const saved = await this.poRepository.save(po);

    // Emit audit event
    await this.auditService.emitCreate(
      'PO_CREATED',
      'purchase_order',
      saved.id,
      {
        po_number: saved.po_number,
        supplier_id: saved.supplier_id,
        status: saved.status,
        line_count: saved.lines?.length ?? 0,
      },
      dto.created_by,
    );

    return this.findOne(saved.id);
  }

  async update(id: string, dto: UpdatePurchaseOrderDto): Promise<PurchaseOrder> {
    const po = await this.findOne(id);
    const oldStatus = po.status;

    // Don't allow updates to closed/cancelled POs
    if (
      po.status === PurchaseOrderStatus.CLOSED ||
      po.status === PurchaseOrderStatus.CANCELLED
    ) {
      throw new BadRequestException(
        `Cannot update PO with status "${po.status}"`,
      );
    }

    // Verify supplier if changing
    if (dto.supplier_id && dto.supplier_id !== po.supplier_id) {
      const supplier = await this.supplierRepository.findOne({
        where: { id: dto.supplier_id },
      });
      if (!supplier) {
        throw new NotFoundException(
          `Supplier with ID "${dto.supplier_id}" not found`,
        );
      }
    }

    Object.assign(po, {
      ...dto,
      order_date: dto.order_date ? new Date(dto.order_date) : po.order_date,
      expected_date: dto.expected_date
        ? new Date(dto.expected_date)
        : po.expected_date,
    });

    const saved = await this.poRepository.save(po);

    // Emit audit event if status changed
    if (dto.status && dto.status !== oldStatus) {
      await this.auditService.emitStateChange(
        'PO_STATUS_CHANGED',
        'purchase_order',
        saved.id,
        { status: oldStatus },
        { status: dto.status },
        dto.created_by,
      );
    }

    return this.findOne(saved.id);
  }

  async remove(id: string): Promise<void> {
    const po = await this.findOne(id);
    await this.poRepository.softRemove(po);

    await this.auditService.emitDelete('PO_DELETED', 'purchase_order', id, {
      po_number: po.po_number,
      status: po.status,
    });
  }

  // ==================== LINE OPERATIONS ====================

  async addLine(poId: string, lineDto: AddLineDto): Promise<PurchaseOrderLine> {
    const po = await this.findOne(poId);

    if (po.status !== PurchaseOrderStatus.DRAFT) {
      throw new BadRequestException('Can only add lines to DRAFT POs');
    }

    // Verify material exists
    const material = await this.materialRepository.findOne({
      where: { id: lineDto.material_id },
    });
    if (!material) {
      throw new NotFoundException(
        `Material with ID "${lineDto.material_id}" not found`,
      );
    }

    // Get next line number
    const maxLine = Math.max(
      ...(po.lines?.map((l) => l.line_number) ?? [0]),
      0,
    );

    const line = this.poLineRepository.create({
      purchase_order_id: poId,
      material_id: lineDto.material_id,
      line_number: maxLine + 1,
      quantity_ordered: lineDto.quantity_ordered,
      quantity_received: 0,
      unit_cost: lineDto.unit_cost ?? null,
      notes: lineDto.notes ?? null,
    });

    const savedLine = await this.poLineRepository.save(line);

    // Recalculate total amount
    await this.recalculateTotalAmount(poId);

    return (await this.poLineRepository.findOne({
      where: { id: savedLine.id },
      relations: ['material'],
    }))!;
  }

  async updateLine(
    lineId: string,
    updates: UpdateLineDto,
  ): Promise<PurchaseOrderLine> {
    const line = await this.poLineRepository.findOne({
      where: { id: lineId },
      relations: ['purchase_order'],
    });

    if (!line) {
      throw new NotFoundException(`PO Line with ID "${lineId}" not found`);
    }

    if (line.purchase_order.status !== PurchaseOrderStatus.DRAFT) {
      throw new BadRequestException('Can only update lines on DRAFT POs');
    }

    Object.assign(line, updates);
    const savedLine = await this.poLineRepository.save(line);

    // Recalculate total amount
    await this.recalculateTotalAmount(line.purchase_order_id);

    return (await this.poLineRepository.findOne({
      where: { id: savedLine.id },
      relations: ['material'],
    }))!;
  }

  async removeLine(lineId: string): Promise<void> {
    const line = await this.poLineRepository.findOne({
      where: { id: lineId },
      relations: ['purchase_order'],
    });

    if (!line) {
      throw new NotFoundException(`PO Line with ID "${lineId}" not found`);
    }

    if (line.purchase_order.status !== PurchaseOrderStatus.DRAFT) {
      throw new BadRequestException('Can only remove lines from DRAFT POs');
    }

    const poId = line.purchase_order_id;
    await this.poLineRepository.remove(line);

    // Recalculate total amount
    await this.recalculateTotalAmount(poId);
  }

  private async recalculateTotalAmount(poId: string): Promise<void> {
    const po = await this.poRepository.findOne({
      where: { id: poId },
      relations: ['lines'],
    });

    if (po) {
      po.total_amount = po.lines.reduce((sum, line) => {
        const lineCost = line.unit_cost
          ? parseFloat(String(line.quantity_ordered)) *
            parseFloat(String(line.unit_cost))
          : 0;
        return sum + lineCost;
      }, 0);
      await this.poRepository.save(po);
    }
  }

  // ==================== QUANTITY ON ORDER ====================

  /**
   * Get quantity on order for a single material
   * Sums (qty_ordered - qty_received) for all lines on OPEN POs
   */
  async getQuantityOnOrder(materialId: string): Promise<number> {
    const result = await this.poLineRepository
      .createQueryBuilder('line')
      .innerJoin('line.purchase_order', 'po')
      .select(
        'COALESCE(SUM(line.quantity_ordered - line.quantity_received), 0)',
        'qty_on_order',
      )
      .where('line.material_id = :materialId', { materialId })
      .andWhere('po.status IN (:...statuses)', { statuses: OPEN_PO_STATUSES })
      .andWhere('po.deleted_at IS NULL')
      .getRawOne<{ qty_on_order: string }>();

    return parseFloat(result?.qty_on_order ?? '0');
  }

  /**
   * Get quantity on order for multiple materials (batch query)
   */
  async getQuantitiesOnOrder(
    materialIds: string[],
  ): Promise<Map<string, number>> {
    if (materialIds.length === 0) {
      return new Map();
    }

    const results = await this.poLineRepository
      .createQueryBuilder('line')
      .innerJoin('line.purchase_order', 'po')
      .select('line.material_id', 'material_id')
      .addSelect(
        'COALESCE(SUM(line.quantity_ordered - line.quantity_received), 0)',
        'qty_on_order',
      )
      .where('line.material_id IN (:...materialIds)', { materialIds })
      .andWhere('po.status IN (:...statuses)', { statuses: OPEN_PO_STATUSES })
      .andWhere('po.deleted_at IS NULL')
      .groupBy('line.material_id')
      .getRawMany<{ material_id: string; qty_on_order: string }>();

    const map = new Map<string, number>();
    for (const row of results) {
      map.set(row.material_id, parseFloat(row.qty_on_order));
    }

    // Fill in zeros for materials with no open POs
    for (const id of materialIds) {
      if (!map.has(id)) {
        map.set(id, 0);
      }
    }

    return map;
  }

  /**
   * Get all materials with quantity on order (for reporting)
   */
  async getAllQuantitiesOnOrder(): Promise<QuantityOnOrder[]> {
    const results = await this.poLineRepository
      .createQueryBuilder('line')
      .innerJoin('line.purchase_order', 'po')
      .select('line.material_id', 'material_id')
      .addSelect(
        'SUM(line.quantity_ordered - line.quantity_received)',
        'quantity_on_order',
      )
      .where('po.status IN (:...statuses)', { statuses: OPEN_PO_STATUSES })
      .andWhere('po.deleted_at IS NULL')
      .groupBy('line.material_id')
      .having('SUM(line.quantity_ordered - line.quantity_received) > 0')
      .getRawMany<{ material_id: string; quantity_on_order: string }>();

    return results.map((r) => ({
      material_id: r.material_id,
      quantity_on_order: parseFloat(r.quantity_on_order),
    }));
  }

  // ==================== RECEIVING WORKFLOW ====================

  /**
   * Receive materials against a PO
   * Creates receiving inspections (items go to inspection queue, not directly to inventory)
   * Updates line qty_received to track that receiving has occurred
   */
  async receiveAgainstPO(
    poId: string,
    dto: ReceiveAgainstPODto,
  ): Promise<ReceiptResult> {
    const po = await this.findOne(poId);
    const originalStatus = po.status;

    // Validate PO status
    if (
      ![
        PurchaseOrderStatus.SUBMITTED,
        PurchaseOrderStatus.CONFIRMED,
        PurchaseOrderStatus.PARTIALLY_RECEIVED,
      ].includes(po.status)
    ) {
      throw new BadRequestException(
        `Cannot receive against PO with status "${po.status}". Must be SUBMITTED, CONFIRMED, or PARTIALLY_RECEIVED.`,
      );
    }

    const inspections: ReceivingInspection[] = [];
    let linesUpdated = 0;

    await this.dataSource.transaction(async (manager) => {
      for (const receiptLine of dto.lines) {
        // Find the PO line
        const poLine = po.lines.find((l) => l.id === receiptLine.po_line_id);
        if (!poLine) {
          throw new NotFoundException(
            `PO Line with ID "${receiptLine.po_line_id}" not found on this PO`,
          );
        }

        // Check we're not over-receiving
        const qtyOrdered = parseFloat(String(poLine.quantity_ordered));
        const qtyReceived = parseFloat(String(poLine.quantity_received));
        const qtyRemaining = qtyOrdered - qtyReceived;

        if (receiptLine.quantity > qtyRemaining) {
          throw new BadRequestException(
            `Cannot receive ${receiptLine.quantity} for line ${poLine.line_number}. ` +
              `Only ${qtyRemaining} remaining (ordered: ${qtyOrdered}, already received: ${qtyReceived})`,
          );
        }

        // Update the PO line qty_received
        poLine.quantity_received = qtyReceived + receiptLine.quantity;
        await manager.save(PurchaseOrderLine, poLine);
        linesUpdated++;

        // Get the material for IPN
        const material = await this.materialRepository.findOne({
          where: { id: poLine.material_id },
        });

        if (!material) {
          throw new NotFoundException(
            `Material with ID "${poLine.material_id}" not found`,
          );
        }

        // Create receiving inspection (items go to inspection queue)
        const unitCost = receiptLine.unit_cost ?? poLine.unit_cost;
        const inspection = await this.receivingInspectionService.create({
          po_line_id: poLine.id,
          material_id: poLine.material_id,
          received_ipn: material.internal_part_number,
          received_manufacturer: receiptLine.received_manufacturer,
          received_mpn: receiptLine.received_mpn,
          quantity_received: receiptLine.quantity,
          unit_cost: unitCost ? parseFloat(String(unitCost)) : undefined,
          received_by: dto.received_by,
          notes: dto.notes
            ? `${dto.notes} | PO: ${po.po_number}, Line: ${poLine.line_number}`
            : `Receipt against PO ${po.po_number}, Line ${poLine.line_number}`,
        });

        inspections.push(inspection);
      }

      // Update PO status based on receipt completion
      const updatedPo = await manager.findOne(PurchaseOrder, {
        where: { id: poId },
        relations: ['lines'],
      });

      if (updatedPo) {
        const allLinesReceived = updatedPo.lines.every((line) => {
          const ordered = parseFloat(String(line.quantity_ordered));
          const received = parseFloat(String(line.quantity_received));
          return received >= ordered;
        });

        const anyLinesReceived = updatedPo.lines.some((line) => {
          const received = parseFloat(String(line.quantity_received));
          return received > 0;
        });

        if (allLinesReceived) {
          updatedPo.status = PurchaseOrderStatus.RECEIVED;
        } else if (anyLinesReceived) {
          updatedPo.status = PurchaseOrderStatus.PARTIALLY_RECEIVED;
        }

        await manager.save(PurchaseOrder, updatedPo);
      }
    });

    // Emit audit event
    await this.auditService.emitCreate(
      'PO_RECEIVED',
      'purchase_order',
      poId,
      {
        po_number: po.po_number,
        lines_received: dto.lines.length,
        inspections_created: inspections.length,
      },
      dto.received_by,
      { notes: dto.notes },
    );

    // Return fresh data
    const updatedPO = await this.findOne(poId);
    return {
      purchase_order: updatedPO,
      inspections,
      lines_updated: linesUpdated,
      status_changed: updatedPO.status !== originalStatus,
    };
  }

  // ==================== STATUS TRANSITIONS ====================

  async submitPO(id: string, actor?: string): Promise<PurchaseOrder> {
    const po = await this.findOne(id);

    if (po.status !== PurchaseOrderStatus.DRAFT) {
      throw new BadRequestException('Can only submit DRAFT POs');
    }

    if (!po.lines || po.lines.length === 0) {
      throw new BadRequestException('Cannot submit PO with no lines');
    }

    po.status = PurchaseOrderStatus.SUBMITTED;
    const saved = await this.poRepository.save(po);

    await this.auditService.emitStateChange(
      'PO_STATUS_CHANGED',
      'purchase_order',
      id,
      { status: PurchaseOrderStatus.DRAFT },
      { status: PurchaseOrderStatus.SUBMITTED },
      actor,
    );

    return this.findOne(saved.id);
  }

  async confirmPO(id: string, actor?: string): Promise<PurchaseOrder> {
    const po = await this.findOne(id);

    if (po.status !== PurchaseOrderStatus.SUBMITTED) {
      throw new BadRequestException('Can only confirm SUBMITTED POs');
    }

    po.status = PurchaseOrderStatus.CONFIRMED;
    const saved = await this.poRepository.save(po);

    await this.auditService.emitStateChange(
      'PO_STATUS_CHANGED',
      'purchase_order',
      id,
      { status: PurchaseOrderStatus.SUBMITTED },
      { status: PurchaseOrderStatus.CONFIRMED },
      actor,
    );

    return this.findOne(saved.id);
  }

  async closePO(id: string, actor?: string): Promise<PurchaseOrder> {
    const po = await this.findOne(id);

    if (po.status !== PurchaseOrderStatus.RECEIVED) {
      throw new BadRequestException('Can only close RECEIVED POs');
    }

    po.status = PurchaseOrderStatus.CLOSED;
    const saved = await this.poRepository.save(po);

    await this.auditService.emitStateChange(
      'PO_STATUS_CHANGED',
      'purchase_order',
      id,
      { status: PurchaseOrderStatus.RECEIVED },
      { status: PurchaseOrderStatus.CLOSED },
      actor,
    );

    return this.findOne(saved.id);
  }

  async cancelPO(
    id: string,
    reason?: string,
    actor?: string,
  ): Promise<PurchaseOrder> {
    const po = await this.findOne(id);

    if (
      [PurchaseOrderStatus.RECEIVED, PurchaseOrderStatus.CLOSED].includes(
        po.status,
      )
    ) {
      throw new BadRequestException(
        `Cannot cancel PO with status "${po.status}"`,
      );
    }

    const oldStatus = po.status;
    po.status = PurchaseOrderStatus.CANCELLED;
    const saved = await this.poRepository.save(po);

    await this.auditService.emitStateChange(
      'PO_CANCELLED',
      'purchase_order',
      id,
      { status: oldStatus },
      { status: PurchaseOrderStatus.CANCELLED },
      actor,
      { reason },
    );

    return this.findOne(saved.id);
  }

  // ==================== HELPERS ====================

  private async generatePoNumber(): Promise<string> {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');

    // Get count of POs this month for sequence
    const startOfMonth = new Date(year, now.getMonth(), 1);
    const count = await this.poRepository.count({
      where: { created_at: MoreThanOrEqual(startOfMonth) },
      withDeleted: true,
    });

    return `PO-${year}${month}-${String(count + 1).padStart(4, '0')}`;
  }

  async getOpenPOsForMaterial(materialId: string): Promise<PurchaseOrder[]> {
    return this.poRepository
      .createQueryBuilder('po')
      .innerJoinAndSelect('po.lines', 'line')
      .innerJoinAndSelect('po.supplier', 'supplier')
      .innerJoinAndSelect('line.material', 'material')
      .where('line.material_id = :materialId', { materialId })
      .andWhere('po.status IN (:...statuses)', { statuses: OPEN_PO_STATUSES })
      .andWhere('po.deleted_at IS NULL')
      .orderBy('po.expected_date', 'ASC')
      .getMany();
  }
}
