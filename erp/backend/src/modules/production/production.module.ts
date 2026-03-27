import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductionController } from './production.controller';
import { ProductionService } from './production.service';
import { Order } from '../../entities/order.entity';
import { ProductionLog } from '../../entities/production-log.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, ProductionLog]),
  ],
  controllers: [ProductionController],
  providers: [ProductionService],
  exports: [ProductionService],
})
export class ProductionModule {}
