import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsDateString,
  IsEnum,
  IsInt,
  Min,
} from 'class-validator';
import { OrderType } from '../../../entities/order.entity';

export class CreateOrderDto {
  @IsString()
  @IsOptional()
  po_number?: string;

  @IsString()
  @IsOptional()
  wo_number?: string;

  @IsUUID()
  @IsNotEmpty()
  customer_id: string;

  @IsUUID()
  @IsNotEmpty()
  product_id: string;

  @IsUUID()
  @IsOptional()
  bom_revision_id?: string; // Optional - will use active revision if not provided

  @IsInt()
  @Min(1)
  quantity: number;

  @IsDateString()
  due_date: string;

  @IsEnum(OrderType)
  @IsOptional()
  order_type?: OrderType;

  @IsString()
  @IsOptional()
  notes?: string;
}
