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

const TEST_DIR = '../../SAMPLES/test';

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
  let customer = customers.find(c => c.code === 'AS');

  if (!customer) {
    console.log('Creating customer: Alazar Tech');
    customer = await apiCall('POST', '/customers', {
      name: 'Alazar Tech',
      code: 'AS',
    });
  }

  return customer;
}

// Helper to convert Excel serial date to ISO date string
function excelDateToISO(serial) {
  if (!serial || typeof serial !== 'number') return null;
  // Excel dates start from 1900-01-01 (serial 1)
  // But Excel incorrectly treats 1900 as a leap year, so subtract 1 for dates after Feb 28, 1900
  const utcDays = Math.floor(serial - 25569); // 25569 = days from 1900-01-01 to 1970-01-01
  const date = new Date(utcDays * 86400 * 1000);
  return date.toISOString().split('T')[0];
}

async function importInventory(customerId) {
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

  let materialsCreated = 0;
  const materialMap = new Map(); // IPN -> material

  // Get existing materials
  const existingMaterials = await apiCall('GET', '/materials');
  for (const mat of existingMaterials) {
    materialMap.set(mat.internal_part_number, mat);
  }

  console.log(`Existing materials in system: ${materialMap.size}`);

  // First pass: create all materials that don't exist
  const uniqueIpns = [...new Set(rows.map(row => String(row[1]).trim()).filter(Boolean))];
  console.log(`Unique IPNs in inventory: ${uniqueIpns.length}`);

  for (const ipn of uniqueIpns) {
    if (!materialMap.has(ipn)) {
      try {
        const material = await apiCall('POST', '/materials', {
          customer_id: customerId,
          internal_part_number: ipn,
          uom: 'pcs',
        });
        materialMap.set(ipn, material);
        materialsCreated++;
      } catch (err) {
        console.log(`  Error creating material ${ipn}: ${err.message}`);
      }
    }
  }

  console.log(`Materials created: ${materialsCreated}`);

  // Second pass: build inventory import items with lot tracking
  // Use a Map to handle duplicate UIDs (keep last occurrence)
  const importItemsMap = new Map();
  for (const row of rows) {
    const uid = String(row[0]);
    const ipn = String(row[1]).trim();
    const initialQty = parseFloat(row[2]) || 0;
    const currentQty = parseFloat(row[3]) || initialQty; // Use current qty if available
    const pkg = row[4] ? String(row[4]).trim().toUpperCase() : 'OTHER';
    const woRef = row[5] ? String(row[5]) : null;
    const receivedDate = excelDateToISO(row[6]);

    if (!ipn || currentQty <= 0) continue;

    const material = materialMap.get(ipn);
    if (!material) {
      continue; // Skip silently, material will be created during BOM import if needed
    }

    // Map package type to valid enum
    let packageType = 'OTHER';
    if (pkg === 'TR' || pkg === 'TAPE') packageType = 'TR';
    else if (pkg === 'REEL') packageType = 'REEL';
    else if (pkg === 'TUBE') packageType = 'TUBE';
    else if (pkg === 'TRAY') packageType = 'TRAY';
    else if (pkg === 'BAG') packageType = 'BAG';
    else if (pkg === 'BOX') packageType = 'BOX';
    else if (pkg === 'BULK') packageType = 'BULK';

    // Overwrite any previous entry with same UID (keeps last occurrence)
    importItemsMap.set(uid, {
      uid: uid,
      ipn: ipn,
      quantity: currentQty,
      package_type: packageType,
      po_reference: woRef,
      material_id: material.id,
      material_matched: true,
    });
  }

  const importItems = Array.from(importItemsMap.values());
  console.log(`Prepared ${importItems.length} unique inventory lots for import`);

  // Commit inventory import with lot tracking
  try {
    const result = await apiCall('POST', '/inventory/import/commit', {
      items: importItems,
      source_filename: 'INVENTORY.xlsm',
      created_by: 'test-simulation',
      owner_type: 'CUSTOMER',
      owner_id: customerId,
    });

    console.log(`\nInventory import complete:`);
    console.log(`  Lots created: ${result.lots_created}`);
    console.log(`  Transactions created: ${result.transactions_created}`);
    console.log(`  Total quantity: ${result.total_quantity.toLocaleString()}`);
    if (result.created_materials?.length > 0) {
      console.log(`  New materials created: ${result.created_materials.length}`);
    }
  } catch (err) {
    console.log(`  Inventory import failed: ${err.message}`);
  }

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

  // Filter out DNP (Do Not Populate) entries and items without valid IPN/quantity
  return items.filter(item => {
    if (!item.ipn || item.quantity <= 0) return false;
    const ipnLower = item.ipn.toLowerCase();
    if (ipnLower.includes('do not populate') || ipnLower === 'dnp' || ipnLower === 'n/a') return false;
    return true;
  });
}

async function createProductAndBom(orderConfig, materialMap, customerId) {
  const { bomFile, productCode, revision } = orderConfig;

  console.log(`\nCreating product: ${productCode}`);

  // Check if product exists
  const products = await apiCall('GET', '/products');
  let product = products.find(p => p.part_number === productCode);

  if (!product) {
    product = await apiCall('POST', '/products', {
      customer_id: customerId,
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

  // Check for existing revision
  const existingRevisions = await apiCall('GET', `/bom/product/${product.id}`);
  let bomRevision = existingRevisions.find(r => r.revision_number === revision);

  if (bomRevision) {
    console.log(`  Revision ${revision} already exists: ${bomRevision.id}`);
    // Return early - already processed
    return { product, bomRevision };
  }

  // Create BOM revision
  bomRevision = await apiCall('POST', '/bom/revision', {
    product_id: product.id,
    revision_number: revision,
    revision_date: new Date().toISOString().split('T')[0],
    source: 'IMPORT_CLIENT',
    source_filename: bomFile,
    change_summary: `Imported from ${bomFile}`,
  });
  console.log(`  Created BOM revision: ${bomRevision.id}`);

  // Add BOM items
  let itemsCreated = 0;
  let itemsSkipped = 0;

  for (const item of bomItems) {
    // Ensure IPN is a string
    const ipn = String(item.ipn).trim();

    // Find or create material
    let material = materialMap.get(ipn);

    if (!material) {
      // Create material
      try {
        material = await apiCall('POST', '/materials', {
          customer_id: customerId,
          internal_part_number: ipn,
          description: item.part,
          uom: 'pcs',
        });
        materialMap.set(ipn, material);
      } catch (err) {
        // Material might already exist with different case or already created
        const materials = await apiCall('GET', '/materials');
        material = materials.find(m => m.internal_part_number === ipn || m.internal_part_number.toLowerCase() === ipn.toLowerCase());
        if (material) {
          materialMap.set(ipn, material);
        }
      }
    }

    if (!material) {
      if (itemsSkipped < 3) {
        console.log(`    Material not found/created: ${ipn}`);
      }
      itemsSkipped++;
      continue;
    }

    try {
      await apiCall('POST', `/bom/revision/${bomRevision.id}/items`, {
        material_id: material.id,
        quantity_required: item.quantity,
        reference_designators: item.reference,
        resource_type: item.resourceType?.toUpperCase() === 'PCB' ? 'PCB' : 'SMT',
        line_number: item.lineNumber,
      });
      itemsCreated++;
    } catch (err) {
      if (itemsSkipped < 3) {
        console.log(`    Error adding BOM item ${ipn}: ${err.message}`);
      }
      itemsSkipped++;
    }
  }

  console.log(`  BOM items created: ${itemsCreated}, skipped: ${itemsSkipped}`);

  // Activate this revision
  await apiCall('POST', `/bom/revision/${bomRevision.id}/activate`);
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
    const result = await apiCall('POST', '/inventory/allocate-for-order', {
      order_id: order.id,
      created_by: 'test-simulation',
      allocate_available_only: true,
    });
    console.log(`  Allocation result: allocated ${result.allocations?.length || 0} materials`);
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
  const shortagesResult = await apiCall('GET', '/mrp/shortages');

  // Handle both array and object responses
  const shortages = Array.isArray(shortagesResult) ? shortagesResult : (shortagesResult?.shortages || []);

  if (!shortages || shortages.length === 0) {
    console.log('No shortages detected! All materials are available.');
    return;
  }

  console.log(`Found ${shortages.length} materials with shortages:\n`);

  // Sort by shortage quantity (descending)
  shortages.sort((a, b) => (b.shortage || b.quantity_short || 0) - (a.shortage || a.quantity_short || 0));

  console.log('IPN                          | Required | Available | On Order | Shortage');
  console.log('-'.repeat(80));

  let totalShortage = 0;
  for (const item of shortages) {
    const ipn = (item.material?.internal_part_number || item.internal_part_number || 'Unknown').substring(0, 28).padEnd(28);
    const required = String(item.total_required || item.required || 0).padStart(8);
    const available = String(item.quantity_available || item.available || 0).padStart(9);
    const onOrder = String(item.quantity_on_order || 0).padStart(8);
    const shortage = String(item.shortage || 0).padStart(8);

    console.log(`${ipn} | ${required} | ${available} | ${onOrder} | ${shortage}`);
    totalShortage += (item.shortage || 0);
  }

  console.log('-'.repeat(80));
  console.log(`Total materials with shortage: ${shortages.length}`);
  console.log(`Total shortage quantity: ${totalShortage.toLocaleString()}`);

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
    const materialMap = await importInventory(customer.id);

    // Step 2 & 3: Create products and import BOMs
    console.log('\n========================================');
    console.log('STEP 2 & 3: CREATING PRODUCTS AND BOMs');
    console.log('========================================');

    const productData = [];
    for (const orderConfig of ORDERS) {
      const { product, bomRevision } = await createProductAndBom(orderConfig, materialMap, customer.id);
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
