import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { PhysicalCountService } from './physical-count.service';
import { CreatePhysicalCountDto } from './dto/create-physical-count.dto';
import { RecordScanDto } from './dto/record-scan.dto';
import { ResolveDiscrepancyDto } from './dto/resolve-discrepancy.dto';
import { PhysicalCountStatus } from '../../entities/physical-count.entity';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../../entities/user.entity';

@Controller('physical-counts')
@UseGuards(AuthenticatedGuard, RolesGuard)
export class PhysicalCountController {
  constructor(private readonly service: PhysicalCountService) {}

  @Get()
  async findAll(
    @Query('status') status?: PhysicalCountStatus,
    @Query('customer_id') customer_id?: string,
  ) {
    return this.service.findAll({ status, customer_id });
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE_CLERK)
  async create(
    @Body() dto: CreatePhysicalCountDto,
    @Req() req: { user?: { username?: string } },
  ) {
    return this.service.create(dto, req.user?.username);
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findById(id);
  }

  @Get(':id/snapshot')
  async getSnapshot(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getSnapshot(id);
  }

  @Get(':id/scans')
  async getScans(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getScans(id);
  }

  @Get(':id/discrepancies')
  async getDiscrepancies(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getDiscrepancies(id);
  }

  @Get(':id/variance-report')
  async getVarianceReport(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getVarianceReport(id);
  }

  @Post(':id/start')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE_CLERK)
  async start(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: { user?: { username?: string } },
  ) {
    return this.service.startCount(id, req.user?.username);
  }

  @Post(':id/scan')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE_CLERK)
  async scan(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordScanDto,
    @Req() req: { user?: { username?: string } },
  ) {
    return this.service.recordScan(id, dto, req.user?.username);
  }

  @Delete(':id/scans/:scanId')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE_CLERK)
  async voidScan(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('scanId', ParseUUIDPipe) scanId: string,
    @Req() req: { user?: { username?: string } },
  ) {
    await this.service.voidScan(id, scanId, req.user?.username);
    return { success: true };
  }

  @Post(':id/complete')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE_CLERK)
  async complete(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: { user?: { username?: string } },
  ) {
    return this.service.completeCount(id, req.user?.username);
  }

  @Patch(':id/discrepancies/:discId')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE_CLERK)
  async resolveDiscrepancy(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('discId', ParseUUIDPipe) discId: string,
    @Body() dto: ResolveDiscrepancyDto,
    @Req() req: { user?: { username?: string } },
  ) {
    return this.service.resolveDiscrepancy(id, discId, dto, req.user?.username);
  }

  @Post(':id/approve')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: { user?: { username?: string } },
  ) {
    return this.service.approveCount(id, req.user?.username);
  }

  @Post(':id/cancel')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: { user?: { username?: string } },
  ) {
    return this.service.cancelCount(id, req.user?.username);
  }
}
