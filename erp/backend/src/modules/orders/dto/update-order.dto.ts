import {
  IsString,
  IsOptional,
  IsDateString,
  IsEnum,
  IsInt,
  Min,
} from 'class-validator';
import { OrderType, OrderStatus } from '../../../entities/order.entity';

export class UpdateOrderDto {
  @IsString()
  @IsOptional()
  po_number?: string;

  @IsString()
  @IsOptional()
  wo_number?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  quantity?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  quantity_shipped?: number;

  @IsDateString()
  @IsOptional()
  due_date?: string;

  @IsEnum(OrderType)
  @IsOptional()
  order_type?: OrderType;

  @IsEnum(OrderStatus)
  @IsOptional()
  status?: OrderStatus;

  @IsString()
  @IsOptional()
  notes?: string;
}
