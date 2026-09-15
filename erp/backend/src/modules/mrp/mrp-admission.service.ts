import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, IsNull, Not } from 'typeorm';
import { MrpRun, MrpRunStatus } from '../../entities/mrp-run.entity';
import {
  MrpDemandLine,
  MrpDemandSource,
} from '../../entities/mrp-demand-line.entity';
import { Order } from '../../entities/order.entity';
import { Product } from '../../entities/product.entity';
import { BomRevision } from '../../entities/bom-revision.entity';
import { DEFAULT_MRP_STATUSES } from './mrp-demand';
import {
  AdmitOrderDto,
  CreateScratchJobDto,
  UpdateDemandLineDto,
} from './dto/demand-line.dto';

export interface AdmittableOrder {
  order_id: string;
  order_number: string;
  product_id: string;
  product_name: string;
  product_part_number: string;
  customer_name: string;
  quantity: number;
  due_date: Date;
  status: string;
  /** Already in the run — the UI shows this as admitted rather than offering it. */
  is_admitted: boolean;
}

/**
 * Admission: which jobs the MRP run is actually planning for.
 *
 * MRP used to infer this from order status, giving the buyer no say. Their
 * spreadsheet works the other way round — a job counts once they type a
 * quantity against it — and only 44 of 74 columns carried one. This service is
 * that decision, plus scratch jobs for "what if we took this on?".
 */
@Injectable()
export class MrpAdmissionService {
  constructor(
    @InjectRepository(MrpRun)
    private readonly runRepository: Repository<MrpRun>,
    @InjectRepository(MrpDemandLine)
    private readonly lineRepository: Repository<MrpDemandLine>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(BomRevision)
    private readonly bomRevisionRepository: Repository<BomRevision>,
  ) {}

  /**
   * The run everything reads. Created on first use so a fresh database — or one
   * where the seed migration found nothing to admit — still works.
   */
  async getActiveRun(): Promise<MrpRun> {
    const existing = await this.runRepository.findOne({
      where: { status: MrpRunStatus.ACTIVE },
    });
    if (existing) return existing;

    const created = this.runRepository.create({
      name: 'Current',
      status: MrpRunStatus.ACTIVE,
      created_by: 'system',
    });
    return this.runRepository.save(created);
  }

  /** Admitted jobs, in the buyer's chosen column order. */
  async getDemandLines(includeParked = true): Promise<MrpDemandLine[]> {
    const run = await this.getActiveRun();
    return this.lineRepository.find({
      where: {
        run_id: run.id,
        ...(includeParked ? {} : { include_in_totals: true }),
      },
      relations: ['order', 'order.customer', 'order.product', 'product'],
      order: { sort_order: 'ASC', label: 'ASC' },
    });
  }

  /**
   * Orders that could be admitted, each flagged with whether it already has
   * been. Returning both lets the panel show one list rather than making the
   * buyer reconcile two.
   */
  async getAdmittableOrders(): Promise<AdmittableOrder[]> {
    const run = await this.getActiveRun();

    const orders = await this.orderRepository.find({
      where: { status: In([...DEFAULT_MRP_STATUSES]) },
      relations: ['product', 'customer'],
      order: { due_date: 'ASC' },
    });

    const admitted = await this.lineRepository.find({
      where: { run_id: run.id, order_id: Not(IsNull()) },
      select: ['order_id'],
    });
    const admittedIds = new Set(admitted.map((l) => l.order_id));

    return orders.map((o) => ({
      order_id: o.id,
      order_number: o.order_number,
      product_id: o.product_id,
      product_name: o.product?.name ?? 'Unknown',
      product_part_number: o.product?.part_number ?? '',
      customer_name: o.customer?.name ?? 'Unknown',
      quantity: o.quantity,
      due_date: o.due_date,
      status: o.status,
      is_admitted: admittedIds.has(o.id),
    }));
  }

  async admitOrder(dto: AdmitOrderDto, createdBy: string): Promise<MrpDemandLine> {
    const run = await this.getActiveRun();

    const order = await this.orderRepository.findOne({
      where: { id: dto.order_id },
      relations: ['product'],
    });
    if (!order) {
      throw new NotFoundException(`Order "${dto.order_id}" not found`);
    }

    const existing = await this.lineRepository.findOne({
      where: { run_id: run.id, order_id: order.id },
    });
    if (existing) {
      throw new ConflictException(
        `Order ${order.order_number} is already in the MRP run`,
      );
    }

    const quantity = dto.quantity ?? order.quantity;
    if (quantity <= 0) {
      throw new BadRequestException('Quantity must be greater than zero');
    }

    const line = this.lineRepository.create({
      run_id: run.id,
      source: MrpDemandSource.ORDER,
      order_id: order.id,
      product_id: order.product_id,
      // Deliberately null: an ORDER line follows its order's revision, so
      // re-BOMing the order keeps MRP correct without touching this row.
      bom_revision_id: null,
      label: order.product?.part_number || order.order_number,
      quantity,
      due_date: dto.due_date ? new Date(dto.due_date) : order.due_date,
      priority: dto.priority ?? null,
      status_note: dto.status_note ?? null,
      sort_order: await this.nextSortOrder(run.id),
      created_by: createdBy,
    });

    return this.lineRepository.save(line);
  }

  async createScratchJob(
    dto: CreateScratchJobDto,
    createdBy: string,
  ): Promise<MrpDemandLine> {
    const run = await this.getActiveRun();

    const product = await this.productRepository.findOne({
      where: { id: dto.product_id },
    });
    if (!product) {
      throw new NotFoundException(`Product "${dto.product_id}" not found`);
    }

    const revision = await this.bomRevisionRepository.findOne({
      where: { id: dto.bom_revision_id },
    });
    if (!revision) {
      throw new NotFoundException(
        `BOM revision "${dto.bom_revision_id}" not found`,
      );
    }
    if (revision.product_id !== product.id) {
      throw new BadRequestException(
        'That BOM revision belongs to a different product',
      );
    }

    const line = this.lineRepository.create({
      run_id: run.id,
      source: MrpDemandSource.SCRATCH,
      order_id: null,
      product_id: product.id,
      bom_revision_id: revision.id,
      label:
        dto.label ||
        `${product.part_number} (what-if ${dto.quantity})`,
      quantity: dto.quantity,
      due_date: dto.due_date ? new Date(dto.due_date) : null,
      priority: dto.priority ?? null,
      status_note: dto.status_note ?? 'What-if',
      notes: dto.notes ?? null,
      sort_order: await this.nextSortOrder(run.id),
      created_by: createdBy,
    });

    return this.lineRepository.save(line);
  }

  async updateDemandLine(
    id: string,
    dto: UpdateDemandLineDto,
  ): Promise<MrpDemandLine> {
    const line = await this.lineRepository.findOne({ where: { id } });
    if (!line) {
      throw new NotFoundException(`Demand line "${id}" not found`);
    }

    if (dto.quantity !== undefined) line.quantity = dto.quantity;
    if (dto.due_date !== undefined) line.due_date = new Date(dto.due_date);
    if (dto.priority !== undefined) line.priority = dto.priority ?? null;
    if (dto.status_note !== undefined) line.status_note = dto.status_note;
    if (dto.label !== undefined) line.label = dto.label;
    if (dto.include_in_totals !== undefined) {
      line.include_in_totals = dto.include_in_totals;
    }
    if (dto.sort_order !== undefined) line.sort_order = dto.sort_order;
    if (dto.notes !== undefined) line.notes = dto.notes;

    return this.lineRepository.save(line);
  }

  /**
   * Remove a job from the run.
   *
   * Un-admitting an order is a delete: the order still exists and can be
   * re-admitted. Parking (`include_in_totals = false`) is the non-destructive
   * option and is what the UI offers first, because it keeps any per-job notes
   * and alternate choices attached to the line.
   */
  async removeDemandLine(id: string): Promise<{ removed: string }> {
    const line = await this.lineRepository.findOne({ where: { id } });
    if (!line) {
      throw new NotFoundException(`Demand line "${id}" not found`);
    }
    await this.lineRepository.remove(line);
    return { removed: id };
  }

  private async nextSortOrder(runId: string): Promise<number> {
    const last = await this.lineRepository.findOne({
      where: { run_id: runId },
      order: { sort_order: 'DESC' },
    });
    return (last?.sort_order ?? 0) + 1;
  }
}
