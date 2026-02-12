import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { Customer } from '../../entities/customer.entity';
import { Material } from '../../entities/material.entity';
import { Product } from '../../entities/product.entity';
import { BomRevision, BomSource } from '../../entities/bom-revision.entity';
import { BomItem, ResourceType } from '../../entities/bom-item.entity';
import { Order, OrderType, OrderStatus } from '../../entities/order.entity';
import {
  InventoryTransaction,
  TransactionType,
  ReferenceType,
} from '../../entities/inventory-transaction.entity';

config();

// ============================================================================
// SEED DATA
// ============================================================================

const customers = [
  {
    name: 'TelcoBridge',
    code: 'TELCO',
    contact_person: 'John Smith',
    email: 'john.smith@telcobridge.com',
    phone: '555-0101',
    address: '123 Telecom Way, San Jose, CA 95134',
  },
  {
    name: 'Carma Industries',
    code: 'CARMA',
    contact_person: 'Sarah Johnson',
    email: 'sarah.j@carma-ind.com',
    phone: '555-0102',
    address: '456 Industrial Blvd, Austin, TX 78701',
  },
  {
    name: 'UgoWork',
    code: 'UGOWORK',
    contact_person: 'Michel Tremblay',
    email: 'michel@ugowork.ca',
    phone: '514-555-0103',
    address: '789 Innovation Dr, Montreal, QC H2X 1Y4',
  },
  {
    name: 'ISC Technologies',
    code: 'ISC',
    contact_person: 'David Chen',
    email: 'dchen@isc-tech.com',
    phone: '555-0104',
    address: '321 Circuit Ave, Portland, OR 97201',
  },
];

const materials = [
  // Capacitors
  {
    internal_part_number: 'C70201-0.1UF',
    description: 'Capacitor, Ceramic, 0.1uF, 25V, 0201',
    value: '0.1uF',
    package: '0201',
    manufacturer: 'Murata',
    manufacturer_pn: 'GRM033R71E104KE14D',
    uom: 'pcs',
  },
  {
    internal_part_number: 'C50402-4.7UF-6.3V',
    description: 'Capacitor, Ceramic, 4.7uF, 6.3V, 0402',
    value: '4.7uF',
    package: '0402',
    manufacturer: 'Samsung',
    manufacturer_pn: 'CL05A475KQ5NRNC',
    uom: 'pcs',
  },
  {
    internal_part_number: 'C50201-1UF-16V',
    description: 'Capacitor, Ceramic, 1uF, 16V, 0201',
    value: '1uF',
    package: '0201',
    manufacturer: 'Murata',
    manufacturer_pn: 'GRM033R61C105ME15D',
    uom: 'pcs',
  },
  {
    internal_part_number: 'CP0402-100PF',
    description: 'Capacitor, Ceramic, 100pF, 50V, 0402',
    value: '100pF',
    package: '0402',
    manufacturer: 'Yageo',
    manufacturer_pn: 'CC0402JRNPO9BN101',
    uom: 'pcs',
  },
  // Resistors
  {
    internal_part_number: 'R0402-10K',
    description: 'Resistor, 10K, 1%, 1/16W, 0402',
    value: '10K',
    package: '0402',
    manufacturer: 'Yageo',
    manufacturer_pn: 'RC0402FR-0710KL',
    uom: 'pcs',
  },
  {
    internal_part_number: 'R0201-49.9R',
    description: 'Resistor, 49.9R, 1%, 1/20W, 0201',
    value: '49.9R',
    package: '0201',
    manufacturer: 'Panasonic',
    manufacturer_pn: 'ERJ-1GEF49R9C',
    uom: 'pcs',
  },
  {
    internal_part_number: 'R0402-3K74',
    description: 'Resistor, 3.74K, 1%, 1/16W, 0402',
    value: '3K74',
    package: '0402',
    manufacturer: 'Stackpole',
    manufacturer_pn: 'RMCF0402FT3K74',
    uom: 'pcs',
  },
  {
    internal_part_number: 'R0402-0R',
    description: 'Resistor, 0 Ohm, Jumper, 0402',
    value: '0R',
    package: '0402',
    manufacturer: 'Yageo',
    manufacturer_pn: 'RC0402JR-070RL',
    uom: 'pcs',
  },
  // Inductors & Ferrites
  {
    internal_part_number: 'BLM15HG601SN1D',
    description: 'Ferrite Bead, 600R@100MHz, 0402',
    value: '600R',
    package: '0402',
    manufacturer: 'Murata',
    manufacturer_pn: 'BLM15HG601SN1D',
    uom: 'pcs',
  },
  // Transistors & ICs
  {
    internal_part_number: '2N7002',
    description: 'N-Channel MOSFET, 60V, 115mA, SOT-23',
    value: undefined,
    package: 'SOT-23',
    manufacturer: 'Nexperia',
    manufacturer_pn: '2N7002,215',
    uom: 'pcs',
  },
  {
    internal_part_number: 'STM32F407VGT6',
    description: 'MCU, ARM Cortex-M4, 168MHz, 1MB Flash, LQFP100',
    value: undefined,
    package: 'LQFP100',
    manufacturer: 'STMicroelectronics',
    manufacturer_pn: 'STM32F407VGT6',
    uom: 'pcs',
  },
  {
    internal_part_number: 'LM3940IT-3.3',
    description: 'LDO Regulator, 3.3V, 1A, TO-220',
    value: '3.3V',
    package: 'TO-220',
    manufacturer: 'Texas Instruments',
    manufacturer_pn: 'LM3940IT-3.3/NOPB',
    uom: 'pcs',
  },
  // Connectors
  {
    internal_part_number: 'OR4531',
    description: '164 Position Female Connector, PCI Express',
    value: undefined,
    package: 'TH',
    manufacturer: 'Samtec',
    manufacturer_pn: 'PCIE-164-02-F-D-TH',
    uom: 'pcs',
  },
  {
    internal_part_number: 'OR4532',
    description: '98 Position Female Connector, PCI Express',
    value: undefined,
    package: 'TH',
    manufacturer: 'Samtec',
    manufacturer_pn: 'PCIE-098-02-F-D-TH',
    uom: 'pcs',
  },
  {
    internal_part_number: 'USB-C-001',
    description: 'USB Type-C Receptacle, 24-Pin, SMD',
    value: undefined,
    package: 'SMD',
    manufacturer: 'Amphenol',
    manufacturer_pn: '12401610E4#2A',
    uom: 'pcs',
  },
  {
    internal_part_number: 'HDR-2X20-2.54',
    description: 'Pin Header, 2x20, 2.54mm Pitch',
    value: undefined,
    package: 'TH',
    manufacturer: 'Wurth',
    manufacturer_pn: '61304021121',
    uom: 'pcs',
  },
  // LEDs
  {
    internal_part_number: 'LED-GRN-0603',
    description: 'LED, Green, 0603, 2.0V, 20mA',
    value: 'GREEN',
    package: '0603',
    manufacturer: 'Lite-On',
    manufacturer_pn: 'LTST-C191KGKT',
    uom: 'pcs',
  },
  {
    internal_part_number: 'LED-RED-0603',
    description: 'LED, Red, 0603, 2.0V, 20mA',
    value: 'RED',
    package: '0603',
    manufacturer: 'Lite-On',
    manufacturer_pn: 'LTST-C191KRKT',
    uom: 'pcs',
  },
  // PCBs
  {
    internal_part_number: 'PCB-BROOKLYN-V1.3',
    description: 'PCB, Brooklyn Main Board, V1.3, 4-Layer',
    value: undefined,
    package: 'PCB',
    manufacturer: 'JLCPCB',
    manufacturer_pn: undefined,
    uom: 'pcs',
  },
  {
    internal_part_number: 'PCB-TELCO-90061',
    description: 'PCB, TelcoBridge Controller, Rev 2A, 6-Layer',
    value: undefined,
    package: 'PCB',
    manufacturer: 'PCBWay',
    manufacturer_pn: undefined,
    uom: 'pcs',
  },
];

// Products with their BOM data
const products = [
  {
    part_number: 'BB_BROOKLYN_V1_3',
    name: 'Brooklyn Main Board V1.3',
    description: 'Main controller board for Brooklyn product line',
    revisions: [
      {
        revision_number: 'A',
        revision_date: '2025-06-15',
        change_summary: 'Initial release',
        source: BomSource.MANUAL,
        is_active: false,
        items: [
          { material: 'PCB-BROOKLYN-V1.3', qty: 1, refs: 'PCB1', type: ResourceType.PCB },
          { material: 'C70201-0.1UF', qty: 85, refs: 'C1-C85', type: ResourceType.SMT },
          { material: 'R0402-10K', qty: 100, refs: 'R1-R100', type: ResourceType.SMT },
          { material: 'STM32F407VGT6', qty: 1, refs: 'U1', type: ResourceType.SMT },
          { material: 'LED-GRN-0603', qty: 4, refs: 'D1-D4', type: ResourceType.SMT },
        ],
      },
      {
        revision_number: 'B',
        revision_date: '2025-09-20',
        change_summary: 'Added more decoupling caps, updated resistor values',
        source: BomSource.MANUAL,
        is_active: true,
        items: [
          { material: 'PCB-BROOKLYN-V1.3', qty: 1, refs: 'PCB1', type: ResourceType.PCB },
          { material: 'C70201-0.1UF', qty: 110, refs: 'C1-C110', type: ResourceType.SMT, scrap: 2 },
          { material: 'C50402-4.7UF-6.3V', qty: 24, refs: 'C111-C134', type: ResourceType.SMT },
          { material: 'R0402-10K', qty: 134, refs: 'R1-R134', type: ResourceType.SMT, scrap: 2 },
          { material: 'R0402-3K74', qty: 12, refs: 'R135-R146', type: ResourceType.SMT },
          { material: 'STM32F407VGT6', qty: 1, refs: 'U1', type: ResourceType.SMT },
          { material: 'LM3940IT-3.3', qty: 2, refs: 'U2,U3', type: ResourceType.TH },
          { material: 'OR4531', qty: 1, refs: 'J1', type: ResourceType.TH, polarized: true },
          { material: 'OR4532', qty: 1, refs: 'J2', type: ResourceType.TH, polarized: true },
          { material: 'LED-GRN-0603', qty: 4, refs: 'D1-D4', type: ResourceType.SMT },
          { material: 'LED-RED-0603', qty: 2, refs: 'D5,D6', type: ResourceType.SMT },
          { material: 'BLM15HG601SN1D', qty: 8, refs: 'FB1-FB8', type: ResourceType.SMT },
        ],
      },
    ],
  },
  {
    part_number: '2015-90061-2A',
    name: 'TelcoBridge Controller Board Rev 2A',
    description: 'Network controller for TelcoBridge infrastructure',
    revisions: [
      {
        revision_number: '2A',
        revision_date: '2025-08-01',
        change_summary: 'Production release',
        source: BomSource.IMPORT_CLIENT,
        source_filename: 'TelcoBridge_BOM_2A.xlsx',
        is_active: true,
        items: [
          { material: 'PCB-TELCO-90061', qty: 1, refs: 'PCB1', type: ResourceType.PCB },
          { material: 'C70201-0.1UF', qty: 200, refs: 'C1-C200', type: ResourceType.SMT, scrap: 3 },
          { material: 'C50201-1UF-16V', qty: 50, refs: 'C201-C250', type: ResourceType.SMT },
          { material: 'R0402-10K', qty: 75, refs: 'R1-R75', type: ResourceType.SMT },
          { material: 'R0201-49.9R', qty: 24, refs: 'R76-R99', type: ResourceType.SMT },
          { material: '2N7002', qty: 8, refs: 'Q1-Q8', type: ResourceType.SMT },
          { material: 'USB-C-001', qty: 2, refs: 'J1,J2', type: ResourceType.SMT },
          { material: 'HDR-2X20-2.54', qty: 1, refs: 'J3', type: ResourceType.TH },
          { material: 'LED-GRN-0603', qty: 8, refs: 'D1-D8', type: ResourceType.SMT },
        ],
      },
    ],
  },
  {
    part_number: '2100-0072-1-P',
    name: 'ISC Controller CFG: A',
    description: 'Industrial controller for ISC product line',
    revisions: [
      {
        revision_number: '1.0',
        revision_date: '2025-07-10',
        change_summary: 'Initial production release',
        source: BomSource.MANUAL,
        is_active: true,
        items: [
          { material: 'C70201-0.1UF', qty: 64, refs: 'C1-C64', type: ResourceType.SMT },
          { material: 'C50402-4.7UF-6.3V', qty: 16, refs: 'C65-C80', type: ResourceType.SMT },
          { material: 'CP0402-100PF', qty: 8, refs: 'C81-C88', type: ResourceType.SMT },
          { material: 'R0402-10K', qty: 48, refs: 'R1-R48', type: ResourceType.SMT },
          { material: 'R0402-0R', qty: 6, refs: 'R49-R54', type: ResourceType.SMT },
          { material: 'STM32F407VGT6', qty: 1, refs: 'U1', type: ResourceType.SMT },
          { material: 'BLM15HG601SN1D', qty: 4, refs: 'FB1-FB4', type: ResourceType.SMT },
          { material: 'LED-GRN-0603', qty: 2, refs: 'D1,D2', type: ResourceType.SMT },
          { material: 'LED-RED-0603', qty: 1, refs: 'D3', type: ResourceType.SMT },
        ],
      },
    ],
  },
  {
    part_number: 'UGO-PWR-100',
    name: 'UgoWork Power Module',
    description: 'Power management module for UgoWork battery systems',
    revisions: [
      {
        revision_number: 'A',
        revision_date: '2025-05-01',
        change_summary: 'Initial design',
        source: BomSource.MANUAL,
        is_active: true,
        items: [
          { material: 'C50402-4.7UF-6.3V', qty: 32, refs: 'C1-C32', type: ResourceType.SMT },
          { material: 'C70201-0.1UF', qty: 48, refs: 'C33-C80', type: ResourceType.SMT },
          { material: 'R0402-10K', qty: 24, refs: 'R1-R24', type: ResourceType.SMT },
          { material: 'LM3940IT-3.3', qty: 4, refs: 'U1-U4', type: ResourceType.TH },
          { material: '2N7002', qty: 12, refs: 'Q1-Q12', type: ResourceType.SMT },
          { material: 'LED-GRN-0603', qty: 4, refs: 'D1-D4', type: ResourceType.SMT },
        ],
      },
    ],
  },
];

// Initial inventory (quantity on hand for each material)
const initialInventory: Record<string, number> = {
  'C70201-0.1UF': 5000,
  'C50402-4.7UF-6.3V': 3000,
  'C50201-1UF-16V': 2500,
  'CP0402-100PF': 1500,
  'R0402-10K': 8000,
  'R0201-49.9R': 2000,
  'R0402-3K74': 1000,
  'R0402-0R': 3000,
  'BLM15HG601SN1D': 1200,
  '2N7002': 800,
  'STM32F407VGT6': 50,
  'LM3940IT-3.3': 200,
  'OR4531': 25,
  'OR4532': 30,
  'USB-C-001': 150,
  'HDR-2X20-2.54': 100,
  'LED-GRN-0603': 2000,
  'LED-RED-0603': 1500,
  'PCB-BROOKLYN-V1.3': 75,
  'PCB-TELCO-90061': 40,
};

// ============================================================================
// MAIN SEED FUNCTION
// ============================================================================

async function seed() {
  console.log('Starting seed process...\n');

  const dataSource = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    entities: [
      Customer,
      Material,
      Product,
      BomRevision,
      BomItem,
      Order,
      InventoryTransaction,
    ],
    synchronize: false,
  });

  await dataSource.initialize();
  console.log('Database connected.\n');

  const customerRepo = dataSource.getRepository(Customer);
  const materialRepo = dataSource.getRepository(Material);
  const productRepo = dataSource.getRepository(Product);
  const bomRevisionRepo = dataSource.getRepository(BomRevision);
  const bomItemRepo = dataSource.getRepository(BomItem);
  const orderRepo = dataSource.getRepository(Order);
  const inventoryRepo = dataSource.getRepository(InventoryTransaction);

  // Maps to store created entities for relationships
  const customerMap = new Map<string, Customer>();
  const materialMap = new Map<string, Material>();
  const productMap = new Map<string, Product>();
  const revisionMap = new Map<string, BomRevision>();

  // ----------------------------------------
  // 1. SEED CUSTOMERS
  // ----------------------------------------
  console.log('Seeding customers...');
  for (const data of customers) {
    let customer = await customerRepo.findOne({ where: { name: data.name } });
    if (!customer) {
      customer = customerRepo.create(data);
      customer = await customerRepo.save(customer);
      console.log(`  Created customer: ${customer.name}`);
    } else {
      console.log(`  Skipped (exists): ${customer.name}`);
    }
    customerMap.set(customer.name, customer);
  }
  console.log(`  Total: ${customerMap.size} customers\n`);

  // ----------------------------------------
  // 2. SEED MATERIALS
  // ----------------------------------------
  console.log('Seeding materials...');
  for (const data of materials) {
    let material = await materialRepo.findOne({
      where: { internal_part_number: data.internal_part_number },
    });
    if (!material) {
      material = materialRepo.create(data);
      material = await materialRepo.save(material);
      console.log(`  Created material: ${material.internal_part_number}`);
    } else {
      console.log(`  Skipped (exists): ${material.internal_part_number}`);
    }
    materialMap.set(material.internal_part_number, material);
  }
  console.log(`  Total: ${materialMap.size} materials\n`);

  // ----------------------------------------
  // 3. SEED PRODUCTS WITH BOM REVISIONS
  // ----------------------------------------
  console.log('Seeding products and BOM revisions...');
  for (const productData of products) {
    let product = await productRepo.findOne({
      where: { part_number: productData.part_number },
    });

    if (!product) {
      product = productRepo.create({
        part_number: productData.part_number,
        name: productData.name,
        description: productData.description,
      });
      product = await productRepo.save(product);
      console.log(`  Created product: ${product.part_number}`);
    } else {
      console.log(`  Skipped product (exists): ${product.part_number}`);
    }
    productMap.set(product.part_number, product);

    // Create BOM revisions for this product
    for (const revData of productData.revisions) {
      let revision = await bomRevisionRepo.findOne({
        where: {
          product_id: product.id,
          revision_number: revData.revision_number,
        },
      });

      if (!revision) {
        revision = bomRevisionRepo.create({
          product_id: product.id,
          revision_number: revData.revision_number,
          revision_date: new Date(revData.revision_date),
          change_summary: revData.change_summary,
          source: revData.source,
          source_filename: (revData as any).source_filename ?? null,
          is_active: revData.is_active,
        });
        revision = await bomRevisionRepo.save(revision);
        console.log(`    Created revision: ${revData.revision_number}`);

        // Create BOM items
        let lineNumber = 1;
        for (const itemData of revData.items) {
          const material = materialMap.get(itemData.material);
          if (!material) {
            console.log(`    WARNING: Material not found: ${itemData.material}`);
            continue;
          }

          const bomItem = bomItemRepo.create({
            bom_revision_id: revision.id,
            material_id: material.id,
            bom_line_key: material.id, // Use material_id as default key
            line_number: lineNumber++,
            quantity_required: itemData.qty,
            reference_designators: itemData.refs,
            resource_type: itemData.type,
            polarized: (itemData as any).polarized ?? false,
            scrap_factor: (itemData as any).scrap ?? 0,
          });
          await bomItemRepo.save(bomItem);
        }
        console.log(`      Added ${revData.items.length} BOM items`);

        // Update product's active revision
        if (revData.is_active) {
          product.active_bom_revision_id = revision.id;
          await productRepo.save(product);
        }
      } else {
        console.log(`    Skipped revision (exists): ${revData.revision_number}`);
      }

      revisionMap.set(`${product.part_number}:${revData.revision_number}`, revision);
    }
  }
  console.log(`  Total: ${productMap.size} products\n`);

  // ----------------------------------------
  // 4. SEED INVENTORY TRANSACTIONS
  // ----------------------------------------
  console.log('Seeding initial inventory...');
  for (const [partNumber, quantity] of Object.entries(initialInventory)) {
    const material = materialMap.get(partNumber);
    if (!material) {
      console.log(`  WARNING: Material not found: ${partNumber}`);
      continue;
    }

    // Check if we already have transactions for this material
    const existingTx = await inventoryRepo.findOne({
      where: { material_id: material.id },
    });

    if (!existingTx) {
      const transaction = inventoryRepo.create({
        material_id: material.id,
        transaction_type: TransactionType.ADJUSTMENT,
        quantity: quantity,
        reference_type: ReferenceType.INITIAL_STOCK,
        reason: 'Initial inventory seed',
        created_by: 'SEED_SCRIPT',
      });
      await inventoryRepo.save(transaction);
      console.log(`  Set stock: ${partNumber} = ${quantity}`);
    } else {
      console.log(`  Skipped (has transactions): ${partNumber}`);
    }
  }
  console.log('');

  // ----------------------------------------
  // 5. SEED SAMPLE ORDERS
  // ----------------------------------------
  console.log('Seeding sample orders...');

  const sampleOrders = [
    {
      customer: 'TelcoBridge',
      product: '2015-90061-2A',
      po_number: 'PO-2500583',
      wo_number: 'BX20-583',
      quantity: 20,
      due_date: '2026-02-15',
      status: OrderStatus.KITTING,
    },
    {
      customer: 'ISC Technologies',
      product: '2100-0072-1-P',
      po_number: 'P17771',
      quantity: 160,
      due_date: '2026-01-25',
      status: OrderStatus.SMT,
    },
    {
      customer: 'UgoWork',
      product: 'UGO-PWR-100',
      po_number: 'PO08623',
      quantity: 150,
      due_date: '2026-03-01',
      status: OrderStatus.ENTERED,
    },
    {
      customer: 'TelcoBridge',
      product: 'BB_BROOKLYN_V1_3',
      po_number: 'PO-2500601',
      quantity: 50,
      due_date: '2026-02-28',
      status: OrderStatus.ENTERED,
    },
    {
      customer: 'Carma Industries',
      product: 'BB_BROOKLYN_V1_3',
      po_number: 'CARMA-2026-001',
      quantity: 25,
      due_date: '2026-01-20',
      status: OrderStatus.KITTING,
    },
  ];

  for (const orderData of sampleOrders) {
    const customer = customerMap.get(orderData.customer);
    const product = productMap.get(orderData.product);

    if (!customer || !product) {
      console.log(`  WARNING: Missing customer or product for order`);
      continue;
    }

    // Check if order with same PO number exists
    const existingOrder = await orderRepo.findOne({
      where: { po_number: orderData.po_number },
    });

    if (!existingOrder) {
      // Get active BOM revision for product
      const revision = await bomRevisionRepo.findOne({
        where: { product_id: product.id, is_active: true },
      });

      if (!revision) {
        console.log(`  WARNING: No active BOM for ${product.part_number}`);
        continue;
      }

      // Generate order number
      const date = new Date();
      const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
      const count = await orderRepo.count();
      const orderNumber = `ORD-${dateStr}-${String(count + 1).padStart(4, '0')}`;

      const order = orderRepo.create({
        order_number: orderNumber,
        po_number: orderData.po_number,
        wo_number: (orderData as any).wo_number ?? null,
        customer_id: customer.id,
        product_id: product.id,
        bom_revision_id: revision.id,
        quantity: orderData.quantity,
        quantity_shipped: 0,
        due_date: new Date(orderData.due_date),
        order_type: OrderType.TURNKEY,
        status: orderData.status,
      });
      await orderRepo.save(order);
      console.log(`  Created order: ${orderNumber} (${orderData.po_number})`);
    } else {
      console.log(`  Skipped (exists): PO ${orderData.po_number}`);
    }
  }

  console.log('\n========================================');
  console.log('Seed completed successfully!');
  console.log('========================================\n');

  console.log('Summary:');
  console.log(`  - Customers: ${customerMap.size}`);
  console.log(`  - Materials: ${materialMap.size}`);
  console.log(`  - Products: ${productMap.size}`);
  console.log(`  - Orders: ${sampleOrders.length}`);
  console.log('');

  await dataSource.destroy();
}

// Run seed
seed().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
