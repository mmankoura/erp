import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateManualStockEntryDto } from './create-manual-stock-entry.dto';

/**
 * entered_by records who first keyed the row, so it is not editable.
 */
export class UpdateManualStockEntryDto extends PartialType(
  OmitType(CreateManualStockEntryDto, ['entered_by'] as const),
) {}
