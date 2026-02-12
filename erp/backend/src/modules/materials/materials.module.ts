import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Material } from '../../entities/material.entity';
import { BomItem } from '../../entities/bom-item.entity';
import { BomRevision } from '../../entities/bom-revision.entity';
import { Order } from '../../entities/order.entity';
import { MaterialsController } from './materials.controller';
import { MaterialsService } from './materials.service';

@Module({
  imports: [TypeOrmModule.forFeature([Material, BomItem, BomRevision, Order])],
  controllers: [MaterialsController],
  providers: [MaterialsService],
  exports: [MaterialsService],
})
export class MaterialsModule {}
