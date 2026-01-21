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
} from '@nestjs/common';
import {
  PurchaseOrdersService,
  PurchaseOrderFilters,
} from './purchase-orders.service';
import {
  CreatePurchaseOrderDto,
  UpdatePurchaseOrderDto,
  ReceiveAgainstPODto,
  AddLineDto,
  UpdateLineDto,
} from './dto';
import { PurchaseOrderStatus } from '../../entities/purchase-order.entity';

@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(private readonly poService: PurchaseOrdersService) {}

  // ==================== CRUD ====================

  @Get()
  async findAll(
    @Query('status') status?: PurchaseOrderStatus,
    @Query('supplier_id') supplier_id?: string,
    @Query('from_date') from_date?: string,
    @Query('to_date') to_date?: string,
    @Query('includeDeleted') includeDeleted?: string,
  ) {
    const filters: PurchaseOrderFilters = {
      status,
      supplier_id,
      from_date,
      to_date,
      includeDeleted: includeDeleted === 'true',
    };
    return this.poService.findAll(filters);
  }

  @Get('on-order')
  async getAllQuantitiesOnOrder() {
    return this.poService.getAllQuantitiesOnOrder();
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.poService.findOne(id);
  }

  @Get('number/:poNumber')
  async findByPoNumber(@Param('poNumber') poNumber: string) {
    const po = await this.poService.findByPoNumber(poNumber);
    if (!po) {
      return { message: `PO with number "${poNumber}" not found` };
    }
    return po;
  }

  @Post()
  async create(@Body() dto: CreatePurchaseOrderDto) {
    return this.poService.create(dto);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePurchaseOrderDto,
  ) {
    return this.poService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.poService.remove(id);
  }

  // ==================== LINE OPERATIONS ====================

  @Post(':id/lines')
  async addLine(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() lineDto: AddLineDto,
  ) {
    return this.poService.addLine(id, lineDto);
  }

  @Patch('lines/:lineId')
  async updateLine(
    @Param('lineId', ParseUUIDPipe) lineId: string,
    @Body() updates: UpdateLineDto,
  ) {
    return this.poService.updateLine(lineId, updates);
  }

  @Delete('lines/:lineId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeLine(@Param('lineId', ParseUUIDPipe) lineId: string) {
    await this.poService.removeLine(lineId);
  }

  // ==================== STATUS TRANSITIONS ====================

  @Post(':id/submit')
  async submit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { actor?: string },
  ) {
    return this.poService.submitPO(id, body?.actor);
  }

  @Post(':id/confirm')
  async confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { actor?: string },
  ) {
    return this.poService.confirmPO(id, body?.actor);
  }

  @Post(':id/close')
  async close(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { actor?: string },
  ) {
    return this.poService.closePO(id, body?.actor);
  }

  @Post(':id/cancel')
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { reason?: string; actor?: string },
  ) {
    return this.poService.cancelPO(id, body?.reason, body?.actor);
  }

  // ==================== RECEIVING ====================

  @Post(':id/receive')
  async receive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReceiveAgainstPODto,
  ) {
    return this.poService.receiveAgainstPO(id, dto);
  }

  // ==================== QUERIES ====================

  @Get('material/:materialId/on-order')
  async getQuantityOnOrder(
    @Param('materialId', ParseUUIDPipe) materialId: string,
  ) {
    const quantity = await this.poService.getQuantityOnOrder(materialId);
    return { material_id: materialId, quantity_on_order: quantity };
  }

  @Get('material/:materialId/open-pos')
  async getOpenPOsForMaterial(
    @Param('materialId', ParseUUIDPipe) materialId: string,
  ) {
    return this.poService.getOpenPOsForMaterial(materialId);
  }
}
