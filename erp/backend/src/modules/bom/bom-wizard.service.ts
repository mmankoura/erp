import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BomWizardRecipe } from '../../entities/bom-wizard-recipe.entity';
import {
  CreateBomWizardRecipeDto,
  UpdateBomWizardRecipeDto,
} from './dto/bom-wizard-recipe.dto';

/**
 * Saved BOM Wizard recipes — named transformation sequences that can be
 * replayed against next month's file from the same customer.
 */
@Injectable()
export class BomWizardService {
  constructor(
    @InjectRepository(BomWizardRecipe)
    private readonly recipeRepository: Repository<BomWizardRecipe>,
  ) {}

  async findAll(): Promise<BomWizardRecipe[]> {
    return this.recipeRepository.find({ order: { name: 'ASC' } });
  }

  async findOne(id: string): Promise<BomWizardRecipe> {
    const recipe = await this.recipeRepository.findOne({ where: { id } });
    if (!recipe) {
      throw new NotFoundException(`Recipe with ID "${id}" not found`);
    }
    return recipe;
  }

  async create(
    dto: CreateBomWizardRecipeDto,
    createdBy?: string,
  ): Promise<BomWizardRecipe> {
    await this.assertNameIsFree(dto.name);

    const recipe = this.recipeRepository.create({
      name: dto.name.trim(),
      description: dto.description ?? null,
      schema_version: dto.schema_version ?? 1,
      actions: dto.actions,
      created_by: createdBy ?? null,
    });
    return this.recipeRepository.save(recipe);
  }

  async update(
    id: string,
    dto: UpdateBomWizardRecipeDto,
  ): Promise<BomWizardRecipe> {
    const recipe = await this.findOne(id);

    if (dto.name !== undefined && dto.name.trim() !== recipe.name) {
      await this.assertNameIsFree(dto.name, id);
      recipe.name = dto.name.trim();
    }
    if (dto.description !== undefined) recipe.description = dto.description;
    if (dto.schema_version !== undefined) {
      recipe.schema_version = dto.schema_version;
    }
    if (dto.actions !== undefined) recipe.actions = dto.actions;

    return this.recipeRepository.save(recipe);
  }

  async remove(id: string): Promise<void> {
    const recipe = await this.findOne(id);
    await this.recipeRepository.remove(recipe);
  }

  /**
   * Names are unique case-insensitively. The comparison has to be LOWER() on
   * both sides to match `IDX_bom_wizard_recipes_name_lower` — an exact-match
   * check here would let "AEGIS" past a stored "aegis" and turn a clean 409
   * into a raw unique-violation from the driver.
   */
  private async assertNameIsFree(name: string, exceptId?: string): Promise<void> {
    const trimmed = name.trim();
    const query = this.recipeRepository
      .createQueryBuilder('recipe')
      .where('LOWER(recipe.name) = LOWER(:name)', { name: trimmed });

    if (exceptId) {
      query.andWhere('recipe.id != :exceptId', { exceptId });
    }

    if (await query.getOne()) {
      throw new ConflictException(`A recipe named "${trimmed}" already exists`);
    }
  }
}
