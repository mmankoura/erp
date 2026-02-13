import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ProductionService } from './production.service';
import {
  StartProductionDto,
  MoveUnitsDto,
  ShipUnitsDto,
} from './dto';

@Controller('production')
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
