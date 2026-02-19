import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsBoolean,
  IsEnum,
  MaxLength,
} from 'class-validator';
import { ReceiptType } from '../../../entities/receiving-session.entity';

export class StartSessionDto {
  @IsEnum(ReceiptType)
  @IsNotEmpty()
  receipt_type: ReceiptType;

  @IsUUID()
  @IsOptional()
  po_id?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  packing_slip_number?: string;

  @IsUUID()
  @IsOptional()
  customer_id?: string;

  @IsUUID()
  @IsOptional()
  supplier_id?: string;

  @IsBoolean()
  @IsOptional()
  auto_release_on_pass?: boolean;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  started_by: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
