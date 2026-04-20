import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductionController } from './production.controller';
import { ProductionService } from './production.service';
import { Order } from '../../entities/order.entity';
import { ProductionLog } from '../../entities/production-log.entity';
import { BomItem } from '../../entities/bom-item.entity';
import { InventoryTransaction } from '../../entities/inventory-transaction.entity';
import { InventoryAllocation } from '../../entities/inventory-allocation.entity';
import { OrderMaterialSource } from '../../entities/order-material-source.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Order,
      ProductionLog,
      BomItem,
      InventoryTransaction,
      InventoryAllocation,
      OrderMaterialSource,
    ]),
  ],
  controllers: [ProductionController],
  providers: [ProductionService],
  exports: [ProductionService],
})
export class ProductionModule {}
