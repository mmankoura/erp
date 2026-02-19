import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReceivingSession } from '../../entities/receiving-session.entity';
import { ReceivingSessionLine } from '../../entities/receiving-session-line.entity';
import { InventoryLot } from '../../entities/inventory-lot.entity';
import { ReceivingInspection } from '../../entities/receiving-inspection.entity';
import { InventoryTransaction } from '../../entities/inventory-transaction.entity';
import { Material } from '../../entities/material.entity';
import { PurchaseOrder } from '../../entities/purchase-order.entity';
import { PurchaseOrderLine } from '../../entities/purchase-order-line.entity';
import { ReceivingController } from './receiving.controller';
import { ReceivingService } from './receiving.service';
import { UidGeneratorService } from './uid-generator.service';
import { AmlModule } from '../aml/aml.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ReceivingSession,
      ReceivingSessionLine,
      InventoryLot,
      ReceivingInspection,
      InventoryTransaction,
      Material,
      PurchaseOrder,
      PurchaseOrderLine,
    ]),
    AmlModule,
  ],
  controllers: [ReceivingController],
  providers: [ReceivingService, UidGeneratorService],
  exports: [ReceivingService],
})
export class ReceivingModule {}
