import { Type } from 'class-transformer';
import { IsArray, ValidateNested, ArrayMinSize } from 'class-validator';
import { CreateMaterialDto } from './create-material.dto';

export class BulkCreateMaterialDto {
  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @Type(() => CreateMaterialDto)
  materials: CreateMaterialDto[];
}
