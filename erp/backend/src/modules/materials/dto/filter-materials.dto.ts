import { IsArray, IsEnum, IsOptional, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class FilterGroup {
  @IsEnum(['product_revision', 'order'])
  type: 'product_revision' | 'order';

  @IsArray()
  @IsUUID('4', { each: true })
  ids: string[];
}

export class FilterMaterialsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FilterGroup)
  filters: FilterGroup[];

  @IsEnum(['AND', 'OR'])
  @IsOptional()
  logic?: 'AND' | 'OR' = 'OR';
}
