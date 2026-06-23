import {
  IsArray,
  IsEnum,
  IsOptional,
  IsUUID,
  ArrayMinSize,
  ArrayMaxSize,
  ValidateIf,
} from 'class-validator';
import { OwnerType } from '../../../entities/inventory-transaction.entity';

export class BulkAssignLotOwnerDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true })
  lot_ids: string[];

  @IsEnum(OwnerType)
  owner_type: OwnerType;

  @ValidateIf((o) => o.owner_type === OwnerType.CUSTOMER)
  @IsUUID()
  @IsOptional()
  owner_id: string | null;
}
