import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../../entities/product.entity';
import { CreateProductDto, UpdateProductDto } from './dto';
import { AuditService } from '../audit/audit.service';
import {
  AuditEventType,
  AuditEntityType,
} from '../../entities/audit-event.entity';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    private readonly auditService: AuditService,
  ) {}

  async findAll(): Promise<Product[]> {
    return this.productRepository.find({
      order: { part_number: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Product> {
    const product = await this.productRepository.findOne({ where: { id } });
    if (!product) {
      throw new NotFoundException(`Product with ID "${id}" not found`);
    }
    return product;
  }

  async findByPartNumber(partNumber: string): Promise<Product | null> {
    return this.productRepository.findOne({
      where: { part_number: partNumber },
    });
  }

  async create(createProductDto: CreateProductDto): Promise<Product> {
    const existing = await this.findByPartNumber(createProductDto.part_number);
    if (existing) {
      throw new ConflictException(
        `Product with part number "${createProductDto.part_number}" already exists`,
      );
    }

    const product = this.productRepository.create(createProductDto);
    return this.productRepository.save(product);
  }

  async update(id: string, updateProductDto: UpdateProductDto): Promise<Product> {
    const product = await this.findOne(id);

    // If updating part number, check for conflicts
    if (
      updateProductDto.part_number &&
      updateProductDto.part_number !== product.part_number
    ) {
      const existing = await this.findByPartNumber(updateProductDto.part_number);
      if (existing) {
        throw new ConflictException(
          `Product with part number "${updateProductDto.part_number}" already exists`,
        );
      }
    }

    Object.assign(product, updateProductDto);
    return this.productRepository.save(product);
  }

  async remove(id: string, actor?: string): Promise<void> {
    const product = await this.findOne(id);
    await this.productRepository.softRemove(product);

    // Emit audit event
    await this.auditService.emitDelete(
      AuditEventType.PRODUCT_DELETED,
      AuditEntityType.PRODUCT,
      id,
      {
        part_number: product.part_number,
        name: product.name,
        description: product.description,
      },
      actor,
    );
  }

  async restore(id: string): Promise<Product> {
    const product = await this.productRepository.findOne({
      where: { id },
      withDeleted: true,
    });

    if (!product) {
      throw new NotFoundException(`Product with ID "${id}" not found`);
    }

    if (!product.deleted_at) {
      throw new ConflictException(`Product with ID "${id}" is not deleted`);
    }

    await this.productRepository.restore(id);
    return this.findOne(id);
  }

  async findAllIncludingDeleted(): Promise<Product[]> {
    return this.productRepository.find({
      withDeleted: true,
      order: { part_number: 'ASC' },
    });
  }

  async setActiveBomRevision(
    id: string,
    bomRevisionId: string | null,
  ): Promise<Product> {
    const product = await this.findOne(id);
    product.active_bom_revision_id = bomRevisionId;
    return this.productRepository.save(product);
  }
}
