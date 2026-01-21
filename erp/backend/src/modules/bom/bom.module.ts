import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BomRevision } from '../../entities/bom-revision.entity';
import { BomItem } from '../../entities/bom-item.entity';
import { Product } from '../../entities/product.entity';
import { BomController } from './bom.controller';
import { BomService } from './bom.service';

@Module({
  imports: [TypeOrmModule.forFeature([BomRevision, BomItem, Product])],
  controllers: [BomController],
  providers: [BomService],
  exports: [BomService],
})
export class BomModule {}
