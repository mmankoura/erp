import 'dotenv/config';
import { DataSource } from 'typeorm';
import { Material } from '../entities/material.entity';
import { Product } from '../entities/product.entity';
import { Customer } from '../entities/customer.entity';
import { BomRevision } from '../entities/bom-revision.entity';
import { BomItem } from '../entities/bom-item.entity';
import { BomItemAlternate } from '../entities/bom-item-alternate.entity';
import { Order } from '../entities/order.entity';

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [Material, Product, Customer, BomRevision, BomItem, BomItemAlternate, Order],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  synchronize: false,
});
