import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsDateString,
  IsEnum,
  IsArray,
  ValidateNested,
  IsNumber,
  Min,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PurchaseOrderStatus } from '../../../entities/purchase-order.entity';

export class CreatePurchaseOrderLineDto {
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

export class CreatePurchaseOrderDto {
  @IsString()
  @IsOptional()
  @MaxLength(50)
  po_number?: string; // Auto-generate if not provided

  @IsUUID()
  @IsNotEmpty()
  supplier_id: string;

  @IsEnum(PurchaseOrderStatus)
  @IsOptional()
  status?: PurchaseOrderStatus;

  @IsDateString()
  @IsNotEmpty()
  order_date: string;

  @IsDateString()
  @IsOptional()
  expected_date?: string;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  created_by?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseOrderLineDto)
  @IsOptional()
  lines?: CreatePurchaseOrderLineDto[];
}
