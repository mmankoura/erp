import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsInt,
  IsArray,
  IsUUID,
  IsEnum,
  ValidateNested,
  ArrayMinSize,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ResourceType } from '../../../entities/bom-item.entity';

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

  /**
   * Absent leaves the column null on a new line and rewrites a matched line's
   * existing value to null — the replacement is wholesale, so an omitted field
   * means "this line has none", not "leave whatever was there".
   */
  @IsEnum(ResourceType)
  @IsOptional()
  resource_type?: ResourceType;
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
