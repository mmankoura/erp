import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsEnum,
  Min,
} from 'class-validator';
import { DispositionAction } from '../../../entities/receiving-session-line.entity';

export class ResolveDiscrepancyDto {
  @IsEnum(DispositionAction)
  @IsNotEmpty()
  disposition_action: DispositionAction;

  @IsString()
  @IsNotEmpty()
  disposition_by: string;

  @IsString()
  @IsOptional()
  disposition_notes?: string;

  @IsNumber()
  @Min(0.0001)
  @IsOptional()
  accepted_quantity?: number;
}
