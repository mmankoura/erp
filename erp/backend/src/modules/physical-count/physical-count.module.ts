import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PhysicalCountController } from './physical-count.controller';
import { PhysicalCountService } from './physical-count.service';
import { PhysicalCount } from '../../entities/physical-count.entity';
import { PhysicalCountLot } from '../../entities/physical-count-lot.entity';
import { PhysicalCountScan } from '../../entities/physical-count-scan.entity';
import { PhysicalCountDiscrepancy } from '../../entities/physical-count-discrepancy.entity';
import { InventoryLot } from '../../entities/inventory-lot.entity';
import { Customer } from '../../entities/customer.entity';
import { Material } from '../../entities/material.entity';
import { AuditModule } from '../audit/audit.module';
import { SharedModule } from '../shared/shared.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PhysicalCount,
      PhysicalCountLot,
      PhysicalCountScan,
      PhysicalCountDiscrepancy,
      InventoryLot,
      Customer,
      Material,
    ]),
    AuditModule,
    SharedModule,
  ],
  controllers: [PhysicalCountController],
  providers: [PhysicalCountService],
  exports: [PhysicalCountService],
})
export class PhysicalCountModule {}
