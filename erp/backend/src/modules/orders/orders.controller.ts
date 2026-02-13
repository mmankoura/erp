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
import { OrdersService, OrderFilters } from './orders.service';
import { CreateOrderDto, UpdateOrderDto } from './dto';
import { OrderStatus } from '../../entities/order.entity';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../../entities/user.entity';

@Controller('orders')
@UseGuards(AuthenticatedGuard, RolesGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  async findAll(
    @Query('status') status?: OrderStatus,
    @Query('customer_id') customer_id?: string,
    @Query('product_id') product_id?: string,
    @Query('due_date_from') due_date_from?: string,
    @Query('due_date_to') due_date_to?: string,
    @Query('includeDeleted') includeDeleted?: string,
  ) {
    const filters: OrderFilters = {
      status,
      customer_id,
      product_id,
      due_date_from,
      due_date_to,
      includeDeleted: includeDeleted === 'true',
    };
    return this.ordersService.findAll(filters);
  }

  @Get('stats')
  async getStats() {
    return this.ordersService.getOrderStats();
  }

  @Get('active')
  async getActiveOrders() {
    return this.ordersService.getActiveOrders();
  }

  @Get('number/:orderNumber')
  async findByOrderNumber(@Param('orderNumber') orderNumber: string) {
    return this.ordersService.findByOrderNumber(orderNumber);
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.ordersService.findOne(id);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async create(@Body() dto: CreateOrderDto) {
    return this.ordersService.create(dto);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderDto,
  ) {
    return this.ordersService.update(id, dto);
  }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('status') status: OrderStatus,
  ) {
    return this.ordersService.updateStatus(id, status);
  }

  @Post(':id/ship')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async shipQuantity(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('quantity') quantity: number,
  ) {
    return this.ordersService.shipQuantity(id, quantity);
  }

  @Post(':id/cancel')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.ordersService.cancel(id);
  }

  @Post('bulk-delete')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async bulkDelete(@Body() body: { ids: string[] }) {
    return this.ordersService.bulkDelete(body.ids);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.ordersService.remove(id);
  }

  @Post(':id/restore')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async restore(@Param('id', ParseUUIDPipe) id: string) {
    return this.ordersService.restore(id);
  }
}
