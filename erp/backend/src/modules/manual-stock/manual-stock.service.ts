import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike, FindOptionsWhere } from 'typeorm';
import { ManualStockEntry } from '../../entities/manual-stock-entry.entity';
import { CreateManualStockEntryDto } from './dto/create-manual-stock-entry.dto';
import { UpdateManualStockEntryDto } from './dto/update-manual-stock-entry.dto';

@Injectable()
export class ManualStockService {
  constructor(
    @InjectRepository(ManualStockEntry)
    private readonly repository: Repository<ManualStockEntry>,
  ) {}

  async findAll(search?: string): Promise<ManualStockEntry[]> {
    const term = search?.trim();
    if (!term) {
      return this.repository.find({ order: { entered_at: 'DESC' } });
    }

    const like = ILike(`%${term}%`);
    const where: FindOptionsWhere<ManualStockEntry>[] = [
      { uid: like },
      { ipn: like },
      { description: like },
      { mpn: like },
      { manufacturer: like },
      { location: like },
      { lot_code: like },
      { reference: like },
    ];

    return this.repository.find({ where, order: { entered_at: 'DESC' } });
  }

  async findOne(id: string): Promise<ManualStockEntry> {
    const entry = await this.repository.findOne({ where: { id } });
    if (!entry) {
      throw new NotFoundException(`Manual stock entry ${id} not found`);
    }
    return entry;
  }

  async create(dto: CreateManualStockEntryDto): Promise<ManualStockEntry> {
    const entry = this.repository.create(dto);
    return this.repository.save(entry);
  }

  async update(
    id: string,
    dto: UpdateManualStockEntryDto,
  ): Promise<ManualStockEntry> {
    const entry = await this.findOne(id);
    Object.assign(entry, dto);
    return this.repository.save(entry);
  }

  async remove(id: string): Promise<void> {
    const entry = await this.findOne(id);
    await this.repository.remove(entry);
  }
}
