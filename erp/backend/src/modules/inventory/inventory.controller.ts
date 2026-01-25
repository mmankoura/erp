import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  Query,
  ParseBoolPipe,
} from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { InventoryImportService } from './inventory-import.service';
import {
  CreateTransactionDto,
  CreateAllocationDto,
  UpdateAllocationDto,
  AllocateForOrderDto,
  InventoryImportPreviewDto,
  InventoryImportParseDto,
  InventoryImportCommitDto,
} from './dto';
import { OwnerType } from '../../entities/inventory-transaction.entity';

@Controller('inventory')
export class InventoryController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly inventoryImportService: InventoryImportService,
  ) {}

  // ==================== STOCK ENDPOINTS ====================

  /**
   * GET /inventory
   * List all materials with current stock levels (includes allocation info)
   */
  @Get()
  async findAllStock() {
    return this.inventoryService.findAllStock();
  }

  /**
   * GET /inventory/low-stock?threshold=N
   * Get materials with available quantity at or below threshold
   */
  @Get('low-stock')
  async getLowStock(@Query('threshold') threshold?: string) {
    const thresholdValue = threshold ? parseFloat(threshold) : 0;
    return this.inventoryService.getLowStockMaterials(thresholdValue);
  }

  /**
   * GET /inventory/transactions/recent?limit=N
   * Get recent transactions across all materials
   */
  @Get('transactions/recent')
  async getRecentTransactions(@Query('limit') limit?: string) {
    const limitValue = limit ? parseInt(limit, 10) : 50;
    return this.inventoryService.getRecentTransactions(limitValue);
  }

  // ==================== IMPORT ENDPOINTS ====================

  /**
   * POST /inventory/import/preview
   * Preview file content before mapping
   */
  @Post('import/preview')
  async previewImportFile(@Body() dto: InventoryImportPreviewDto) {
    return this.inventoryImportService.previewFile(dto);
  }

  /**
   * POST /inventory/import/parse
   * Parse file with column mappings, validate, and match materials
   */
  @Post('import/parse')
  async parseImportFile(@Body() dto: InventoryImportParseDto) {
    return this.inventoryImportService.parseAndMapFile(dto);
  }

  /**
   * POST /inventory/import/commit
   * Commit parsed import - create lots and receipt transactions
   */
  @Post('import/commit')
  async commitImport(@Body() dto: InventoryImportCommitDto) {
    return this.inventoryImportService.commitImport(dto);
  }

  // ==================== LOT ENDPOINTS ====================

  /**
   * GET /inventory/lots
   * List all inventory lots
   */
  @Get('lots')
  async findAllLots(
    @Query('status') status?: string,
    @Query('material_id') materialId?: string,
  ) {
    return this.inventoryImportService.findAllLots({ status, materialId });
  }

  /**
   * GET /inventory/lots/by-uid/:uid
   * Get a lot by its UID
   */
  @Get('lots/by-uid/:uid')
  async getLotByUid(@Param('uid') uid: string) {
    return this.inventoryImportService.findLotByUid(uid);
  }

  /**
   * GET /inventory/lots/:id
   * Get a specific lot by ID
   */
  @Get('lots/:id')
  async getLot(@Param('id', ParseUUIDPipe) id: string) {
    return this.inventoryImportService.findLot(id);
  }

  /**
   * DELETE /inventory/lots/:id
   * Delete a specific lot
   */
  @Delete('lots/:id')
  async deleteLot(@Param('id', ParseUUIDPipe) id: string) {
    await this.inventoryImportService.deleteLot(id);
    return { success: true };
  }

  /**
   * POST /inventory/lots/bulk-delete
   * Delete multiple lots
   */
  @Post('lots/bulk-delete')
  async deleteLots(@Body() body: { ids: string[] }) {
    return this.inventoryImportService.deleteLots(body.ids);
  }

  /**
   * GET /inventory/by-owner?owner_type=CUSTOMER&owner_id=UUID
   * Get stock level for a material filtered by owner
   * - owner_type: COMPANY or CUSTOMER
   * - owner_id: customer UUID (required when owner_type=CUSTOMER)
   */
  @Get('by-owner/:materialId')
  async getStockByOwner(
    @Param('materialId', ParseUUIDPipe) materialId: string,
    @Query('owner_type') ownerType: string,
    @Query('owner_id') ownerId?: string,
  ) {
    const validOwnerType = ownerType === 'CUSTOMER' ? OwnerType.CUSTOMER : OwnerType.COMPANY;
    const validOwnerId = validOwnerType === OwnerType.CUSTOMER ? ownerId : null;

    const quantityOnHand = await this.inventoryService.getQuantityOnHandByOwner(
      materialId,
      validOwnerType,
      validOwnerId ?? null,
    );
    const quantityAllocated = await this.inventoryService.getAllocatedQuantityByOwner(
      materialId,
      validOwnerType,
      validOwnerId ?? null,
    );

    return {
      material_id: materialId,
      owner_type: validOwnerType,
      owner_id: validOwnerId,
      quantity_on_hand: quantityOnHand,
      quantity_allocated: quantityAllocated,
      quantity_available: quantityOnHand - quantityAllocated,
    };
  }

  /**
   * GET /inventory/:materialId
   * Get stock level for a specific material (includes allocation info)
   */
  @Get(':materialId')
  async getStockByMaterial(
    @Param('materialId', ParseUUIDPipe) materialId: string,
  ) {
    return this.inventoryService.getStockByMaterialId(materialId);
  }

  /**
   * GET /inventory/:materialId/transactions?limit=N
   * Get transaction history for a material
   */
  @Get(':materialId/transactions')
  async getTransactions(
    @Param('materialId', ParseUUIDPipe) materialId: string,
    @Query('limit') limit?: string,
  ) {
    const limitValue = limit ? parseInt(limit, 10) : 100;
    return this.inventoryService.getTransactionsByMaterialId(
      materialId,
      limitValue,
    );
  }

  /**
   * POST /inventory/transaction
   * Record an inventory transaction
   */
  @Post('transaction')
  async createTransaction(@Body() createTransactionDto: CreateTransactionDto) {
    return this.inventoryService.createTransaction(createTransactionDto);
  }

  /**
   * POST /inventory/:materialId/set-stock
   * Set stock to a specific level (convenience endpoint)
   */
  @Post(':materialId/set-stock')
  async setStockLevel(
    @Param('materialId', ParseUUIDPipe) materialId: string,
    @Body() body: { quantity: number; reason?: string; created_by?: string },
  ) {
    return this.inventoryService.setStockLevel(
      materialId,
      body.quantity,
      body.reason,
      body.created_by,
    );
  }

  // ==================== ALLOCATION ENDPOINTS ====================

  /**
   * GET /inventory/allocations/summary
   * Get summary of all active allocations
   */
  @Get('allocations/summary')
  async getAllocationSummary() {
    return this.inventoryService.getAllocationSummary();
  }

  /**
   * GET /inventory/:materialId/allocations?includeInactive=true
   * Get allocations for a specific material
   */
  @Get(':materialId/allocations')
  async getAllocationsByMaterial(
    @Param('materialId', ParseUUIDPipe) materialId: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    const includeInactiveValue = includeInactive === 'true';
    return this.inventoryService.getAllocationsByMaterial(
      materialId,
      includeInactiveValue,
    );
  }

  /**
   * POST /inventory/allocation
   * Create a single allocation
   */
  @Post('allocation')
  async createAllocation(@Body() createAllocationDto: CreateAllocationDto) {
    return this.inventoryService.createAllocation(createAllocationDto);
  }

  /**
   * PATCH /inventory/allocation/:allocationId
   * Update an allocation quantity
   */
  @Patch('allocation/:allocationId')
  async updateAllocation(
    @Param('allocationId', ParseUUIDPipe) allocationId: string,
    @Body() updateAllocationDto: UpdateAllocationDto,
  ) {
    return this.inventoryService.updateAllocation(allocationId, updateAllocationDto);
  }

  /**
   * DELETE /inventory/allocation/:allocationId
   * Cancel an allocation (release reserved stock)
   */
  @Delete('allocation/:allocationId')
  async cancelAllocation(
    @Param('allocationId', ParseUUIDPipe) allocationId: string,
  ) {
    return this.inventoryService.cancelAllocation(allocationId);
  }

  /**
   * POST /inventory/allocation/:allocationId/consume
   * Convert allocation to consumption transaction
   */
  @Post('allocation/:allocationId/consume')
  async consumeAllocation(
    @Param('allocationId', ParseUUIDPipe) allocationId: string,
    @Body() body: { quantity?: number; created_by?: string },
  ) {
    return this.inventoryService.consumeAllocation(
      allocationId,
      body.quantity,
      body.created_by,
    );
  }

  /**
   * POST /inventory/allocate-for-order
   * Allocate all materials for an order based on its BOM
   */
  @Post('allocate-for-order')
  async allocateForOrder(@Body() dto: AllocateForOrderDto) {
    return this.inventoryService.allocateForOrder(
      dto.order_id,
      dto.created_by,
      dto.allocate_available_only ?? false,
    );
  }

  /**
   * DELETE /inventory/allocations/order/:orderId
   * Deallocate all materials for an order
   */
  @Delete('allocations/order/:orderId')
  async deallocateForOrder(
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    return this.inventoryService.deallocateForOrder(orderId);
  }

  /**
   * GET /inventory/allocations/order/:orderId?includeInactive=true
   * Get all allocations for a specific order
   */
  @Get('allocations/order/:orderId')
  async getAllocationsByOrder(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    const includeInactiveValue = includeInactive === 'true';
    return this.inventoryService.getAllocationsByOrder(orderId, includeInactiveValue);
  }
}
