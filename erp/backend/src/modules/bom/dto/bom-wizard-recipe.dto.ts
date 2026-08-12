import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsInt,
  Min,
  MaxLength,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';

export class CreateBomWizardRecipeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  schema_version?: number;

  /**
   * The recorded action list, stored opaquely. The wizard owns this schema —
   * validating its shape here would mean a backend change every time an action
   * gains a parameter, and `schema_version` already covers migrating old
   * recipes forward.
   */
  @IsArray()
  actions: unknown[];
}

export class UpdateBomWizardRecipeDto extends PartialType(
  CreateBomWizardRecipeDto,
) {}
