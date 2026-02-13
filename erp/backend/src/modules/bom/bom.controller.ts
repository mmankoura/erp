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
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../../entities/user.entity';

@Controller('bom')
@UseGuards(AuthenticatedGuard, RolesGuard)
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
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async createRevision(@Body() dto: CreateBomRevisionDto) {
    return this.bomService.createRevision(dto);
  }

  @Post('revision/full')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async createFullRevision(@Body() dto: CreateFullBomRevisionDto) {
    return this.bomService.createFullRevision(dto);
  }

  @Patch('revision/:id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async updateRevision(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBomRevisionDto,
  ) {
    return this.bomService.updateRevision(id, dto);
  }

  @Delete('revision/:id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteRevision(@Param('id', ParseUUIDPipe) id: string) {
    await this.bomService.deleteRevision(id);
  }

  @Post('revision/:id/activate')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async activateRevision(@Param('id', ParseUUIDPipe) id: string) {
    return this.bomService.activateRevision(id);
  }

  @Post('revision/:id/copy')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
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
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async addItem(
    @Param('revisionId', ParseUUIDPipe) revisionId: string,
    @Body() dto: CreateBomItemDto,
  ) {
    return this.bomService.addItem(revisionId, dto);
  }

  @Patch('item/:itemId')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async updateItem(
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateBomItemDto,
  ) {
    return this.bomService.updateItem(itemId, dto);
  }

  @Delete('item/:itemId')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
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
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async createMapping(@Body() dto: CreateBomImportMappingDto) {
    return this.bomImportService.createMapping(dto);
  }

  @Patch('import/mappings/:id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async updateMapping(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBomImportMappingDto,
  ) {
    return this.bomImportService.updateMapping(id, dto);
  }

  @Delete('import/mappings/:id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
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
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async parseAndMapFile(@Body() dto: BomImportUploadDto) {
    return this.bomImportService.parseAndMapFile(dto);
  }

  @Post('import/commit')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async commitImport(@Body() dto: BomImportCommitDto) {
    return this.bomImportService.commitImport(dto);
  }
}
