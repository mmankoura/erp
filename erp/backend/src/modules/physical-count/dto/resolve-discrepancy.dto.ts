import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { PhysicalCountResolutionAction } from '../../../entities/physical-count-discrepancy.entity';

export class ResolveDiscrepancyDto {
  @IsEnum(PhysicalCountResolutionAction)
  resolution_action: PhysicalCountResolutionAction;

  @IsOptional()
  @IsString()
  resolution_note?: string;

  /** Required when resolution_action is RECOUNT. Becomes the lot's quantity on approve. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  recount_qty?: number;
}
