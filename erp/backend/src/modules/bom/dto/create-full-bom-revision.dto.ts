import { Type } from 'class-transformer';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsDateString,
  IsEnum,
  IsBoolean,
  IsArray,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { BomSource } from '../../../entities/bom-revision.entity';
import { CreateBomItemDto } from './create-bom-item.dto';

export class CreateFullBomRevisionDto {
  @IsUUID()
  @IsNotEmpty()
  product_id: string;

  @IsString()
  @IsNotEmpty()
  revision_number: string;

  @IsDateString()
  revision_date: string;

  @IsString()
  @IsOptional()
  change_summary?: string;

  @IsEnum(BomSource)
  @IsOptional()
  source?: BomSource;

  @IsString()
  @IsOptional()
  source_filename?: string;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @Type(() => CreateBomItemDto)
  items: CreateBomItemDto[];
}
