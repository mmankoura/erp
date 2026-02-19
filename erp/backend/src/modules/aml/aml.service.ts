import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ApprovedManufacturer,
  AMLStatus,
  AMLSource,
} from '../../entities/approved-manufacturer.entity';
import { AuditService } from '../audit/audit.service';
import {
  AuditEventType,
  AuditEntityType,
} from '../../entities/audit-event.entity';
import { CreateAmlDto, UpdateAmlDto } from './dto';

@Injectable()
export class AmlService {
  constructor(
    @InjectRepository(ApprovedManufacturer)
    private readonly amlRepository: Repository<ApprovedManufacturer>,
    private readonly auditService: AuditService,
  ) {}

  async findAll(): Promise<ApprovedManufacturer[]> {
    return this.amlRepository.find({
      relations: ['material', 'preferred_supplier'],
      order: { material_id: 'ASC', priority: 'ASC' },
    });
  }

  async findAllIncludingDeleted(): Promise<ApprovedManufacturer[]> {
    return this.amlRepository.find({
      withDeleted: true,
      relations: ['material', 'preferred_supplier'],
      order: { material_id: 'ASC', priority: 'ASC' },
    });
  }

  async findOne(id: string): Promise<ApprovedManufacturer> {
    const aml = await this.amlRepository.findOne({
      where: { id },
      relations: ['material', 'preferred_supplier'],
    });
    if (!aml) {
      throw new NotFoundException(`AML entry with ID "${id}" not found`);
    }
    return aml;
  }

  async findByMaterial(materialId: string): Promise<ApprovedManufacturer[]> {
    return this.amlRepository.find({
      where: { material_id: materialId },
      relations: ['material', 'preferred_supplier'],
      order: { priority: 'ASC', manufacturer: 'ASC' },
    });
  }

  async findApprovedByMaterial(
    materialId: string,
  ): Promise<ApprovedManufacturer[]> {
    return this.amlRepository.find({
      where: { material_id: materialId, status: AMLStatus.APPROVED },
      relations: ['material', 'preferred_supplier'],
      order: { priority: 'ASC', manufacturer: 'ASC' },
    });
  }

  async create(dto: CreateAmlDto): Promise<ApprovedManufacturer> {
    // Check for duplicate entry
    const existing = await this.amlRepository.findOne({
      where: {
        material_id: dto.material_id,
        manufacturer: dto.manufacturer,
        manufacturer_part_number: dto.manufacturer_part_number,
      },
    });

    if (existing) {
      throw new ConflictException(
        `AML entry already exists for this material/manufacturer/MPN combination`,
      );
    }

    const aml = this.amlRepository.create({
      ...dto,
      status: AMLStatus.PENDING,
    });

    const saved = await this.amlRepository.save(aml);

    await this.auditService.emitCreate(
      AuditEventType.AML_CREATED,
      AuditEntityType.APPROVED_MANUFACTURER,
      saved.id,
      {
        material_id: saved.material_id,
        manufacturer: saved.manufacturer,
        manufacturer_part_number: saved.manufacturer_part_number,
        status: saved.status,
      },
      dto.created_by,
    );

    return this.findOne(saved.id);
  }

  async update(id: string, dto: UpdateAmlDto): Promise<ApprovedManufacturer> {
    const aml = await this.findOne(id);
    const oldState = { ...aml };

    // Check for duplicate if changing manufacturer or MPN
    if (
      (dto.manufacturer && dto.manufacturer !== aml.manufacturer) ||
      (dto.manufacturer_part_number &&
        dto.manufacturer_part_number !== aml.manufacturer_part_number)
    ) {
      const existing = await this.amlRepository.findOne({
        where: {
          material_id: aml.material_id,
          manufacturer: dto.manufacturer ?? aml.manufacturer,
          manufacturer_part_number:
            dto.manufacturer_part_number ?? aml.manufacturer_part_number,
        },
      });

      if (existing && existing.id !== id) {
        throw new ConflictException(
          `AML entry already exists for this material/manufacturer/MPN combination`,
        );
      }
    }

    Object.assign(aml, dto);
    const saved = await this.amlRepository.save(aml);

    await this.auditService.emitStateChange(
      AuditEventType.AML_UPDATED,
      AuditEntityType.APPROVED_MANUFACTURER,
      id,
      oldState,
      saved,
    );

    return this.findOne(id);
  }

  async remove(id: string, actor?: string): Promise<void> {
    const aml = await this.findOne(id);

    await this.auditService.emitDelete(
      AuditEventType.AML_DELETED,
      AuditEntityType.APPROVED_MANUFACTURER,
      id,
      {
        material_id: aml.material_id,
        manufacturer: aml.manufacturer,
        manufacturer_part_number: aml.manufacturer_part_number,
        status: aml.status,
      },
      actor,
    );

    await this.amlRepository.softRemove(aml);
  }

  async approve(
    id: string,
    approvedBy: string,
  ): Promise<ApprovedManufacturer> {
    const aml = await this.findOne(id);

    if (aml.status === AMLStatus.APPROVED) {
      throw new BadRequestException(`AML entry is already approved`);
    }

    if (aml.status === AMLStatus.OBSOLETE) {
      throw new BadRequestException(
        `Cannot approve an obsolete AML entry. Create a new entry instead.`,
      );
    }

    const oldStatus = aml.status;
    aml.status = AMLStatus.APPROVED;
    aml.approved_by = approvedBy;
    aml.approved_at = new Date();

    const saved = await this.amlRepository.save(aml);

    await this.auditService.emitStateChange(
      AuditEventType.AML_APPROVED,
      AuditEntityType.APPROVED_MANUFACTURER,
      id,
      { status: oldStatus },
      { status: AMLStatus.APPROVED, approved_by: approvedBy },
      approvedBy,
    );

    return this.findOne(id);
  }

  async suspend(
    id: string,
    suspendedBy: string,
    reason?: string,
  ): Promise<ApprovedManufacturer> {
    const aml = await this.findOne(id);

    if (aml.status !== AMLStatus.APPROVED) {
      throw new BadRequestException(
        `Can only suspend APPROVED entries. Current status: ${aml.status}`,
      );
    }

    const oldStatus = aml.status;
    aml.status = AMLStatus.SUSPENDED;

    const saved = await this.amlRepository.save(aml);

    await this.auditService.emitStateChange(
      AuditEventType.AML_SUSPENDED,
      AuditEntityType.APPROVED_MANUFACTURER,
      id,
      { status: oldStatus },
      { status: AMLStatus.SUSPENDED },
      suspendedBy,
      { reason },
    );

    return this.findOne(id);
  }

  async reinstate(
    id: string,
    reinstatedBy: string,
  ): Promise<ApprovedManufacturer> {
    const aml = await this.findOne(id);

    if (aml.status !== AMLStatus.SUSPENDED) {
      throw new BadRequestException(
        `Can only reinstate SUSPENDED entries. Current status: ${aml.status}`,
      );
    }

    const oldStatus = aml.status;
    aml.status = AMLStatus.APPROVED;

    const saved = await this.amlRepository.save(aml);

    await this.auditService.emitStateChange(
      AuditEventType.AML_REINSTATED,
      AuditEntityType.APPROVED_MANUFACTURER,
      id,
      { status: oldStatus },
      { status: AMLStatus.APPROVED },
      reinstatedBy,
    );

    return this.findOne(id);
  }

  async obsolete(
    id: string,
    obsoletedBy: string,
    reason?: string,
  ): Promise<ApprovedManufacturer> {
    const aml = await this.findOne(id);

    if (aml.status === AMLStatus.OBSOLETE) {
      throw new BadRequestException(`AML entry is already obsolete`);
    }

    const oldStatus = aml.status;
    aml.status = AMLStatus.OBSOLETE;

    const saved = await this.amlRepository.save(aml);

    await this.auditService.emitStateChange(
      AuditEventType.AML_OBSOLETED,
      AuditEntityType.APPROVED_MANUFACTURER,
      id,
      { status: oldStatus },
      { status: AMLStatus.OBSOLETE },
      obsoletedBy,
      { reason },
    );

    return this.findOne(id);
  }

  /**
   * Check if a specific manufacturer/MPN combination is approved for a material.
   * Used by receiving inspection validation.
   */
  async isApproved(
    materialId: string,
    manufacturer: string,
    mpn: string,
  ): Promise<boolean> {
    const match = await this.findMatch(materialId, manufacturer, mpn);
    return match !== null && match.status === AMLStatus.APPROVED;
  }

  /**
   * Find matching AML entry for a material/manufacturer/MPN combination.
   * Returns null if no match found.
   */
  async findMatch(
    materialId: string,
    manufacturer: string,
    mpn: string,
  ): Promise<ApprovedManufacturer | null> {
    return this.amlRepository.findOne({
      where: {
        material_id: materialId,
        manufacturer: manufacturer,
        manufacturer_part_number: mpn,
      },
      relations: ['material', 'preferred_supplier'],
    });
  }

  /**
   * Validate a manufacturer/MPN against the AML and return detailed result.
   */
  async validate(
    materialId: string,
    manufacturer: string,
    mpn: string,
  ): Promise<{
    is_valid: boolean;
    aml_entry: ApprovedManufacturer | null;
    status: AMLStatus | null;
    message: string;
  }> {
    const match = await this.findMatch(materialId, manufacturer, mpn);

    if (!match) {
      return {
        is_valid: false,
        aml_entry: null,
        status: null,
        message: `No AML entry found for manufacturer "${manufacturer}" with MPN "${mpn}"`,
      };
    }

    if (match.status === AMLStatus.APPROVED) {
      return {
        is_valid: true,
        aml_entry: match,
        status: match.status,
        message: 'Manufacturer/MPN combination is approved',
      };
    }

    return {
      is_valid: false,
      aml_entry: match,
      status: match.status,
      message: `AML entry exists but status is ${match.status}`,
    };
  }

  /**
   * Customer-scoped validate: prefer customer-scoped entries, fall back to global.
   */
  async validateWithCustomerScope(
    materialId: string,
    manufacturer: string,
    mpn: string,
    customerId?: string | null,
  ): Promise<{
    is_valid: boolean;
    aml_entry: ApprovedManufacturer | null;
    status: AMLStatus | null;
    scope: 'customer' | 'global' | null;
    message: string;
  }> {
    // Try customer-scoped entry first
    if (customerId) {
      const customerMatch = await this.amlRepository.findOne({
        where: {
          material_id: materialId,
          manufacturer,
          manufacturer_part_number: mpn,
          customer_id: customerId,
        },
        relations: ['material', 'preferred_supplier'],
      });

      if (customerMatch && customerMatch.status === AMLStatus.APPROVED) {
        return {
          is_valid: true,
          aml_entry: customerMatch,
          status: customerMatch.status,
          scope: 'customer',
          message: 'Approved (customer-scoped)',
        };
      }
    }

    // Fall back to global entries (customer_id IS NULL)
    const globalMatch = await this.amlRepository
      .createQueryBuilder('aml')
      .leftJoinAndSelect('aml.material', 'material')
      .leftJoinAndSelect('aml.preferred_supplier', 'preferred_supplier')
      .where('aml.material_id = :materialId', { materialId })
      .andWhere('aml.manufacturer = :manufacturer', { manufacturer })
      .andWhere('aml.manufacturer_part_number = :mpn', { mpn })
      .andWhere('aml.customer_id IS NULL')
      .andWhere('aml.deleted_at IS NULL')
      .getOne();

    if (!globalMatch) {
      return {
        is_valid: false,
        aml_entry: null,
        status: null,
        scope: null,
        message: `No AML entry found for manufacturer "${manufacturer}" with MPN "${mpn}"`,
      };
    }

    if (globalMatch.status === AMLStatus.APPROVED) {
      return {
        is_valid: true,
        aml_entry: globalMatch,
        status: globalMatch.status,
        scope: 'global',
        message: 'Approved (global)',
      };
    }

    return {
      is_valid: false,
      aml_entry: globalMatch,
      status: globalMatch.status,
      scope: 'global',
      message: `AML entry exists but status is ${globalMatch.status}`,
    };
  }

  /**
   * Find approved AML entries matching a material + MPN (any manufacturer).
   * Used by receiving to determine manufacturer from MPN scan.
   */
  async findApprovedByMaterialAndMpn(
    materialId: string,
    mpn: string,
    customerId?: string | null,
  ): Promise<ApprovedManufacturer[]> {
    const query = this.amlRepository
      .createQueryBuilder('aml')
      .leftJoinAndSelect('aml.material', 'material')
      .leftJoinAndSelect('aml.preferred_supplier', 'preferred_supplier')
      .where('aml.material_id = :materialId', { materialId })
      .andWhere('aml.manufacturer_part_number = :mpn', { mpn })
      .andWhere('aml.status = :status', { status: AMLStatus.APPROVED })
      .andWhere('aml.deleted_at IS NULL');

    // If customer-scoped, include both customer-scoped and global entries
    if (customerId) {
      query.andWhere(
        '(aml.customer_id = :customerId OR aml.customer_id IS NULL)',
        { customerId },
      );
    } else {
      query.andWhere('aml.customer_id IS NULL');
    }

    return query.orderBy('aml.priority', 'ASC').getMany();
  }

  /**
   * Idempotent find-or-create. Returns existing if duplicate, creates if new.
   * Used by BOM import for AML auto-seeding.
   */
  async findOrCreate(dto: CreateAmlDto): Promise<{
    aml: ApprovedManufacturer;
    created: boolean;
  }> {
    // Check for existing (including customer scope)
    const query: any = {
      material_id: dto.material_id,
      manufacturer: dto.manufacturer,
      manufacturer_part_number: dto.manufacturer_part_number,
    };
    if (dto.customer_id) {
      query.customer_id = dto.customer_id;
    }

    const existing = await this.amlRepository.findOne({
      where: query,
      relations: ['material', 'preferred_supplier'],
    });

    if (existing) {
      return { aml: existing, created: false };
    }

    // Create new entry
    const aml = this.amlRepository.create({
      ...dto,
      status: AMLStatus.APPROVED,
      source: (dto.source as AMLSource) ?? AMLSource.MANUAL,
    });

    const saved = await this.amlRepository.save(aml);

    await this.auditService.emitCreate(
      AuditEventType.AML_CREATED,
      AuditEntityType.APPROVED_MANUFACTURER,
      saved.id,
      {
        material_id: saved.material_id,
        manufacturer: saved.manufacturer,
        manufacturer_part_number: saved.manufacturer_part_number,
        status: saved.status,
        source: saved.source,
      },
      dto.created_by,
    );

    const full = await this.amlRepository.findOne({
      where: { id: saved.id },
      relations: ['material', 'preferred_supplier'],
    });

    return { aml: full!, created: true };
  }
}
