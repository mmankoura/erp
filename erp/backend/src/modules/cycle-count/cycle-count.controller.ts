import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { CycleCountService } from './cycle-count.service';
import {
  CreateCycleCountDto,
  CountEntryDto,
  BatchCountEntryDto,
  StartCountDto,
  CompleteCountDto,
  ApproveCountDto,
  CancelCountDto,
  SkipItemDto,
} from './dto';
import { CycleCountStatus } from '../../entities/cycle-count.entity';

@Controller('cycle-counts')
export class CycleCountController {
  constructor(private readonly cycleCountService: CycleCountService) {}

  // ==================== CRUD ENDPOINTS ====================

  /**
   * POST /cycle-counts
   * Create a new cycle count
   */
  @Post()
  async create(@Body() dto: CreateCycleCountDto) {
    return this.cycleCountService.createCycleCount(dto);
  }

  /**
   * GET /cycle-counts
   * List all cycle counts with optional filtering
   */
  @Get()
  async findAll(
    @Query('status') status?: CycleCountStatus,
    @Query('from_date') fromDate?: string,
    @Query('to_date') toDate?: string,
  ) {
    return this.cycleCountService.findAll({
      status,
      from_date: fromDate,
      to_date: toDate,
    });
  }

  /**
   * GET /cycle-counts/:id
   * Get a specific cycle count with items
   */
  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.cycleCountService.findById(id);
  }

  /**
   * GET /cycle-counts/:id/variance-report
   * Get variance report for a cycle count
   */
  @Get(':id/variance-report')
  async getVarianceReport(@Param('id', ParseUUIDPipe) id: string) {
    return this.cycleCountService.getVarianceReport(id);
  }

  // ==================== WORKFLOW ENDPOINTS ====================

  /**
   * POST /cycle-counts/:id/start
   * Start a cycle count (capture system quantities)
   */
  @Post(':id/start')
  async startCount(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StartCountDto,
  ) {
    return this.cycleCountService.startCount(id, dto.started_by);
  }

  /**
   * POST /cycle-counts/:id/count
   * Record a single count entry
   */
  @Post(':id/count')
  async recordCount(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CountEntryDto,
  ) {
    return this.cycleCountService.recordCount(id, dto);
  }

  /**
   * POST /cycle-counts/:id/count/batch
   * Record multiple count entries at once
   */
  @Post(':id/count/batch')
  async recordBatchCount(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BatchCountEntryDto,
  ) {
    const results: Array<Awaited<ReturnType<typeof this.cycleCountService.recordCount>>> = [];
    for (const entry of dto.entries) {
      const result = await this.cycleCountService.recordCount(id, entry);
      results.push(result);
    }
    return results;
  }

  /**
   * POST /cycle-counts/:id/complete
   * Complete counting and move to pending review
   */
  @Post(':id/complete')
  async completeCount(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteCountDto,
  ) {
    return this.cycleCountService.completeCount(id, dto.completed_by);
  }

  /**
   * POST /cycle-counts/:id/approve
   * Approve cycle count and create adjustment transactions
   */
  @Post(':id/approve')
  async approveCount(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveCountDto,
  ) {
    return this.cycleCountService.approveCount(id, dto.approved_by, dto.item_ids);
  }

  /**
   * POST /cycle-counts/:id/cancel
   * Cancel a cycle count
   */
  @Post(':id/cancel')
  async cancelCount(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelCountDto,
  ) {
    return this.cycleCountService.cancelCount(id, dto.cancelled_by, dto.reason);
  }

  /**
   * POST /cycle-counts/:id/items/:itemId/skip
   * Skip an item (e.g., material not found)
   */
  @Post(':id/items/:itemId/skip')
  async skipItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: SkipItemDto,
  ) {
    return this.cycleCountService.skipItem(id, itemId, dto.reason, dto.skipped_by);
  }

  // ==================== MATERIAL HISTORY ====================

  /**
   * GET /cycle-counts/material/:materialId/history
   * Get count history for a specific material
   */
  @Get('material/:materialId/history')
  async getMaterialHistory(
    @Param('materialId', ParseUUIDPipe) materialId: string,
    @Query('limit') limit?: string,
  ) {
    const limitValue = limit ? parseInt(limit, 10) : 10;
    return this.cycleCountService.getMaterialCountHistory(materialId, limitValue);
  }
}
