import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KittingController } from './kitting.controller';
import { KittingService } from './kitting.service';
import { KittingList } from '../../entities/kitting-list.entity';
import { KittingListOrder } from '../../entities/kitting-list-order.entity';
import { KittingListItem } from '../../entities/kitting-list-item.entity';
import { KittingListScan } from '../../entities/kitting-list-scan.entity';
import { Order } from '../../entities/order.entity';
import { BomItem } from '../../entities/bom-item.entity';
import { BomItemAlternate } from '../../entities/bom-item-alternate.entity';
import { InventoryLot } from '../../entities/inventory-lot.entity';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      KittingList,
      KittingListOrder,
      KittingListItem,
      KittingListScan,
      Order,
      BomItem,
      BomItemAlternate,
      InventoryLot,
    ]),
    InventoryModule,
  ],
  controllers: [KittingController],
  providers: [KittingService],
  exports: [KittingService],
})
export class KittingModule {}
