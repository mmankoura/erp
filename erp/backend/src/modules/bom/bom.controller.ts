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
} from '@nestjs/common';
import { BomService } from './bom.service';
import {
  CreateBomRevisionDto,
  UpdateBomRevisionDto,
  CreateBomItemDto,
  UpdateBomItemDto,
  CreateFullBomRevisionDto,
} from './dto';

@Controller('bom')
export class BomController {
  constructor(private readonly bomService: BomService) {}

  // ============ Revision Endpoints ============

  @Get('revisions')
  async findAllRevisions() {
    return this.bomService.findAllRevisions();
  }

  @Get('product/:productId')
  async findRevisionsByProduct(
    @Param('productId', ParseUUIDPipe) productId: string,
  ) {
    return this.bomService.findRevisionsByProduct(productId);
  }

  @Get('product/:productId/active')
  async findActiveRevision(
    @Param('productId', ParseUUIDPipe) productId: string,
  ) {
    return this.bomService.findActiveRevision(productId);
  }

  @Get('revision/:id')
  async findRevision(@Param('id', ParseUUIDPipe) id: string) {
    return this.bomService.findRevision(id);
  }

  @Post('revision')
  async createRevision(@Body() dto: CreateBomRevisionDto) {
    return this.bomService.createRevision(dto);
  }

  @Post('revision/full')
  async createFullRevision(@Body() dto: CreateFullBomRevisionDto) {
    return this.bomService.createFullRevision(dto);
  }

  @Patch('revision/:id')
  async updateRevision(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBomRevisionDto,
  ) {
    return this.bomService.updateRevision(id, dto);
  }

  @Delete('revision/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteRevision(@Param('id', ParseUUIDPipe) id: string) {
    await this.bomService.deleteRevision(id);
  }

  @Post('revision/:id/activate')
  async activateRevision(@Param('id', ParseUUIDPipe) id: string) {
    return this.bomService.activateRevision(id);
  }

  @Post('revision/:id/copy')
  async copyRevision(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { revision_number: string; change_summary?: string },
  ) {
    return this.bomService.copyRevision(
      id,
      body.revision_number,
      body.change_summary,
    );
  }

  // ============ Comparison Endpoints ============

  @Get('revision/:id1/diff/:id2')
  async compareRevisions(
    @Param('id1', ParseUUIDPipe) id1: string,
    @Param('id2', ParseUUIDPipe) id2: string,
  ) {
    return this.bomService.compareRevisions(id1, id2);
  }

  // ============ Item Endpoints ============

  @Get('revision/:revisionId/items')
  async findItemsByRevision(
    @Param('revisionId', ParseUUIDPipe) revisionId: string,
  ) {
    return this.bomService.findItemsByRevision(revisionId);
  }

  @Post('revision/:revisionId/items')
  async addItem(
    @Param('revisionId', ParseUUIDPipe) revisionId: string,
    @Body() dto: CreateBomItemDto,
  ) {
    return this.bomService.addItem(revisionId, dto);
  }

  @Patch('item/:itemId')
  async updateItem(
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateBomItemDto,
  ) {
    return this.bomService.updateItem(itemId, dto);
  }

  @Delete('item/:itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeItem(@Param('itemId', ParseUUIDPipe) itemId: string) {
    await this.bomService.removeItem(itemId);
  }
}
