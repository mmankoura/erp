import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConsumableOrder, ConsumableOrderLine } from '../../entities/consumable-order.entity';
import { ConsumableOrdersController } from './consumable-orders.controller';
import { ConsumableOrdersService } from './consumable-orders.service';

@Module({
  imports: [TypeOrmModule.forFeature([ConsumableOrder, ConsumableOrderLine])],
  controllers: [ConsumableOrdersController],
  providers: [ConsumableOrdersService],
  exports: [ConsumableOrdersService],
})
export class ConsumableOrdersModule {}
