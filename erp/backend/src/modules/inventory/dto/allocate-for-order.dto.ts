import {
  IsUUID,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsBoolean,
} from 'class-validator';

export class AllocateForOrderDto {
  @IsUUID()
  @IsNotEmpty()
  order_id: string;

  @IsString()
  @IsOptional()
  created_by?: string;

  @IsBoolean()
  @IsOptional()
  allocate_available_only?: boolean;
}
