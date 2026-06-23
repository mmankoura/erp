import { IsEnum, IsOptional, IsUUID, ValidateIf } from 'class-validator';
import { OwnerType } from '../../../entities/inventory-transaction.entity';

export class UpdateLotOwnerDto {
  @IsEnum(OwnerType)
  owner_type: OwnerType;

  @ValidateIf((o) => o.owner_type === OwnerType.CUSTOMER)
  @IsUUID()
  @IsOptional()
  owner_id: string | null;
}
