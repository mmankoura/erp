import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsDateString,
  IsEnum,
  IsBoolean,
} from 'class-validator';
import { BomSource } from '../../../entities/bom-revision.entity';

export class CreateBomRevisionDto {
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
}
