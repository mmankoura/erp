import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsArray,
  ValidateNested,
  Min,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

const BOM_IMPORT_FIELDS = [
  'internal_part_number',
  'alternate_ipn',
  'manufacturer',
  'manufacturer_pn',
  'quantity_required',
  'reference_designators',
  'line_number',
  'resource_type',
  'polarized',
  'notes',
  'ignore',
] as const;

export class ColumnMappingDto {
  @IsString()
  @IsNotEmpty()
  source_column: string;

  @IsIn(BOM_IMPORT_FIELDS)
  @IsNotEmpty()
  target_field: string;
}

export class CreateBomImportMappingDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ColumnMappingDto)
  column_mappings: ColumnMappingDto[];

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

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  ignore_columns?: string[];
}
