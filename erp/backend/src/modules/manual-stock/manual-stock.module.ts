import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ManualStockEntry } from '../../entities/manual-stock-entry.entity';
import { ManualStockController } from './manual-stock.controller';
import { ManualStockService } from './manual-stock.service';

@Module({
  imports: [TypeOrmModule.forFeature([ManualStockEntry])],
  controllers: [ManualStockController],
  providers: [ManualStockService],
  exports: [ManualStockService],
})
export class ManualStockModule {}
