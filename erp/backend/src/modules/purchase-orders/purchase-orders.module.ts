import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PurchaseOrder } from '../../entities/purchase-order.entity';
import { PurchaseOrderLine } from '../../entities/purchase-order-line.entity';
import { Material } from '../../entities/material.entity';
import { Supplier } from '../../entities/supplier.entity';
import { InventoryTransaction } from '../../entities/inventory-transaction.entity';
import { PoHistory } from '../../entities/po-history.entity';
import { PurchaseOrdersController } from './purchase-orders.controller';
import { PurchaseOrdersService } from './purchase-orders.service';
import { PoHistoryController } from './po-history.controller';
import { PoHistoryService } from './po-history.service';
import { ReceivingInspectionModule } from '../receiving-inspection/receiving-inspection.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PurchaseOrder,
      PurchaseOrderLine,
      Material,
      Supplier,
      InventoryTransaction,
      PoHistory,
    ]),
    forwardRef(() => ReceivingInspectionModule),
  ],
  controllers: [PoHistoryController, PurchaseOrdersController],
  providers: [PurchaseOrdersService, PoHistoryService],
  exports: [PurchaseOrdersService],
})
export class PurchaseOrdersModule {}
