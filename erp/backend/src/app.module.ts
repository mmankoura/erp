import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import 'dotenv/config';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { MaterialsModule } from './modules/materials/materials.module';
import { ProductsModule } from './modules/products/products.module';
import { CustomersModule } from './modules/customers/customers.module';
import { BomModule } from './modules/bom/bom.module';
import { OrdersModule } from './modules/orders/orders.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { MrpModule } from './modules/mrp/mrp.module';
import { AuditModule } from './modules/audit/audit.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { PurchaseOrdersModule } from './modules/purchase-orders/purchase-orders.module';
import { AmlModule } from './modules/aml/aml.module';
import { ReceivingInspectionModule } from './modules/receiving-inspection/receiving-inspection.module';
import { AttachmentsModule } from './modules/attachments/attachments.module';
import { ReceivingModule } from './modules/receiving/receiving.module';
import { CycleCountModule } from './modules/cycle-count/cycle-count.module';
import { ProductionModule } from './modules/production/production.module';
import { KittingModule } from './modules/kitting/kitting.module';
import { ConsumableOrdersModule } from './modules/consumable-orders/consumable-orders.module';
import { SharedModule } from './modules/shared/shared.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      autoLoadEntities: true,
      synchronize: false,
    }),
    SharedModule, // Global shared services (SequenceGeneratorService)
    HealthModule, // Health checks - no dependencies
    AuditModule, // Global module - must be imported first so it's available to other modules
    AuthModule, // Authentication - must be before other protected modules
    MaterialsModule,
    ProductsModule,
    CustomersModule,
    BomModule,
    OrdersModule,
    InventoryModule,
    SuppliersModule,
    AmlModule, // Approved Manufacturer List - must be before ReceivingInspectionModule
    AttachmentsModule, // Entity-agnostic file attachments
    ReceivingInspectionModule, // Receiving inspection workflow
    ReceivingModule, // Operator-facing receiving sessions
    PurchaseOrdersModule,
    MrpModule,
    CycleCountModule, // Cycle counting / physical inventory
    ProductionModule, // WIP / production tracking
    KittingModule, // Kitting list management
    ConsumableOrdersModule, // Consumable purchase orders (solder paste, stencils, etc.)
  ],
})
export class AppModule {}
