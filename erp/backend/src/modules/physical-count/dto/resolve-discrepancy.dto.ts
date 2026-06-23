import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PhysicalCountResolutionAction } from '../../../entities/physical-count-discrepancy.entity';

export class ResolveDiscrepancyDto {
  @IsEnum(PhysicalCountResolutionAction)
  resolution_action: PhysicalCountResolutionAction;

  @IsOptional()
  @IsString()
  resolution_note?: string;
}
