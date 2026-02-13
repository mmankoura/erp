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
} from 'class-validator';
import { Type } from 'class-transformer';
import { ColumnMappingDto } from './create-bom-import-mapping.dto';

export class BomImportUploadDto {
  @IsString()
  @IsNotEmpty()
  file_content: string; // Base64 encoded file content

  @IsString()
  @IsOptional()
  file_name?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ColumnMappingDto)
  @IsOptional()
  column_mappings?: ColumnMappingDto[];

  @IsUUID()
  @IsOptional()
  mapping_id?: string; // Use a saved mapping

  @IsBoolean()
  @IsOptional()
  has_header_row?: boolean;

  @IsNumber()
  @Min(0)
  @IsOptional()
  skip_rows?: number;

  @IsBoolean()
  @IsOptional()
  multi_row_designators?: boolean;
}

export class BomImportCommitDto {
  @IsUUID()
  @IsNotEmpty()
  product_id: string;

  @IsString()
  @IsNotEmpty()
  revision_number: string;

  @IsString()
  @IsOptional()
  change_summary?: string;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;

  @IsString()
  @IsOptional()
  source_filename?: string;

  @IsArray()
  @IsNotEmpty()
  items: BomImportItemDto[];
}

export class BomImportItemDto {
  @IsString()
  @IsNotEmpty()
  internal_part_number: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  alternate_ipn?: string;

  @IsString()
  @IsOptional()
  manufacturer?: string;

  @IsString()
  @IsOptional()
  manufacturer_pn?: string;

  @IsNumber()
  @Min(0)
  quantity_required: number;

  @IsString()
  @IsOptional()
  reference_designators?: string;

  @IsNumber()
  @IsOptional()
  line_number?: number;

  @IsString()
  @IsOptional()
  resource_type?: string;

  @IsBoolean()
  @IsOptional()
  polarized?: boolean;

  @IsString()
  @IsOptional()
  notes?: string;
}

export interface BomImportPreviewResult {
  headers: string[];
  rows: string[][];
  total_rows: number;
  preview_rows: number;
}

export interface BomImportParseResult {
  items: BomImportItemDto[];
  warnings: string[];
  errors: string[];
  unmatched_parts: string[];
  matched_count: number;
  unmatched_count: number;
}
