import {
  IsUUID,
  IsNotEmpty,
  IsNumber,
  Min,
  IsOptional,
  IsString,
} from 'class-validator';

export class AddLineDto {
  @IsUUID()
  @IsNotEmpty()
  material_id: string;

  @IsNumber()
  @Min(0.0001)
  quantity_ordered: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  unit_cost?: number;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateLineDto {
  @IsNumber()
  @IsOptional()
  @Min(0.0001)
  quantity_ordered?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  unit_cost?: number;

  @IsString()
  @IsOptional()
  notes?: string;
}
