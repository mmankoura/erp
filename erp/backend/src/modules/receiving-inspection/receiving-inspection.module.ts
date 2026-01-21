import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReceivingInspection } from '../../entities/receiving-inspection.entity';
import { Material } from '../../entities/material.entity';
import { PurchaseOrderLine } from '../../entities/purchase-order-line.entity';
import { ReceivingInspectionController } from './receiving-inspection.controller';
import { ReceivingInspectionService } from './receiving-inspection.service';
import { AmlModule } from '../aml/aml.module';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ReceivingInspection, Material, PurchaseOrderLine]),
    AmlModule,
    forwardRef(() => InventoryModule),
  ],
  controllers: [ReceivingInspectionController],
  providers: [ReceivingInspectionService],
  exports: [ReceivingInspectionService],
})
export class ReceivingInspectionModule {}
