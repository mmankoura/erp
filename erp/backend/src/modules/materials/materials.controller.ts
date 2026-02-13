import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MaterialsService } from './materials.service';
import {
  CreateMaterialDto,
  UpdateMaterialDto,
  BulkCreateMaterialDto,
} from './dto';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../../entities/user.entity';

@Controller('materials')
@UseGuards(AuthenticatedGuard, RolesGuard)
export class MaterialsController {
  constructor(private readonly materialsService: MaterialsService) {}

  @Get()
  async findAll(@Query('includeDeleted') includeDeleted?: string) {
    if (includeDeleted === 'true') {
      return this.materialsService.findAllIncludingDeleted();
    }
    return this.materialsService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.materialsService.findOne(id);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async create(@Body() createMaterialDto: CreateMaterialDto) {
    return this.materialsService.create(createMaterialDto);
  }

  @Post('bulk')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async bulkCreate(@Body() bulkCreateDto: BulkCreateMaterialDto) {
    return this.materialsService.bulkCreate(bulkCreateDto);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateMaterialDto: UpdateMaterialDto,
  ) {
    return this.materialsService.update(id, updateMaterialDto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.materialsService.remove(id);
  }

  @Post(':id/restore')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async restore(@Param('id', ParseUUIDPipe) id: string) {
    return this.materialsService.restore(id);
  }

  // ============ Where-Used Analysis ============

  @Get(':id/where-used')
  async getWhereUsed(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('activeOnly') activeOnly?: string,
  ) {
    const activeRevisionsOnly = activeOnly !== 'false';
    const [products, orders] = await Promise.all([
      this.materialsService.getWhereUsedProducts(id, activeRevisionsOnly),
      this.materialsService.getWhereUsedOrders(id),
    ]);
    return { products, orders };
  }

  @Get(':id/usage-summary')
  async getUsageSummary(@Param('id', ParseUUIDPipe) id: string) {
    return this.materialsService.getUsageSummary(id);
  }
}
