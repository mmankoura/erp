import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsEnum,
  MaxLength,
  Min,
} from 'class-validator';
import { PackageType } from '../../../entities/inventory-lot.entity';

/**
 * Everything except IPN, quantity and entered_by is optional free text —
 * nothing is checked against materials, AML or open POs by design.
 */
export class CreateManualStockEntryDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  uid?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  ipn: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  mpn?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  manufacturer?: string;

  @IsNumber()
  @Min(0.0001)
  quantity: number;

  @IsEnum(PackageType)
  @IsOptional()
  package_type?: PackageType;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  location?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  date_code?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  lot_code?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  reference?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  entered_by: string;
}
