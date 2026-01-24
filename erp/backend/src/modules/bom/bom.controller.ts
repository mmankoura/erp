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
} from '@nestjs/common';
import { BomService } from './bom.service';
import { BomImportService } from './bom-import.service';
import {
  CreateBomRevisionDto,
  UpdateBomRevisionDto,
  CreateBomItemDto,
  UpdateBomItemDto,
  CreateFullBomRevisionDto,
  CreateBomImportMappingDto,
  UpdateBomImportMappingDto,
  BomImportUploadDto,
  BomImportCommitDto,
} from './dto';

@Controller('bom')
export class BomController {
  constructor(
    private readonly bomService: BomService,
    private readonly bomImportService: BomImportService,
  ) {}

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

  // ============ Import Mapping Endpoints ============

  @Get('import/mappings')
  async findAllMappings() {
    return this.bomImportService.findAllMappings();
  }

  @Get('import/mappings/:id')
  async findMapping(@Param('id', ParseUUIDPipe) id: string) {
    return this.bomImportService.findMapping(id);
  }

  @Post('import/mappings')
  async createMapping(@Body() dto: CreateBomImportMappingDto) {
    return this.bomImportService.createMapping(dto);
  }

  @Patch('import/mappings/:id')
  async updateMapping(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBomImportMappingDto,
  ) {
    return this.bomImportService.updateMapping(id, dto);
  }

  @Delete('import/mappings/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteMapping(@Param('id', ParseUUIDPipe) id: string) {
    await this.bomImportService.deleteMapping(id);
  }

  // ============ Import Endpoints ============

  @Post('import/preview')
  async previewFile(
    @Body() body: { file_content: string; has_header_row?: boolean; skip_rows?: number },
  ) {
    return this.bomImportService.previewFile(
      body.file_content,
      body.has_header_row,
      body.skip_rows,
    );
  }

  @Post('import/parse')
  async parseAndMapFile(@Body() dto: BomImportUploadDto) {
    return this.bomImportService.parseAndMapFile(dto);
  }

  @Post('import/commit')
  async commitImport(@Body() dto: BomImportCommitDto) {
    return this.bomImportService.commitImport(dto);
  }
}
