import { IsUUID, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreatePhysicalCountDto {
  @IsUUID()
  customer_id: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  bin_filter?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category_filter?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
