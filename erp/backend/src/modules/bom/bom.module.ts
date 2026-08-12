import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BomRevision } from '../../entities/bom-revision.entity';
import { BomItem } from '../../entities/bom-item.entity';
import { BomItemAlternate } from '../../entities/bom-item-alternate.entity';
import { BomImportMapping } from '../../entities/bom-import-mapping.entity';
import { BomWizardRecipe } from '../../entities/bom-wizard-recipe.entity';
import { Product } from '../../entities/product.entity';
import { Material } from '../../entities/material.entity';
import { Order } from '../../entities/order.entity';
import { BomController } from './bom.controller';
import { BomService } from './bom.service';
import { BomImportService } from './bom-import.service';
import { BomWizardService } from './bom-wizard.service';
import { AmlModule } from '../aml/aml.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BomRevision,
      BomItem,
      BomItemAlternate,
      BomImportMapping,
      BomWizardRecipe,
      Product,
      Material,
      Order,
    ]),
    AmlModule,
  ],
  controllers: [BomController],
  providers: [BomService, BomImportService, BomWizardService],
  exports: [BomService, BomImportService, BomWizardService],
})
export class BomModule {}
