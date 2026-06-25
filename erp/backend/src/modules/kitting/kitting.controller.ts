import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { KittingService } from './kitting.service';
import { CreateKittingListDto, ScanUidDto, CompleteKittingListDto } from './dto';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../../entities/user.entity';

@Controller('kitting')
@UseGuards(AuthenticatedGuard, RolesGuard)
export class KittingController {
  constructor(private readonly kittingService: KittingService) {}

  /**
   * GET /kitting
   * List all kitting lists
   */
  @Get()
  async findAll() {
    return this.kittingService.findAll();
  }

  /**
   * GET /kitting/:id
   * Get kitting list detail
   */
  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.kittingService.findOne(id);
  }

  /**
   * GET /kitting/:id/stock
   * Get kitting list with stock levels, grouped by resource type
   */
  @Get(':id/stock')
  async getWithStock(@Param('id', ParseUUIDPipe) id: string) {
    return this.kittingService.getWithStock(id);
  }

  /**
   * POST /kitting
   * Create a new kitting list from selected orders
   */
  @Post()
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.OPERATOR)
  async create(@Body() dto: CreateKittingListDto) {
    return this.kittingService.create(dto);
  }

  /**
   * POST /kitting/:id/print
   * Mark kitting list as printed
   */
  @Post(':id/print')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.OPERATOR, UserRole.WAREHOUSE_CLERK)
  async markPrinted(@Param('id', ParseUUIDPipe) id: string) {
    return this.kittingService.markPrinted(id);
  }

  /**
   * POST /kitting/:id/scan
   * Scan a UID to verify against kitting list
   */
  @Post(':id/scan')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.OPERATOR, UserRole.WAREHOUSE_CLERK)
  async scanUid(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ScanUidDto,
  ) {
    return this.kittingService.scanUid(id, dto);
  }

  /**
   * POST /kitting/:id/complete
   * Complete the kitting list
   */
  @Post(':id/complete')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.OPERATOR)
  async complete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteKittingListDto,
  ) {
    return this.kittingService.complete(id, dto);
  }

  /**
   * POST /kitting/:id/resume
   * Resume a kit parked in AWAITING_MATERIALS (shortage received) so the
   * operator can scan the new material against it.
   */
  @Post(':id/resume')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.OPERATOR)
  async resume(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { resumed_by?: string },
  ) {
    return this.kittingService.resume(id, body?.resumed_by);
  }

  /**
   * DELETE /kitting/:id
   * Cancel a kitting list
   */
  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.kittingService.cancel(id);
  }
}
