import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ReceivingInspectionService } from './receiving-inspection.service';
import { InspectionStatus } from '../../entities/receiving-inspection.entity';
import { PerformInspectionDto, DispositionDto, ReleaseDto } from './dto';

@Controller('receiving-inspections')
export class ReceivingInspectionController {
  constructor(
    private readonly inspectionService: ReceivingInspectionService,
  ) {}

  @Get()
  async findAll() {
    return this.inspectionService.findAll();
  }

  @Get('pending')
  async findPending() {
    return this.inspectionService.findPending();
  }

  @Get('status/:status')
  async findByStatus(@Param('status') status: InspectionStatus) {
    // Validate status is a valid enum value
    if (!Object.values(InspectionStatus).includes(status)) {
      throw new Error(`Invalid status: ${status}`);
    }
    return this.inspectionService.findByStatus(status);
  }

  @Get('po-line/:poLineId')
  async findByPoLine(@Param('poLineId', ParseUUIDPipe) poLineId: string) {
    return this.inspectionService.findByPoLine(poLineId);
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.inspectionService.findOne(id);
  }

  @Post(':id/validate')
  async performValidation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PerformInspectionDto,
  ) {
    return this.inspectionService.performValidation(id, dto.inspector);
  }

  @Post(':id/approve')
  async approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DispositionDto,
  ) {
    return this.inspectionService.approve(
      id,
      dto.disposition_by,
      dto.disposition_notes,
    );
  }

  @Post(':id/reject')
  async reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DispositionDto,
  ) {
    return this.inspectionService.reject(
      id,
      dto.disposition_by,
      dto.disposition_notes,
    );
  }

  @Post(':id/hold')
  async hold(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DispositionDto,
  ) {
    return this.inspectionService.hold(
      id,
      dto.disposition_by,
      dto.disposition_notes,
    );
  }

  @Post(':id/release')
  async releaseToInventory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReleaseDto,
  ) {
    return this.inspectionService.releaseToInventory(id, dto.actor);
  }

  @Post('bulk-release')
  async bulkRelease(
    @Body('ids') ids: string[],
    @Body('actor') actor: string,
  ) {
    if (!ids || ids.length === 0) {
      throw new Error('ids array is required');
    }
    if (!actor) {
      throw new Error('actor is required');
    }
    return this.inspectionService.bulkRelease(ids, actor);
  }
}
