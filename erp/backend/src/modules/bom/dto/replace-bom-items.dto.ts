import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsInt,
  IsArray,
  IsUUID,
  ValidateNested,
  ArrayMinSize,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ReplaceBomItemDto {
  @IsUUID()
  material_id: string;

  /**
   * Stable line identity. The replacement diffs on this, so a matched line
   * keeps its row — and therefore its alternates. Derived by the caller.
   */
  @IsString()
  @IsNotEmpty()
  bom_line_key: string;

  @IsNumber()
  @Min(0)
  quantity_required: number;

  @IsInt()
  @IsOptional()
  line_number?: number;

  @IsString()
  @IsOptional()
  reference_designators?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  alternate_ipn?: string;

  @IsBoolean()
  @IsOptional()
  polarized?: boolean;

  @IsNumber()
  @IsOptional()
  scrap_factor?: number;
}

export class ReplaceBomItemsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReplaceBomItemDto)
  items: ReplaceBomItemDto[];

  /**
   * Acknowledge that orders reference this revision. Only ever gets past the
   * guard for orders still in ENTERED; anything further along is refused
   * outright, with or without this flag.
   */
  @IsBoolean()
  @IsOptional()
  confirm_overwrite_with_orders?: boolean;
}
