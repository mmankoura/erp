import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { MrpService } from './mrp.service';
import { MrpAdmissionService } from './mrp-admission.service';
import {
  AdmitOrderDto,
  CreateScratchJobDto,
  UpdateDemandLineDto,
} from './dto/demand-line.dto';
import { OrderStatus } from '../../entities/order.entity';
import { UserRole } from '../../entities/user.entity';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

@Controller('mrp')
@UseGuards(AuthenticatedGuard, RolesGuard) // Read-only, all authenticated users can access
export class MrpController {
  constructor(
    private readonly mrpService: MrpService,
    private readonly admissionService: MrpAdmissionService,
  ) {}

  private actor(req: any): string {
    return req?.user?.username ?? req?.user?.email ?? 'unknown';
  }

  // Helper to parse status query parameter
  private parseStatuses(statuses?: string): OrderStatus[] | undefined {
    if (!statuses) return undefined;
    return statuses.split(',').map((s) => {
      const status = s.trim().toUpperCase() as OrderStatus;
      if (!Object.values(OrderStatus).includes(status)) {
        throw new BadRequestException(`Invalid status: ${s}`);
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

  // ---------------------------------------------------------------------------
  // Admission — which jobs the run is planning for.
  //
  // Reads are open to any authenticated user, as the reports are. Writes change
  // what the whole company's shortage numbers are based on, so they match the
  // purchase-order module and are restricted to ADMIN/MANAGER.
  // ---------------------------------------------------------------------------

  /**
   * GET /mrp/demand-lines
   * The admitted jobs, in the buyer's column order.
   */
  @Get('demand-lines')
  async getDemandLines() {
    return this.admissionService.getDemandLines();
  }

  /**
   * GET /mrp/admittable-orders
   * Orders eligible for the run, each flagged with whether it is already in it.
   */
  @Get('admittable-orders')
  async getAdmittableOrders() {
    return this.admissionService.getAdmittableOrders();
  }

  /**
   * POST /mrp/demand-lines
   * Add an order to the MRP run.
   */
  @Post('demand-lines')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async admitOrder(@Body() dto: AdmitOrderDto, @Req() req: any) {
    return this.admissionService.admitOrder(dto, this.actor(req));
  }

  /**
   * POST /mrp/demand-lines/scratch
   * Add a hypothetical job. Writes nothing to `orders`.
   */
  @Post('demand-lines/scratch')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async createScratchJob(
    @Body() dto: CreateScratchJobDto,
    @Req() req: any,
  ) {
    return this.admissionService.createScratchJob(dto, this.actor(req));
  }

  /**
   * PATCH /mrp/demand-lines/:id
   * Quantity, due date, priority, status note, column order, or park it.
   */
  @Patch('demand-lines/:id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async updateDemandLine(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDemandLineDto,
  ) {
    return this.admissionService.updateDemandLine(id, dto);
  }

  /**
   * DELETE /mrp/demand-lines/:id
   * Take a job out of the run. Parking via PATCH is the non-destructive option
   * and keeps the line's notes and alternate choices.
   */
  @Delete('demand-lines/:id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async removeDemandLine(@Param('id', ParseUUIDPipe) id: string) {
    return this.admissionService.removeDemandLine(id);
  }
}
