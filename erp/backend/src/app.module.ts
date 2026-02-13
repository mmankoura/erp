import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import 'dotenv/config';
import { HealthModule } from './modules/health/health.module';
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
import { CycleCountModule } from './modules/cycle-count/cycle-count.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      autoLoadEntities: true,
      synchronize: false,
    }),
    HealthModule, // Health checks - no dependencies
    AuditModule, // Global module - must be imported first so it's available to other modules
    MaterialsModule,
    ProductsModule,
    CustomersModule,
    BomModule,
    OrdersModule,
    InventoryModule,
    SuppliersModule,
    AmlModule, // Approved Manufacturer List - must be before ReceivingInspectionModule
    ReceivingInspectionModule, // Receiving inspection workflow
    PurchaseOrdersModule,
    MrpModule,
    CycleCountModule, // Cycle counting / physical inventory
  ],
})
export class AppModule {}
