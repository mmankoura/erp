import {
  IsString,
  IsOptional,
  IsDateString,
  IsEnum,
  IsBoolean,
} from 'class-validator';
import { BomSource } from '../../../entities/bom-revision.entity';

export class UpdateBomRevisionDto {
  @IsString()
  @IsOptional()
  revision_number?: string;

  @IsDateString()
  @IsOptional()
  revision_date?: string;

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
