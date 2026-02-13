import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ProductionService } from './production.service';
import {
  StartProductionDto,
  MoveUnitsDto,
  ShipUnitsDto,
} from './dto';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../../entities/user.entity';

@Controller('production')
@UseGuards(AuthenticatedGuard, RolesGuard)
export class ProductionController {
  constructor(private readonly productionService: ProductionService) {}

  // ==================== WIP OVERVIEW ====================

  /**
   * GET /production/wip
   * Get WIP summary for all active orders
   */
  @Get('wip')
  async getWipSummary() {
    return this.productionService.getWipSummary();
  }

  /**
   * GET /production/stages
   * Get summary by production stage
   */
  @Get('stages')
  async getStageSummary() {
    return this.productionService.getStageSummary();
  }

  // ==================== ORDER PRODUCTION ====================

  /**
   * GET /production/order/:orderId
   * Get WIP details for a specific order
   */
  @Get('order/:orderId')
  async getOrderWip(@Param('orderId', ParseUUIDPipe) orderId: string) {
    return this.productionService.getOrderWip(orderId);
  }

  /**
   * GET /production/order/:orderId/logs
   * Get production logs for an order
   */
  @Get('order/:orderId/logs')
  async getOrderLogs(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Query('limit') limit?: string,
  ) {
    const limitValue = limit ? parseInt(limit, 10) : 50;
    return this.productionService.getOrderProductionLogs(orderId, limitValue);
  }

  /**
   * POST /production/order/:orderId/start
   * Start production for an order (move units to kitting)
   */
  @Post('order/:orderId/start')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE_CLERK)
  async startProduction(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: StartProductionDto,
  ) {
    return this.productionService.startProduction(
      orderId,
      dto.quantity,
      dto.created_by,
    );
  }

  /**
   * POST /production/order/:orderId/move
   * Move units between production stages
   */
  @Post('order/:orderId/move')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE_CLERK)
  async moveUnits(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: MoveUnitsDto,
  ) {
    return this.productionService.moveUnits({
      order_id: orderId,
      from_stage: dto.from_stage,
      to_stage: dto.to_stage,
      quantity: dto.quantity,
      notes: dto.notes,
      created_by: dto.created_by,
    });
  }

  /**
   * POST /production/order/:orderId/ship
   * Ship completed units
   */
  @Post('order/:orderId/ship')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE_CLERK)
  async shipUnits(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: ShipUnitsDto,
  ) {
    return this.productionService.shipUnits(
      orderId,
      dto.quantity,
      dto.created_by,
    );
  }
}
