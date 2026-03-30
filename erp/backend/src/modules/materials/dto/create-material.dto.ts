import { IsString, IsNotEmpty, IsOptional, IsUUID, IsEnum } from 'class-validator';
import { ResourceType } from '../../../entities/bom-item.entity';

export class CreateMaterialDto {
  @IsUUID()
  @IsNotEmpty()
  customer_id: string;

  @IsString()
  @IsNotEmpty()
  internal_part_number: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  value?: string;

  @IsString()
  @IsOptional()
  package?: string;

  @IsString()
  @IsOptional()
  manufacturer?: string;

  @IsString()
  @IsOptional()
  manufacturer_pn?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsString()
  @IsOptional()
  uom?: string;

  @IsEnum(ResourceType)
  @IsOptional()
  resource_type?: ResourceType;
}
