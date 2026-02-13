import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { ProductionStage } from '../../../entities/production-log.entity';

export class StartProductionDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsString()
  created_by?: string;
}

export class MoveUnitsDto {
  @IsEnum(ProductionStage)
  from_stage: ProductionStage;

  @IsEnum(ProductionStage)
  to_stage: ProductionStage;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  created_by?: string;
}

export class ShipUnitsDto {
  @IsInt()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsString()
  created_by?: string;
}
