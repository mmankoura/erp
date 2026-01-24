import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateMaterialDto {
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
