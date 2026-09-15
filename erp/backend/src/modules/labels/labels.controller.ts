import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { LabelsService } from './labels.service';
import { BatchLabelDataDto, LotLabelData } from './dto/label-data.dto';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

/**
 * Label data for printing. Read-only, and deliberately carries no @Roles: it
 * matches GET /inventory/lots/by-uid/:uid, which is likewise open to any
 * authenticated user.
 *
 * That means OPERATOR can reprint a label even though OPERATOR is excluded from
 * every write endpoint on ReceivingController. Reprinting a label for stock that
 * already exists changes nothing, and the operators are the people standing at
 * the bench when a label jams.
 */
@Controller('labels')
@UseGuards(AuthenticatedGuard, RolesGuard)
export class LabelsController {
  constructor(private readonly service: LabelsService) {}

  // Declared before :id so the route is unambiguous to read, even though the
  // differing segment count already keeps them apart.
  @Get('lot/by-uid/:uid')
  async getByUid(@Param('uid') uid: string): Promise<LotLabelData> {
    return this.service.getByUid(uid);
  }

  @Get('lot/:id')
  async getByLotId(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<LotLabelData> {
    return this.service.getByLotId(id);
  }

  @Post('lots')
  async getMany(@Body() dto: BatchLabelDataDto): Promise<LotLabelData[]> {
    return this.service.getManyByLotIds(dto.lot_ids);
  }
}
