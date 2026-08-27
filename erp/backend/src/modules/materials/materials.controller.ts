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
  BulkUpdateMaterialDto,
  ResolvePartNumbersDto,
} from './dto';
import { FilterMaterialsDto } from './dto/filter-materials.dto';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User, UserRole } from '../../entities/user.entity';

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

  @Post('filter')
  async filterMaterials(@Body() dto: FilterMaterialsDto) {
    return this.materialsService.filterMaterials(dto);
  }

  /**
   * Resolve a batch of internal part numbers — what a BOM import needs before
   * it can tell you which lines are new materials.
   */
  @Post('resolve-part-numbers')
  async resolvePartNumbers(@Body() dto: ResolvePartNumbersDto) {
    return this.materialsService.resolveByPartNumbers(dto.part_numbers);
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

  /**
   * Settle master fields on materials that already exist. Used by the BOM
   * wizard, where the file is often the only place a bare material's
   * description or resource type has ever been written down.
   *
   * MUST stay above `@Patch(':id')`: Nest matches in declaration order, and
   * below it `ParseUUIDPipe` would take "bulk" for an id and fail with a
   * validation error that reads like a client bug.
   */
  @Patch('bulk')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async bulkUpdate(
    @Body() bulkUpdateDto: BulkUpdateMaterialDto,
    @CurrentUser() user?: User,
  ) {
    return this.materialsService.bulkUpdate(bulkUpdateDto, user?.username);
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
