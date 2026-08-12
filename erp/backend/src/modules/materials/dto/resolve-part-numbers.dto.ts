import { IsArray, IsString, ArrayMaxSize } from 'class-validator';

export class ResolvePartNumbersDto {
  /**
   * Internal part numbers to look up. Capped well above the largest real BOM
   * (the biggest sample runs to ~260 lines) so one import is always a single
   * request, while still bounding the IN clause.
   */
  @IsArray()
  @ArrayMaxSize(5000)
  @IsString({ each: true })
  part_numbers: string[];
}
