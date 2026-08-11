import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PackageType } from '../../../entities/inventory-lot.entity';

/**
 * Partial update of an inventory lot (reel). Only the fields that are safe to
 * correct after receipt are accepted — identity and structural fields (uid,
 * material_id, owner, status) are deliberately not editable here.
 */
export class UpdateLotDto {
  // Bounds match the numeric(12,4) column — without them an oversized value
  // reaches Postgres and surfaces as a 500 rather than a validation error.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(99999999.9999)
  quantity?: number;

  @IsOptional()
  @IsEnum(PackageType)
  package_type?: PackageType;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  po_reference?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  bin?: string | null;

  /** Recorded on the ADJUSTMENT transaction when the quantity changes. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
