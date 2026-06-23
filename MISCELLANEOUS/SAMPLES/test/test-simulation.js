/**
 * ERP Test Simulation Script
 *
 * This script simulates a full ERP workflow:
 * 1. Import inventory from INVENTORY.xlsm
 * 2. Create products for each BOM
 * 3. Import BOM items from Excel files
 * 4. Create orders with specified quantities
 * 5. Allocate materials to orders
 * 6. Generate shortage report
 */

const XLSX = require('xlsx');
const path = require('path');

const API_BASE = 'http://localhost:3002/api';

// Order configuration
const ORDERS = [
  { bomFile: 'AEGIS_BOM_ATS9353_V1_4B_0800313_2024-04-30.xlsx', productCode: 'ATS9353', qty: 120, revision: 'V1.4B' },
  { bomFile: 'AEGIS_BOM_ATS9352 (SAPIN) V1_4E_0800312_2024-04-15.xlsx', productCode: 'ATS9352', qty: 110, revision: 'V1.4E' },
  { bomFile: 'BOM_ATST364_MERENGUE_V1_1A_0800341_Final_2024-05-27.xlsx', productCode: 'ATST364', qty: 50, revision: 'V1.1A' },
  { bomFile: 'BOM_FENCE_ATS9120_V1_3A_0800231_2019-04-16_1435.xlsx', productCode: 'ATS9120', qty: 50, revision: 'V1.3A' },
];

const TEST_DIR = 'C:/Users/mark.mankoura/Documents/projects/erp/SAMPLES/test';

async function apiCall(method, endpoint, body = null) {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) options.body = JSON.stringify(body);

  const response = await fetch(`${API_BASE}${endpoint}`, options);
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`API Error ${response.status}: ${text}`);
  }

  return text ? JSON.parse(text) : null;
}

async function getOrCreateCustomer() {
  // Check if test customer exists
  const customers = await apiCall('GET', '/customers');
  let customer = customers.find(c => c.code === 'AEGIS');

  if (!customer) {
    console.log('Creating test customer: Aegis Industries');
    customer = await apiCall('POST', '/customers', {
      name: 'Aegis Industries',
      code: 'AEGIS',
      contact_person: 'Test User',
      email: 'test@aegis.com',
      phone: '555-0001',
      address: '123 Test St',
    });
  }

  return customer;
}

async function importInventory() {
  console.log('\n========================================');
  console.log('STEP 1: IMPORTING INVENTORY');
  console.log('========================================\n');

  const invPath = path.join(TEST_DIR, 'INVENTORY.xlsm');
  const workbook = XLSX.readFile(invPath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  // Skip header row
  const rows = data.slice(1).filter(row => row[1]); // Filter rows with IPN

  console.log(`Found ${rows.length} inventory rows to process`);

  let created = 0, updated = 0, errors = 0;
  const materialMap = new Map(); // IPN -> material

  // Get existing materials
  const existingMaterials = await apiCall('GET', '/materials');
  for (const mat of existingMaterials) {
    materialMap.set(mat.internal_part_number, mat);
  }

  console.log(`Existing materials in system: ${materialMap.size}`);

  for (const row of rows) {
    const uid = row[0];
    const ipn = String(row[1]).trim();
    const qty = parseFloat(row[2]) || 0;
    const pkg = row[4] ? String(row[4]).trim() : null;

    if (!ipn || qty <= 0) continue;

    try {
      // Create material if doesn't exist
      if (!materialMap.has(ipn)) {
        const material = await apiCall('POST', '/materials', {
          internal_part_number: ipn,
          description: `Imported from inventory (UID: ${uid})`,
          package: pkg,
          uom: 'pcs',
        });
        materialMap.set(ipn, material);
        created++;
      }

      // Record inventory receipt
      const material = materialMap.get(ipn);
      await apiCall('POST', '/inventory/transaction', {
        material_id: material.id,
        quantity: qty,
        transaction_type: 'RECEIPT',
        reference_type: 'MANUAL',
        reference_number: `INV-IMPORT-${uid}`,
        notes: `Imported from INVENTORY.xlsm`,
      });
      updated++;

    } catch (err) {
      errors++;
      if (errors <= 5) {
        console.log(`  Error processing ${ipn}: ${err.message}`);
      }
    }
  }

  console.log(`\nInventory import complete:`);
  console.log(`  Materials created: ${created}`);
  console.log(`  Stock transactions: ${updated}`);
  console.log(`  Errors: ${errors}`);

  return materialMap;
}

async function parseBomFile(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  // Find header row and column indices
  const headers = data[0];
  const qtyIdx = headers.findIndex(h => h && h.toLowerCase().includes('quantity'));
  const refIdx = headers.findIndex(h => h && h.toLowerCase().includes('reference'));
  const partIdx = headers.findIndex(h => h && h.toLowerCase().includes('part'));
  const ipnIdx = headers.findIndex(h => h && (h.toLowerCase().includes('alazar') || h.toLowerCase().includes('p/n')));
  const resourceIdx = headers.findIndex(h => h && h.toLowerCase().includes('resource'));

  const items = [];
  let currentItem = null;

  for (let i = 1; i < data.length; i++) {
    const row = data[i];

    // New item row (has Item number in column 0)
    if (row[0] !== null && row[0] !== undefined && row[0] !== '') {
      if (currentItem && currentItem.ipn) {
        items.push(currentItem);
      }

      currentItem = {
        lineNumber: row[0],
        quantity: parseFloat(row[qtyIdx]) || 0,
        reference: row[refIdx] ? String(row[refIdx]).trim() : '',
        part: row[partIdx] ? String(row[partIdx]).trim() : '',
        ipn: row[ipnIdx] ? String(row[ipnIdx]).trim() : '',
        resourceType: row[resourceIdx] ? String(row[resourceIdx]).trim() : 'SMT',
      };
    } else if (currentItem && row[refIdx]) {
      // Continuation row (merged reference cells)
      currentItem.reference += String(row[refIdx]).trim();
    }
  }

  // Don't forget last item
  if (currentItem && currentItem.ipn) {
    items.push(currentItem);
  }

  return items.filter(item => item.quantity > 0 && item.ipn);
}

async function createProductAndBom(orderConfig, materialMap) {
  const { bomFile, productCode, revision } = orderConfig;

  console.log(`\nCreating product: ${productCode}`);

  // Check if product exists
  const products = await apiCall('GET', '/products');
  let product = products.find(p => p.part_number === productCode);

  if (!product) {
    product = await apiCall('POST', '/products', {
      part_number: productCode,
      name: `${productCode} Assembly`,
      description: `Imported from ${bomFile}`,
    });
    console.log(`  Created product: ${product.id}`);
  } else {
    console.log(`  Product exists: ${product.id}`);
  }

  // Parse BOM file
  const bomPath = path.join(TEST_DIR, bomFile);
  const bomItems = await parseBomFile(bomPath);
  console.log(`  Parsed ${bomItems.length} BOM items from file`);

  // Create BOM revision
  const bomRevision = await apiCall('POST', '/bom/revisions', {
    product_id: product.id,
    revision_number: revision,
    source: 'IMPORT_CLIENT',
    source_filename: bomFile,
    change_summary: `Imported from ${bomFile}`,
  });
  console.log(`  Created BOM revision: ${bomRevision.id}`);

  // Add BOM items
  let itemsCreated = 0;
  let itemsSkipped = 0;

  for (const item of bomItems) {
    // Find or create material
    let material = materialMap.get(item.ipn);

    if (!material) {
      // Create material
      try {
        material = await apiCall('POST', '/materials', {
          internal_part_number: item.ipn,
          description: item.part,
          uom: 'pcs',
        });
        materialMap.set(item.ipn, material);
      } catch (err) {
        // Material might already exist with different case
        const materials = await apiCall('GET', '/materials');
        material = materials.find(m => m.internal_part_number.toLowerCase() === item.ipn.toLowerCase());
        if (material) {
          materialMap.set(item.ipn, material);
        }
      }
    }

    if (!material) {
      itemsSkipped++;
      continue;
    }

    try {
      await apiCall('POST', `/bom/revisions/${bomRevision.id}/items`, {
        material_id: material.id,
        quantity: item.quantity,
        reference_designator: item.reference,
        resource_type: item.resourceType.toUpperCase() === 'PCB' ? 'PCB' : 'SMT',
        bom_line_key: `${productCode}-${item.lineNumber}`,
      });
      itemsCreated++;
    } catch (err) {
      itemsSkipped++;
    }
  }

  console.log(`  BOM items created: ${itemsCreated}, skipped: ${itemsSkipped}`);

  // Activate this revision
  await apiCall('POST', `/bom/revisions/${bomRevision.id}/activate`);
  console.log(`  Activated revision ${revision}`);

  return { product, bomRevision };
}

async function createOrder(orderConfig, product, bomRevision, customer) {
  const { productCode, qty } = orderConfig;

  console.log(`\nCreating order for ${productCode}, qty: ${qty}`);

  const order = await apiCall('POST', '/orders', {
    po_number: `PO-${productCode}-${Date.now()}`,
    customer_id: customer.id,
    product_id: product.id,
    bom_revision_id: bomRevision.id,
    quantity: qty,
    order_type: 'TURNKEY',
    due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days out
  });

  console.log(`  Created order: ${order.order_number}`);

  return order;
}

async function allocateMaterials(order) {
  console.log(`\nAllocating materials for order: ${order.order_number}`);

  try {
    const result = await apiCall('POST', `/inventory/allocate/${order.id}`);
    console.log(`  Allocation result: ${JSON.stringify(result)}`);
    return result;
  } catch (err) {
    console.log(`  Allocation failed: ${err.message}`);
    return null;
  }
}

async function generateShortageReport(orders) {
  console.log('\n========================================');
  console.log('SHORTAGE REPORT');
  console.log('========================================\n');

  // Get shortages from MRP
  const shortages = await apiCall('GET', '/mrp/shortages');

  if (shortages.length === 0) {
    console.log('No shortages detected! All materials are available.');
    return;
  }

  console.log(`Found ${shortages.length} materials with shortages:\n`);

  // Sort by shortage quantity (descending)
  shortages.sort((a, b) => b.shortage - a.shortage);

  console.log('IPN                          | Required | Available | Shortage');
  console.log('-'.repeat(70));

  let totalShortage = 0;
  for (const item of shortages) {
    const ipn = (item.internal_part_number || item.ipn || 'Unknown').padEnd(28);
    const required = String(item.required || item.quantity_required || 0).padStart(8);
    const available = String(item.available || item.quantity_available || 0).padStart(9);
    const shortage = String(item.shortage || item.quantity_short || 0).padStart(8);

    console.log(`${ipn} | ${required} | ${available} | ${shortage}`);
    totalShortage += (item.shortage || item.quantity_short || 0);
  }

  console.log('-'.repeat(70));
  console.log(`Total shortage items: ${shortages.length}`);
  console.log(`Total shortage quantity: ${totalShortage}`);

  // Per-order availability
  console.log('\n\nPER-ORDER AVAILABILITY:');
  console.log('========================================\n');

  for (const order of orders) {
    try {
      const availability = await apiCall('GET', `/mrp/order/${order.id}/availability`);
      console.log(`\nOrder: ${order.order_number} (${order.quantity} units)`);
      console.log(`  Can build: ${availability.can_build || 0} units`);
      console.log(`  Shortages: ${availability.shortages?.length || 0} materials`);

      if (availability.shortages && availability.shortages.length > 0) {
        console.log('  Top shortages:');
        for (const s of availability.shortages.slice(0, 5)) {
          console.log(`    - ${s.internal_part_number}: need ${s.required}, have ${s.available}, short ${s.shortage}`);
        }
      }
    } catch (err) {
      console.log(`  Error checking availability: ${err.message}`);
    }
  }
}

async function main() {
  console.log('========================================');
  console.log('ERP TEST SIMULATION');
  console.log('========================================');
  console.log('Starting simulation at:', new Date().toISOString());
  console.log('');

  try {
    // Step 0: Get or create customer
    const customer = await getOrCreateCustomer();
    console.log(`Using customer: ${customer.name} (${customer.code})`);

    // Step 1: Import inventory
    const materialMap = await importInventory();

    // Step 2 & 3: Create products and import BOMs
    console.log('\n========================================');
    console.log('STEP 2 & 3: CREATING PRODUCTS AND BOMs');
    console.log('========================================');

    const productData = [];
    for (const orderConfig of ORDERS) {
      const { product, bomRevision } = await createProductAndBom(orderConfig, materialMap);
      productData.push({ orderConfig, product, bomRevision });
    }

    // Step 4: Create orders
    console.log('\n========================================');
    console.log('STEP 4: CREATING ORDERS');
    console.log('========================================');

    const orders = [];
    for (const { orderConfig, product, bomRevision } of productData) {
      const order = await createOrder(orderConfig, product, bomRevision, customer);
      orders.push(order);
    }

    // Step 5: Allocate materials
    console.log('\n========================================');
    console.log('STEP 5: ALLOCATING MATERIALS');
    console.log('========================================');

    for (const order of orders) {
      await allocateMaterials(order);
    }

    // Step 6: Generate shortage report
    await generateShortageReport(orders);

    console.log('\n========================================');
    console.log('SIMULATION COMPLETE');
    console.log('========================================');
    console.log('Completed at:', new Date().toISOString());

  } catch (err) {
    console.error('\nSimulation failed:', err);
    process.exit(1);
  }
}

main();
