import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsNumber,
  IsEnum,
  MaxLength,
  Min,
} from 'class-validator';
import { PackageType } from '../../../entities/inventory-lot.entity';

export enum QuickReceiptType {
  PO = 'PO',
  CUSTOMER_SUPPLIED = 'CUSTOMER_SUPPLIED',
  STOCK = 'STOCK',
}

export class QuickReceiveDto {
  @IsEnum(QuickReceiptType)
  receipt_type: QuickReceiptType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  uid: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  received_ipn: string;

  @IsNumber()
  @Min(0.0001)
  quantity_received: number;

  @IsEnum(PackageType)
  @IsOptional()
  package_type?: PackageType;

  // PO mode
  @IsUUID()
  @IsOptional()
  po_id?: string;

  // Customer Supplied mode
  @IsUUID()
  @IsOptional()
  customer_id?: string;

  // Stock mode
  @IsString()
  @IsOptional()
  @MaxLength(100)
  received_mpn?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  received_manufacturer?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  po_reference?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  received_by: string;
}
