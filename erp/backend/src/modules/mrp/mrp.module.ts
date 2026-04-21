import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../../entities/order.entity';
import { BomItem } from '../../entities/bom-item.entity';
import { Material } from '../../entities/material.entity';
import { OrderMaterialSource } from '../../entities/order-material-source.entity';
import { BomItemAlternate } from '../../entities/bom-item-alternate.entity';
import { MrpController } from './mrp.controller';
import { MrpService } from './mrp.service';
import { InventoryModule } from '../inventory/inventory.module';
import { PurchaseOrdersModule } from '../purchase-orders/purchase-orders.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, BomItem, Material, OrderMaterialSource, BomItemAlternate]),
    InventoryModule,
    forwardRef(() => PurchaseOrdersModule),
  ],
  controllers: [MrpController],
  providers: [MrpService],
  exports: [MrpService],
})
export class MrpModule {}
