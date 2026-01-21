import {
  IsUUID,
  IsNotEmpty,
  IsNumber,
  Min,
  IsOptional,
  IsString,
  IsArray,
  ValidateNested,
  MaxLength,
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

  @IsString()
  @IsOptional()
  @MaxLength(100)
  received_manufacturer?: string; // Manufacturer of the received item

  @IsString()
  @IsOptional()
  @MaxLength(100)
  received_mpn?: string; // Manufacturer Part Number of the received item
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
