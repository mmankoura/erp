import { PartialType } from '@nestjs/mapped-types';
import { CreateBomImportMappingDto } from './create-bom-import-mapping.dto';

export class UpdateBomImportMappingDto extends PartialType(
  CreateBomImportMappingDto,
) {}
