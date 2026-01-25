import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsArray,
  IsUUID,
  ValidateNested,
  Min,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { OwnerType } from '../../../entities/inventory-transaction.entity';

export type InventoryImportField =
  | 'uid'
  | 'ipn'
  | 'quantity'
  | 'package_type'
  | 'po_reference'
  | 'unit_cost'
  | 'expiration_date'
  | 'notes'
  | 'ignore';

export class InventoryColumnMappingDto {
  @IsString()
  @IsNotEmpty()
  source_column: string;

  @IsString()
  @IsNotEmpty()
  target_field: InventoryImportField;
}

export class InventoryImportPreviewDto {
  @IsString()
  @IsNotEmpty()
  file_content: string;

  @IsBoolean()
  @IsOptional()
  has_header_row?: boolean;

  @IsNumber()
  @Min(0)
  @IsOptional()
  skip_rows?: number;
}

export class InventoryImportParseDto {
  @IsString()
  @IsNotEmpty()
  file_content: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InventoryColumnMappingDto)
  column_mappings: InventoryColumnMappingDto[];

  @IsBoolean()
  @IsOptional()
  has_header_row?: boolean;

  @IsNumber()
  @Min(0)
  @IsOptional()
  skip_rows?: number;
}

export class InventoryImportItemDto {
  @IsString()
  @IsNotEmpty()
  uid: string;

  @IsString()
  @IsNotEmpty()
  ipn: string;

  @IsNumber()
  @Min(0)
  quantity: number;

  @IsString()
  @IsOptional()
  package_type?: string;

  @IsString()
  @IsOptional()
  po_reference?: string;

  @IsNumber()
  @IsOptional()
  unit_cost?: number;

  @IsString()
  @IsOptional()
  expiration_date?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  material_id?: string;
  material_matched?: boolean;
}

export class InventoryImportCommitDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InventoryImportItemDto)
  @IsNotEmpty()
  items: InventoryImportItemDto[];

  @IsString()
  @IsOptional()
  source_filename?: string;

  @IsString()
  @IsOptional()
  created_by?: string;

  @IsEnum(OwnerType)
  @IsOptional()
  owner_type?: OwnerType;

  @IsUUID()
  @IsOptional()
  owner_id?: string;
}

export interface InventoryImportPreviewResult {
  headers: string[];
  rows: string[][];
  total_rows: number;
  preview_rows: number;
}

export interface InventoryImportParseResult {
  items: InventoryImportItemDto[];
  warnings: string[];
  errors: string[];
  unmatched_ipns: string[];
  matched_count: number;
  unmatched_count: number;
  duplicate_uids: string[];
  total_quantity: number;
}

export interface InventoryImportCommitResult {
  lots_created: number;
  transactions_created: number;
  total_quantity: number;
  created_materials: string[];
  lot_ids: string[];
}
