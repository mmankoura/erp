import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateAmlDto } from './create-aml.dto';

export class UpdateAmlDto extends PartialType(
  OmitType(CreateAmlDto, ['material_id'] as const),
) {}
