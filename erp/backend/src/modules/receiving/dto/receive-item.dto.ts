import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsNumber,
  IsBoolean,
  IsEnum,
  MaxLength,
  Min,
} from 'class-validator';
import { PackageType } from '../../../entities/inventory-lot.entity';

export class ReceiveItemDto {
  @IsUUID()
  @IsNotEmpty()
  client_request_id: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  received_ipn: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  received_mpn?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  received_manufacturer?: string;

  @IsNumber()
  @Min(0.0001)
  quantity_received: number;

  @IsEnum(PackageType)
  @IsOptional()
  package_type?: PackageType;

  @IsBoolean()
  @IsOptional()
  operator_flagged?: boolean;

  @IsString()
  @IsOptional()
  operator_flag_reason?: string;
}
