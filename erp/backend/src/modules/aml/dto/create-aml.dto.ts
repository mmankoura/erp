import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsInt,
  Min,
  MaxLength,
} from 'class-validator';

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
}
