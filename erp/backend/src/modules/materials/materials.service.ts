import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Material } from '../../entities/material.entity';
import {
  CreateMaterialDto,
  UpdateMaterialDto,
  BulkCreateMaterialDto,
} from './dto';

@Injectable()
export class MaterialsService {
  constructor(
    @InjectRepository(Material)
    private readonly materialRepository: Repository<Material>,
  ) {}

  async findAll(): Promise<Material[]> {
    return this.materialRepository.find({
      order: { internal_part_number: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Material> {
    const material = await this.materialRepository.findOne({ where: { id } });
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

  async remove(id: string): Promise<void> {
    const material = await this.findOne(id);
    await this.materialRepository.softRemove(material);
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
}
