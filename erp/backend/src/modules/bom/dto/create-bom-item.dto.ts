import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsNumber,
  IsEnum,
  IsBoolean,
  Min,
} from 'class-validator';
import { ResourceType } from '../../../entities/bom-item.entity';

export class CreateBomItemDto {
  @IsUUID()
  @IsNotEmpty()
  material_id: string;

  @IsNumber()
  @IsOptional()
  line_number?: number;

  @IsString()
  @IsOptional()
  reference_designators?: string;

  @IsNumber()
  @Min(0)
  quantity_required: number;

  @IsEnum(ResourceType)
  @IsOptional()
  resource_type?: ResourceType;

  @IsBoolean()
  @IsOptional()
  polarized?: boolean;

  @IsNumber()
  @Min(0)
  @IsOptional()
  scrap_factor?: number;

  @IsString()
  @IsOptional()
  notes?: string;
}
