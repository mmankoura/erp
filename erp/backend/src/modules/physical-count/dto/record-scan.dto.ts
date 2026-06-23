import { IsString, IsNumber, IsOptional, IsIn, Min } from 'class-validator';

export type DupResolution = 'SUM' | 'REPLACE' | 'REJECT';

export class RecordScanDto {
  @IsString()
  uid: string;

  @IsNumber()
  @Min(0)
  scanned_qty: number;

  @IsOptional()
  @IsIn(['SUM', 'REPLACE', 'REJECT'])
  dup_resolution?: DupResolution;
}
