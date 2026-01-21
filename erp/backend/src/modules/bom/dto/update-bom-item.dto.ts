import { PartialType } from '@nestjs/mapped-types';
import { CreateBomItemDto } from './create-bom-item.dto';

export class UpdateBomItemDto extends PartialType(CreateBomItemDto) {}
