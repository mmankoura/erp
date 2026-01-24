import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BomRevision } from '../../entities/bom-revision.entity';
import { BomItem } from '../../entities/bom-item.entity';
import { BomImportMapping } from '../../entities/bom-import-mapping.entity';
import { Product } from '../../entities/product.entity';
import { Material } from '../../entities/material.entity';
import { BomController } from './bom.controller';
import { BomService } from './bom.service';
import { BomImportService } from './bom-import.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BomRevision,
      BomItem,
      BomImportMapping,
      Product,
      Material,
    ]),
  ],
  controllers: [BomController],
  providers: [BomService, BomImportService],
  exports: [BomService, BomImportService],
})
export class BomModule {}
