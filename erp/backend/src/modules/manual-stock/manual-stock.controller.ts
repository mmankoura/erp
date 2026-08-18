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
import { ManualStockService } from './manual-stock.service';
import { CreateManualStockEntryDto } from './dto/create-manual-stock-entry.dto';
import { UpdateManualStockEntryDto } from './dto/update-manual-stock-entry.dto';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../../entities/user.entity';

@Controller('manual-stock')
@UseGuards(AuthenticatedGuard, RolesGuard)
export class ManualStockController {
  constructor(private readonly service: ManualStockService) {}

  @Get()
  async findAll(@Query('search') search?: string) {
    return this.service.findAll(search);
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE_CLERK)
  async create(@Body() dto: CreateManualStockEntryDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE_CLERK)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateManualStockEntryDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE_CLERK)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.service.remove(id);
  }
}
