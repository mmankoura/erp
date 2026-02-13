import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CycleCountType } from '../../../entities/cycle-count.entity';

export class CreateCycleCountDto {
  @IsEnum(CycleCountType)
  count_type: CycleCountType;

  @IsDateString()
  scheduled_date: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  material_ids?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  lot_ids?: string[];

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  created_by?: string;
}

export class CountEntryDto {
  @IsUUID()
  item_id: string;

  @IsNumber()
  @Min(0)
  counted_quantity: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  counted_by?: string;
}

export class BatchCountEntryDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CountEntryDto)
  entries: CountEntryDto[];
}

export class StartCountDto {
  @IsOptional()
  @IsString()
  started_by?: string;
}

export class CompleteCountDto {
  @IsOptional()
  @IsString()
  completed_by?: string;
}

export class ApproveCountDto {
  @IsOptional()
  @IsString()
  approved_by?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  item_ids?: string[];
}

export class CancelCountDto {
  @IsOptional()
  @IsString()
  cancelled_by?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class SkipItemDto {
  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  skipped_by?: string;
}
