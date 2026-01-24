import {
  IsUUID,
  IsNotEmpty,
  IsNumber,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import {
  TransactionType,
  ReferenceType,
  InventoryBucket,
  OwnerType,
} from '../../../entities/inventory-transaction.entity';

export class CreateTransactionDto {
  @IsUUID()
  @IsNotEmpty()
  material_id: string;

  @IsEnum(TransactionType)
  @IsNotEmpty()
  transaction_type: TransactionType;

  @IsNumber()
  @IsNotEmpty()
  quantity: number;

  @IsEnum(ReferenceType)
  @IsOptional()
  reference_type?: ReferenceType;

  @IsUUID()
  @IsOptional()
  reference_id?: string;

  @IsString()
  @IsOptional()
  reason?: string;

  @IsString()
  @IsOptional()
  created_by?: string;

  // ============ Phase 1 Inventory Dimensions (optional) ============

  @IsUUID()
  @IsOptional()
  location_id?: string;

  @IsUUID()
  @IsOptional()
  lot_id?: string;

  @IsEnum(InventoryBucket)
  @IsOptional()
  bucket?: InventoryBucket;

  // ============ Costing Support (Phase: Future) ============

  @IsNumber()
  @IsOptional()
  unit_cost?: number; // Cost per unit at time of transaction

  // ============ Ownership Dimension ============

  @IsEnum(OwnerType)
  @IsOptional()
  owner_type?: OwnerType; // COMPANY (default) or CUSTOMER

  @IsUUID()
  @IsOptional()
  owner_id?: string; // customer_id when owner_type=CUSTOMER
}
