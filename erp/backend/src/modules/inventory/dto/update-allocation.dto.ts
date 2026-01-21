import {
  IsNumber,
  IsPositive,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpdateAllocationDto {
  @IsNumber()
  @IsPositive()
  @IsOptional()
  quantity?: number;

  @IsString()
  @IsOptional()
  updated_by?: string;
}
