import { IsString, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';

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
}
