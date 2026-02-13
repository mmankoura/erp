import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { AmlService } from './aml.service';
import { CreateAmlDto, UpdateAmlDto } from './dto';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../../entities/user.entity';

@Controller('aml')
@UseGuards(AuthenticatedGuard, RolesGuard)
export class AmlController {
  constructor(private readonly amlService: AmlService) {}

  @Get()
  async findAll(@Query('includeDeleted') includeDeleted?: string) {
    if (includeDeleted === 'true') {
      return this.amlService.findAllIncludingDeleted();
    }
    return this.amlService.findAll();
  }

  @Get('validate')
  async validate(
    @Query('material_id', ParseUUIDPipe) materialId: string,
    @Query('manufacturer') manufacturer: string,
    @Query('mpn') mpn: string,
  ) {
    return this.amlService.validate(materialId, manufacturer, mpn);
  }

  @Get('material/:materialId')
  async findByMaterial(
    @Param('materialId', ParseUUIDPipe) materialId: string,
    @Query('approved_only') approvedOnly?: string,
  ) {
    if (approvedOnly === 'true') {
      return this.amlService.findApprovedByMaterial(materialId);
    }
    return this.amlService.findByMaterial(materialId);
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.amlService.findOne(id);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async create(@Body() dto: CreateAmlDto) {
    return this.amlService.create(dto);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAmlDto,
  ) {
    return this.amlService.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('actor') actor?: string,
  ) {
    await this.amlService.remove(id, actor);
  }

  @Post(':id/approve')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('approved_by') approvedBy: string,
  ) {
    if (!approvedBy) {
      throw new Error('approved_by is required');
    }
    return this.amlService.approve(id, approvedBy);
  }

  @Post(':id/suspend')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async suspend(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('suspended_by') suspendedBy: string,
    @Body('reason') reason?: string,
  ) {
    if (!suspendedBy) {
      throw new Error('suspended_by is required');
    }
    return this.amlService.suspend(id, suspendedBy, reason);
  }

  @Post(':id/reinstate')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async reinstate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('reinstated_by') reinstatedBy: string,
  ) {
    if (!reinstatedBy) {
      throw new Error('reinstated_by is required');
    }
    return this.amlService.reinstate(id, reinstatedBy);
  }

  @Post(':id/obsolete')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async obsolete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('obsoleted_by') obsoletedBy: string,
    @Body('reason') reason?: string,
  ) {
    if (!obsoletedBy) {
      throw new Error('obsoleted_by is required');
    }
    return this.amlService.obsolete(id, obsoletedBy, reason);
  }
}
