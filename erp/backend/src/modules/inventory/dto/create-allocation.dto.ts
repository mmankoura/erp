import {
  IsUUID,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateAllocationDto {
  @IsUUID()
  @IsNotEmpty()
  material_id: string;

  @IsUUID()
  @IsNotEmpty()
  order_id: string;

  @IsNumber()
  @IsPositive()
  @IsNotEmpty()
  quantity: number;

  @IsString()
  @IsOptional()
  created_by?: string;

  // ============ Phase 2 Inventory Dimensions (optional) ============

  @IsUUID()
  @IsOptional()
  location_id?: string;

  @IsUUID()
  @IsOptional()
  lot_id?: string;
}
