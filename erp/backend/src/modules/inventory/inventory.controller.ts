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
  UseGuards,
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
  PickMaterialsDto,
  IssueMaterialsDto,
  ReturnMaterialsDto,
  ReturnFloorStockDto,
} from './dto';
import { OwnerType } from '../../entities/inventory-transaction.entity';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../../entities/user.entity';

@Controller('inventory')
@UseGuards(AuthenticatedGuard, RolesGuard)
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
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE_CLERK)
  async previewImportFile(@Body() dto: InventoryImportPreviewDto) {
    return this.inventoryImportService.previewFile(dto);
  }

  /**
   * POST /inventory/import/parse
   * Parse file with column mappings, validate, and match materials
   */
  @Post('import/parse')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE_CLERK)
  async parseImportFile(@Body() dto: InventoryImportParseDto) {
    return this.inventoryImportService.parseAndMapFile(dto);
  }

  /**
   * POST /inventory/import/commit
   * Commit parsed import - create lots and receipt transactions
   */
  @Post('import/commit')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE_CLERK)
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
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async deleteLot(@Param('id', ParseUUIDPipe) id: string) {
    await this.inventoryImportService.deleteLot(id);
    return { success: true };
  }

  /**
   * POST /inventory/lots/bulk-delete
   * Delete multiple lots
   */
  @Post('lots/bulk-delete')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
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
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async createTransaction(@Body() createTransactionDto: CreateTransactionDto) {
    return this.inventoryService.createTransaction(createTransactionDto);
  }

  /**
   * POST /inventory/:materialId/set-stock
   * Set stock to a specific level (convenience endpoint)
   */
  @Post(':materialId/set-stock')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
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
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async createAllocation(@Body() createAllocationDto: CreateAllocationDto) {
    return this.inventoryService.createAllocation(createAllocationDto);
  }

  /**
   * PATCH /inventory/allocation/:allocationId
   * Update an allocation quantity
   */
  @Patch('allocation/:allocationId')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
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
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
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
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE_CLERK)
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
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
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
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
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

  // ==================== RETURN WORKFLOW ENDPOINTS ====================

  /**
   * GET /inventory/floor-stock
   * Get all floor stock allocations (materials left at production for future use)
   */
  @Get('floor-stock')
  async getFloorStock() {
    return this.inventoryService.getFloorStockAllocations();
  }

  /**
   * GET /inventory/order/:orderId/issued
   * Get materials currently issued to an order (ready for return)
   * Returns allocations with ISSUED status and expected return quantities
   */
  @Get('order/:orderId/issued')
  async getIssuedMaterials(
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    return this.inventoryService.getIssuedMaterialsForOrder(orderId);
  }

  /**
   * POST /inventory/order/:orderId/pick
   * Pick materials for an order - transition allocations from ACTIVE to PICKED
   * Called when materials are physically pulled from warehouse shelves
   */
  @Post('order/:orderId/pick')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE_CLERK)
  async pickMaterials(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: PickMaterialsDto,
  ) {
    return this.inventoryService.pickMaterialsForOrder(
      orderId,
      dto.allocation_ids,
      dto.created_by,
    );
  }

  /**
   * POST /inventory/order/:orderId/issue
   * Issue materials for an order - transition allocations from PICKED to ISSUED
   * Called when materials leave the warehouse and go to production
   */
  @Post('order/:orderId/issue')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE_CLERK)
  async issueMaterials(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: IssueMaterialsDto,
  ) {
    return this.inventoryService.issueMaterialsForOrder(
      orderId,
      dto.allocation_ids,
      dto.created_by,
    );
  }

  /**
   * POST /inventory/order/:orderId/return
   * Process material returns from production
   * Handles counting, consumption recording, waste tracking, and variance calculation
   */
  @Post('order/:orderId/return')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE_CLERK)
  async returnMaterials(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: ReturnMaterialsDto,
  ) {
    return this.inventoryService.returnMaterialsFromOrder(
      orderId,
      dto.returns,
      dto.created_by,
    );
  }

  /**
   * POST /inventory/order/:orderId/auto-consume-th
   * Auto-consume TH parts that exactly match required quantity
   * TH parts are typically exact-count and can be auto-consumed when issued=required
   */
  @Post('order/:orderId/auto-consume-th')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE_CLERK)
  async autoConsumeTHParts(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() body: { created_by?: string },
  ) {
    return this.inventoryService.autoConsumeTHParts(orderId, body.created_by);
  }

  /**
   * POST /inventory/floor-stock/:allocationId/return
   * Convert floor stock back to available inventory
   * Used when floor stock materials are returned to warehouse
   */
  @Post('floor-stock/:allocationId/return')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.WAREHOUSE_CLERK)
  async returnFloorStock(
    @Param('allocationId', ParseUUIDPipe) allocationId: string,
    @Body() dto: ReturnFloorStockDto,
  ) {
    return this.inventoryService.returnFloorStock(
      allocationId,
      dto.counted_quantity,
      dto.created_by,
    );
  }
}
