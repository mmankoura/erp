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
import { ConsumableOrdersService } from './consumable-orders.service';
import type { CreateConsumableOrderDto } from './consumable-orders.service';
import { ConsumableOrderStatus } from '../../entities/consumable-order.entity';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../../entities/user.entity';

@Controller('consumable-orders')
@UseGuards(AuthenticatedGuard, RolesGuard)
export class ConsumableOrdersController {
  constructor(private readonly service: ConsumableOrdersService) {}

  @Get()
  async findAll(@Query('status') status?: ConsumableOrderStatus) {
    return this.service.findAll(status);
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async create(@Body() dto: CreateConsumableOrderDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateConsumableOrderDto,
  ) {
    return this.service.update(id, dto);
  }

  @Post(':id/receive')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE_CLERK)
  async markReceived(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.markReceived(id);
  }

  @Post(':id/undo-receive')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async undoReceive(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.undoReceive(id);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id', ParseUUIDPipe) id: string) {
    await this.service.delete(id);
  }
}
