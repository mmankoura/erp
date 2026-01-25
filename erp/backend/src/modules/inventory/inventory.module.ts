import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryTransaction } from '../../entities/inventory-transaction.entity';
import { InventoryAllocation } from '../../entities/inventory-allocation.entity';
import { InventoryLot } from '../../entities/inventory-lot.entity';
import { Material } from '../../entities/material.entity';
import { Order } from '../../entities/order.entity';
import { BomItem } from '../../entities/bom-item.entity';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { InventoryImportService } from './inventory-import.service';
import { PurchaseOrdersModule } from '../purchase-orders/purchase-orders.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InventoryTransaction,
      InventoryAllocation,
      InventoryLot,
      Material,
      Order,
      BomItem,
    ]),
    forwardRef(() => PurchaseOrdersModule),
  ],
  controllers: [InventoryController],
  providers: [InventoryService, InventoryImportService],
  exports: [InventoryService, InventoryImportService],
})
export class InventoryModule {}
