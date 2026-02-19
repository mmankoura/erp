import {
  IsString,
  IsNotEmpty,
  IsUUID,
  IsOptional,
  MaxLength,
} from 'class-validator';

export class UploadAttachmentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  entity_type: string;

  @IsUUID()
  @IsNotEmpty()
  entity_id: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  uploaded_by?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
