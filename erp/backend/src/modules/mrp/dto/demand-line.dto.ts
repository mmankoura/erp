import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsInt,
  IsBoolean,
  IsDateString,
  MaxLength,
  Min,
  Max,
} from 'class-validator';

/**
 * Admit an existing order into the MRP run.
 *
 * Quantity and due date default from the order, then become independently
 * editable — buyers routinely plan to a different number than the order carries.
 */
export class AdmitOrderDto {
  @IsUUID()
  order_id: string;

  /** Defaults to the order's quantity when omitted. */
  @IsInt()
  @Min(1)
  @IsOptional()
  quantity?: number;

  @IsDateString()
  @IsOptional()
  due_date?: string;

  @IsInt()
  @Min(1)
  @Max(999)
  @IsOptional()
  priority?: number;

  @IsString()
  @IsOptional()
  @MaxLength(60)
  status_note?: string;
}

/**
 * A hypothetical job. Nothing is written to `orders`; this exists only inside
 * the MRP run so the buyer can ask "what if we took this on?" and see the
 * shortages it would create.
 */
export class CreateScratchJobDto {
  @IsUUID()
  product_id: string;

  /**
   * A scratch job has no order to follow, so it must pin the BOM revision it
   * plans against.
   */
  @IsUUID()
  bom_revision_id: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  label?: string;

  @IsDateString()
  @IsOptional()
  due_date?: string;

  @IsInt()
  @Min(1)
  @Max(999)
  @IsOptional()
  priority?: number;

  @IsString()
  @IsOptional()
  @MaxLength(60)
  status_note?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateDemandLineDto {
  @IsInt()
  @Min(1)
  @IsOptional()
  quantity?: number;

  @IsDateString()
  @IsOptional()
  due_date?: string;

  @IsInt()
  @Min(1)
  @Max(999)
  @IsOptional()
  priority?: number | null;

  @IsString()
  @IsOptional()
  @MaxLength(60)
  status_note?: string;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  label?: string;

  /** Park a job without deleting it, keeping its notes and alternates. */
  @IsBoolean()
  @IsOptional()
  include_in_totals?: boolean;

  @IsInt()
  @IsOptional()
  sort_order?: number;

  @IsString()
  @IsOptional()
  notes?: string;
}
