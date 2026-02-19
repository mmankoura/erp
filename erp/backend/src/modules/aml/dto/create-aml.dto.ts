import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsInt,
  IsEnum,
  Min,
  MaxLength,
} from 'class-validator';
import { AMLSource } from '../../../entities/approved-manufacturer.entity';

export class CreateAmlDto {
  @IsUUID()
  @IsNotEmpty()
  material_id: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  manufacturer: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  manufacturer_part_number: string;

  @IsUUID()
  @IsOptional()
  preferred_supplier_id?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  priority?: number;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  created_by?: string;

  @IsEnum(AMLSource)
  @IsOptional()
  source?: AMLSource;

  @IsUUID()
  @IsOptional()
  source_bom_revision_id?: string;

  @IsUUID()
  @IsOptional()
  customer_id?: string;
}
