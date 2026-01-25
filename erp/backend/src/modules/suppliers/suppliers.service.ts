import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Supplier } from '../../entities/supplier.entity';
import { CreateSupplierDto, UpdateSupplierDto } from './dto';
import { AuditService } from '../audit/audit.service';
import {
  AuditEventType,
  AuditEntityType,
} from '../../entities/audit-event.entity';

@Injectable()
export class SuppliersService {
  constructor(
    @InjectRepository(Supplier)
    private readonly supplierRepository: Repository<Supplier>,
    private readonly auditService: AuditService,
  ) {}

  async findAll(): Promise<Supplier[]> {
    return this.supplierRepository.find({
      order: { name: 'ASC' },
    });
  }

  async findAllIncludingDeleted(): Promise<Supplier[]> {
    return this.supplierRepository.find({
      withDeleted: true,
      order: { name: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Supplier> {
    const supplier = await this.supplierRepository.findOne({ where: { id } });
    if (!supplier) {
      throw new NotFoundException(`Supplier with ID "${id}" not found`);
    }
    return supplier;
  }

  async findByCode(code: string): Promise<Supplier | null> {
    return this.supplierRepository.findOne({ where: { code } });
  }

  async create(dto: CreateSupplierDto): Promise<Supplier> {
    // Check for duplicate code
    const existing = await this.findByCode(dto.code);
    if (existing) {
      throw new ConflictException(
        `Supplier with code "${dto.code}" already exists`,
      );
    }

    const supplier = this.supplierRepository.create(dto);
    return this.supplierRepository.save(supplier);
  }

  async update(id: string, dto: UpdateSupplierDto): Promise<Supplier> {
    const supplier = await this.findOne(id);

    if (dto.code && dto.code !== supplier.code) {
      const existing = await this.findByCode(dto.code);
      if (existing) {
        throw new ConflictException(
          `Supplier with code "${dto.code}" already exists`,
        );
      }
    }

    Object.assign(supplier, dto);
    return this.supplierRepository.save(supplier);
  }

  async remove(id: string, actor?: string): Promise<void> {
    const supplier = await this.findOne(id);
    await this.supplierRepository.softRemove(supplier);

    // Emit audit event
    await this.auditService.emitDelete(
      AuditEventType.SUPPLIER_DELETED,
      AuditEntityType.SUPPLIER,
      id,
      {
        code: supplier.code,
        name: supplier.name,
        email: supplier.email,
      },
      actor,
    );
  }

  async restore(id: string): Promise<Supplier> {
    const supplier = await this.supplierRepository.findOne({
      where: { id },
      withDeleted: true,
    });

    if (!supplier) {
      throw new NotFoundException(`Supplier with ID "${id}" not found`);
    }

    if (!supplier.deleted_at) {
      throw new ConflictException(`Supplier with ID "${id}" is not deleted`);
    }

    await this.supplierRepository.restore(id);
    return this.findOne(id);
  }

  async search(query: string): Promise<Supplier[]> {
    return this.supplierRepository
      .createQueryBuilder('supplier')
      .where('supplier.name ILIKE :query', { query: `%${query}%` })
      .orWhere('supplier.code ILIKE :query', { query: `%${query}%` })
      .orderBy('supplier.name', 'ASC')
      .getMany();
  }
}
