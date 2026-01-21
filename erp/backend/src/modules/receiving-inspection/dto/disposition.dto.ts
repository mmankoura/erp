import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export class DispositionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  disposition_by: string;

  @IsString()
  @IsOptional()
  disposition_notes?: string;
}

export class ReleaseDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  actor: string;
}
