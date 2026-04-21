import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  ConsumableOrder,
  ConsumableOrderLine,
  ConsumableOrderStatus,
} from '../../entities/consumable-order.entity';

export interface CreateConsumableOrderDto {
  supplier: string;
  order_date: string;
  expected_date?: string;
  currency?: string;
  notes?: string;
  created_by?: string;
  lines: Array<{
    ata_part_number?: string;
    description: string;
    manufacturer?: string;
    manufacturer_pn?: string;
    quantity: number;
    unit_cost?: number;
    customer?: string;
    notes?: string;
  }>;
}

@Injectable()
export class ConsumableOrdersService {
  constructor(
    @InjectRepository(ConsumableOrder)
    private readonly orderRepository: Repository<ConsumableOrder>,
    @InjectRepository(ConsumableOrderLine)
    private readonly lineRepository: Repository<ConsumableOrderLine>,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(status?: ConsumableOrderStatus): Promise<ConsumableOrder[]> {
    const where: Record<string, unknown> = {};
    if (status) where.status = status;

    return this.orderRepository.find({
      where,
      relations: ['lines'],
      order: { created_at: 'DESC' },
    });
  }

  async findOne(id: string): Promise<ConsumableOrder> {
    const order = await this.orderRepository.findOne({
      where: { id },
      relations: ['lines'],
    });
    if (!order) {
      throw new NotFoundException(`Consumable order not found`);
    }
    return order;
  }

  async create(dto: CreateConsumableOrderDto): Promise<ConsumableOrder> {
    if (!dto.lines || dto.lines.length === 0) {
      throw new BadRequestException('At least one line item is required');
    }

    const orderNumber = await this.generateOrderNumber();

    const order = this.orderRepository.create({
      order_number: orderNumber,
      supplier: dto.supplier,
      status: ConsumableOrderStatus.ORDERED,
      order_date: new Date(dto.order_date),
      expected_date: dto.expected_date ? new Date(dto.expected_date) : null,
      currency: dto.currency ?? 'CAD',
      notes: dto.notes ?? null,
      created_by: dto.created_by ?? null,
      lines: dto.lines.map((line, index) => ({
        ata_part_number: line.ata_part_number ?? null,
        description: line.description,
        manufacturer: line.manufacturer ?? null,
        manufacturer_pn: line.manufacturer_pn ?? null,
        quantity: line.quantity,
        unit_cost: line.unit_cost ?? null,
        customer: line.customer ?? null,
        line_number: index + 1,
        notes: line.notes ?? null,
      })),
    });

    const saved = await this.orderRepository.save(order);
    return this.findOne(saved.id);
  }

  async update(id: string, dto: Partial<CreateConsumableOrderDto>): Promise<ConsumableOrder> {
    const order = await this.findOne(id);

    if (dto.supplier !== undefined) order.supplier = dto.supplier;
    if (dto.order_date !== undefined) order.order_date = new Date(dto.order_date);
    if (dto.expected_date !== undefined) order.expected_date = dto.expected_date ? new Date(dto.expected_date) : null;
    if (dto.currency !== undefined) order.currency = dto.currency;
    if (dto.notes !== undefined) order.notes = dto.notes || null;

    if (dto.lines !== undefined) {
      // Remove old lines and replace with new
      await this.lineRepository.delete({ consumable_order_id: id });
      order.lines = dto.lines.map((line, index) => {
        const newLine = new ConsumableOrderLine();
        newLine.consumable_order_id = id;
        newLine.ata_part_number = line.ata_part_number ?? null;
        newLine.description = line.description;
        newLine.manufacturer = line.manufacturer ?? null;
        newLine.manufacturer_pn = line.manufacturer_pn ?? null;
        newLine.quantity = line.quantity;
        newLine.unit_cost = line.unit_cost ?? null;
        newLine.customer = line.customer ?? null;
        newLine.line_number = index + 1;
        newLine.notes = line.notes ?? null;
        return newLine;
      });
    }

    await this.orderRepository.save(order);
    return this.findOne(id);
  }

  async markReceived(id: string): Promise<ConsumableOrder> {
    const order = await this.findOne(id);
    if (order.status === ConsumableOrderStatus.RECEIVED) {
      throw new BadRequestException('Order is already received');
    }
    order.status = ConsumableOrderStatus.RECEIVED;
    await this.orderRepository.save(order);
    return this.findOne(id);
  }

  async undoReceive(id: string): Promise<ConsumableOrder> {
    const order = await this.findOne(id);
    if (order.status !== ConsumableOrderStatus.RECEIVED) {
      throw new BadRequestException('Order is not in received status');
    }
    order.status = ConsumableOrderStatus.ORDERED;
    await this.orderRepository.save(order);
    return this.findOne(id);
  }

  async delete(id: string): Promise<void> {
    const order = await this.findOne(id);
    await this.orderRepository.remove(order);
  }

  private async generateOrderNumber(): Promise<string> {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const prefix = `CON-${year}${month}${day}-`;

    const result = await this.orderRepository
      .createQueryBuilder('co')
      .select('co.order_number')
      .where('co.order_number LIKE :prefix', { prefix: `${prefix}%` })
      .orderBy('co.order_number', 'DESC')
      .limit(1)
      .getOne();

    let sequence = 1;
    if (result) {
      const suffix = result.order_number.slice(prefix.length);
      const parsed = parseInt(suffix, 10);
      if (!isNaN(parsed)) sequence = parsed + 1;
    }

    return `${prefix}${String(sequence).padStart(3, '0')}`;
  }
}
