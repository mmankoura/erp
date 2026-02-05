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

  // Helper to parse status query parameter
  private parseStatuses(statuses?: string): OrderStatus[] | undefined {
    if (!statuses) return undefined;
    return statuses.split(',').map((s) => {
      const status = s.trim().toUpperCase() as OrderStatus;
      if (!Object.values(OrderStatus).includes(status)) {
        throw new Error(`Invalid status: ${s}`);
      }
      return status;
    });
  }

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
    return this.mrpService.getShortages(this.parseStatuses(statuses));
  }

  /**
   * GET /mrp/shortages/enhanced
   * Get shortages with customer info, resource types, and affected products
   */
  @Get('shortages/enhanced')
  async getEnhancedShortages(@Query('statuses') statuses?: string) {
    return this.mrpService.getEnhancedShortages(this.parseStatuses(statuses));
  }

  /**
   * GET /mrp/shortages/by-customer
   * Get shortages grouped by customer
   */
  @Get('shortages/by-customer')
  async getShortagesByCustomer(@Query('statuses') statuses?: string) {
    return this.mrpService.getShortagesByCustomer(this.parseStatuses(statuses));
  }

  /**
   * GET /mrp/shortages/by-resource-type
   * Get shortages grouped by resource type (SMT, TH, MECH, PCB)
   */
  @Get('shortages/by-resource-type')
  async getShortagesByResourceType(@Query('statuses') statuses?: string) {
    return this.mrpService.getShortagesByResourceType(this.parseStatuses(statuses));
  }

  /**
   * GET /mrp/orders/buildability
   * Get order buildability status - which orders can be built, are partial, or blocked
   */
  @Get('orders/buildability')
  async getOrderBuildability(@Query('statuses') statuses?: string) {
    return this.mrpService.getOrderBuildability(this.parseStatuses(statuses));
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
