import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { ResourceType } from '../../../entities/bom-item.entity';

/**
 * The four master fields a BOM import can settle on an existing material.
 *
 * Deliberately NOT built from `PartialType(CreateMaterialDto)` the way
 * `UpdateMaterialDto` is. That would put `internal_part_number`, `customer_id`,
 * `uom` and `category` on a route that exists for four fields, and a bulk route
 * is the worst place to discover you can rename a part number.
 *
 * Every string is `@IsNotEmpty()`. That is the "an import can fill a blank but
 * can never clear a value" guarantee, enforced at the edge where it cannot be
 * forgotten rather than in the caller that happens to be careful today.
 */
export class BulkUpdateMaterialItemDto {
  @IsUUID()
  @IsNotEmpty()
  id: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  description?: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  manufacturer?: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  manufacturer_pn?: string;

  @IsEnum(ResourceType)
  @IsOptional()
  resource_type?: ResourceType;
}

export class BulkUpdateMaterialDto {
  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @Type(() => BulkUpdateMaterialItemDto)
  materials: BulkUpdateMaterialItemDto[];
}
