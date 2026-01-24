import {
  IsUUID,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsOptional,
  IsString,
  IsEnum,
} from 'class-validator';
import { OwnerType } from '../../../entities/inventory-transaction.entity';

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

  // ============ Ownership Dimension ============

  @IsEnum(OwnerType)
  @IsOptional()
  owner_type?: OwnerType; // COMPANY (default) or CUSTOMER

  @IsUUID()
  @IsOptional()
  owner_id?: string; // customer_id when owner_type=CUSTOMER
}
