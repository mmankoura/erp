import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ReceivingService } from './receiving.service';
import { StartSessionDto } from './dto/start-session.dto';
import { ReceiveItemDto } from './dto/receive-item.dto';
import { ResolveDiscrepancyDto } from './dto/resolve-discrepancy.dto';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../../entities/user.entity';
import { ReceivingSessionStatus } from '../../entities/receiving-session.entity';

@Controller('receiving')
@UseGuards(AuthenticatedGuard, RolesGuard)
export class ReceivingController {
  constructor(private readonly receivingService: ReceivingService) {}

  @Post('sessions')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE_CLERK)
  async startSession(@Body() dto: StartSessionDto) {
    return this.receivingService.startSession(dto);
  }

  @Get('sessions')
  async findAllSessions(
    @Query('status') status?: ReceivingSessionStatus,
  ) {
    return this.receivingService.findAllSessions(status);
  }

  @Get('sessions/:id')
  async findSession(@Param('id', ParseUUIDPipe) id: string) {
    return this.receivingService.getSessionWithLines(id);
  }

  @Post('sessions/:id/receive')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE_CLERK)
  async receiveItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReceiveItemDto,
  ) {
    return this.receivingService.receiveItem(id, dto);
  }

  @Post('sessions/:id/close')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE_CLERK)
  async closeSession(@Param('id', ParseUUIDPipe) id: string) {
    return this.receivingService.closeSession(id);
  }

  @Post('sessions/:id/cancel')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async cancelSession(@Param('id', ParseUUIDPipe) id: string) {
    return this.receivingService.cancelSession(id);
  }

  @Get('lookup/po/:poNumber')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE_CLERK)
  async lookupPO(@Param('poNumber') poNumber: string) {
    return this.receivingService.lookupPO(poNumber);
  }

  @Get('lookup/material/:ipn')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE_CLERK)
  async lookupMaterial(@Param('ipn') ipn: string) {
    const material = await this.receivingService.lookupMaterial(ipn);
    if (!material) {
      return { found: false };
    }
    return { found: true, material };
  }

  @Get('lookup/aml-suggestions')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE_CLERK)
  async lookupAmlSuggestions(
    @Query('material_id') materialId: string,
    @Query('mpn') mpn: string,
    @Query('customer_id') customerId?: string,
  ) {
    return this.receivingService.lookupAmlSuggestions(
      materialId,
      mpn,
      customerId,
    );
  }

  @Get('flagged')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async findFlagged() {
    return this.receivingService.findFlaggedLines();
  }

  @Post('lines/:lineId/resolve')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async resolveDiscrepancy(
    @Param('lineId', ParseUUIDPipe) lineId: string,
    @Body() dto: ResolveDiscrepancyDto,
  ) {
    return this.receivingService.resolveDiscrepancy(lineId, dto);
  }

  @Post('lines/:lineId/release')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE_CLERK)
  async releaseLine(
    @Param('lineId', ParseUUIDPipe) lineId: string,
    @Body('released_by') releasedBy?: string,
  ) {
    return this.receivingService.releaseLine(lineId, releasedBy);
  }
}
