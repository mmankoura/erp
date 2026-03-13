import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  ArrayMinSize,
  Min,
} from 'class-validator';

export class CreateKittingListDto {
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMinSize(1)
  order_ids: string[];

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  created_by?: string;
}

export class ScanUidDto {
  @IsString()
  uid: string;

  @IsOptional()
  @IsString()
  scanned_by?: string;
}

export class CompleteKittingListDto {
  @IsOptional()
  @IsString()
  completed_by?: string;
}
