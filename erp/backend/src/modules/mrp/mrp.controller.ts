import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { MrpService } from './mrp.service';
import { OrderStatus } from '../../entities/order.entity';

@Controller('mrp')
export class MrpController {
  constructor(private readonly mrpService: MrpService) {}

  /**
   * GET /mrp/order/:orderId
   * Get material requirements for a specific order
   */
  @Get('order/:orderId')
  async getOrderRequirements(
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    return this.mrpService.getOrderRequirements(orderId);
  }

  /**
   * GET /mrp/shortages
   * Get all material shortages across active orders
   * Query params:
   *   - statuses: comma-separated list of order statuses to include
   *     Default: PENDING,CONFIRMED,IN_PRODUCTION
   */
  @Get('shortages')
  async getShortages(@Query('statuses') statuses?: string) {
    let statusList: OrderStatus[] | undefined;

    if (statuses) {
      statusList = statuses.split(',').map((s) => {
        const status = s.trim().toUpperCase() as OrderStatus;
        if (!Object.values(OrderStatus).includes(status)) {
          throw new Error(`Invalid status: ${s}`);
        }
        return status;
      });
    }

    return this.mrpService.getShortages(statusList);
  }

  /**
   * GET /mrp/requirements
   * Get a summary of all material requirements for active orders
   * Useful for procurement planning - shows all materials, not just shortages
   */
  @Get('requirements')
  async getRequirementsSummary() {
    return this.mrpService.getRequirementsSummary();
  }

  /**
   * GET /mrp/order/:orderId/availability
   * Check material availability status for a specific order
   * Shows which materials can be fulfilled, partially fulfilled, or are unavailable
   */
  @Get('order/:orderId/availability')
  async getOrderAvailability(
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    return this.mrpService.getOrderAvailability(orderId);
  }
}
