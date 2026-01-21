import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class PerformInspectionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  inspector: string;
}
