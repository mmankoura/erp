import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CycleCountController } from './cycle-count.controller';
import { CycleCountService } from './cycle-count.service';
import { CycleCount } from '../../entities/cycle-count.entity';
import { CycleCountItem } from '../../entities/cycle-count-item.entity';
import { Material } from '../../entities/material.entity';
import { InventoryLot } from '../../entities/inventory-lot.entity';
import { InventoryTransaction } from '../../entities/inventory-transaction.entity';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CycleCount,
      CycleCountItem,
      Material,
      InventoryLot,
      InventoryTransaction,
    ]),
    AuditModule,
  ],
  controllers: [CycleCountController],
  providers: [CycleCountService],
  exports: [CycleCountService],
})
export class CycleCountModule {}
