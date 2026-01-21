import {
  IsUUID,
  IsNotEmpty,
  IsNumber,
  Min,
  IsOptional,
  IsString,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ReceiveLineDto {
  @IsUUID()
  @IsNotEmpty()
  po_line_id: string;

  @IsNumber()
  @Min(0.0001)
  quantity: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  unit_cost?: number; // Override unit cost if different from PO
}

export class ReceiveAgainstPODto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceiveLineDto)
  lines: ReceiveLineDto[];

  @IsString()
  @IsOptional()
  received_by?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
