import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class MaterialReturnInputDto {
  @IsUUID()
  allocation_id: string;

  @IsNumber()
  @Min(0)
  counted_quantity: number;

  @IsNumber()
  @Min(0)
  consumed_quantity: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  waste_quantity?: number;

  @IsEnum(['RETURN', 'FLOOR_STOCK'])
  action: 'RETURN' | 'FLOOR_STOCK';
}

export class ReturnMaterialsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MaterialReturnInputDto)
  returns: MaterialReturnInputDto[];

  @IsOptional()
  @IsString()
  created_by?: string;
}

export class PickMaterialsDto {
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  allocation_ids?: string[];

  @IsOptional()
  @IsString()
  created_by?: string;
}

export class IssueMaterialsDto {
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  allocation_ids?: string[];

  @IsOptional()
  @IsString()
  created_by?: string;
}

export class ReturnFloorStockDto {
  @IsNumber()
  @Min(0)
  counted_quantity: number;

  @IsOptional()
  @IsString()
  created_by?: string;
}
