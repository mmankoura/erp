const API_BASE = 'http://localhost:3002/api';

async function apiCall(method, endpoint) {
  const response = await fetch(`${API_BASE}${endpoint}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function main() {
  const shortagesResult = await apiCall('GET', '/mrp/shortages');
  const shortages = shortagesResult?.shortages || [];

  console.log('========================================');
  console.log('SHORTAGE REPORT');
  console.log('========================================\n');
  console.log('Generated at:', shortagesResult?.generated_at);
  console.log('Orders analyzed:', shortagesResult?.total_orders_analyzed);
  console.log('Materials with shortages:', shortagesResult?.total_materials_with_shortage);
  console.log('');
  console.log('IPN                          | Required | Available | On Order | Shortage');
  console.log('-'.repeat(80));

  let total = 0;
  for (const item of shortages) {
    const ipn = (item.material?.internal_part_number || 'Unknown').substring(0, 28).padEnd(28);
    const required = String(item.total_required || 0).padStart(8);
    const available = String(item.quantity_available || 0).padStart(9);
    const onOrder = String(item.quantity_on_order || 0).padStart(8);
    const shortage = String(item.shortage || 0).padStart(8);
    console.log(`${ipn} | ${required} | ${available} | ${onOrder} | ${shortage}`);
    total += item.shortage || 0;
  }

  console.log('-'.repeat(80));
  console.log(`Total shortage quantity: ${total.toLocaleString()}`);

  // Show per-order availability for new orders
  const ordersResp = await apiCall('GET', '/orders');
  const newOrders = ordersResp.filter(o =>
    ['ORD-20260129-0018', 'ORD-20260129-0019', 'ORD-20260129-0020', 'ORD-20260129-0021'].includes(o.order_number)
  );

  console.log('\n\nPER-ORDER AVAILABILITY:');
  console.log('========================================\n');

  for (const order of newOrders) {
    const avail = await apiCall('GET', `/mrp/order/${order.id}/availability`);
    const materials = avail.materials || [];
    const canFulfill = materials.filter(m => m.can_fulfill).length;
    const cannotFulfill = materials.filter(m => !m.can_fulfill).length;

    console.log(`Order: ${order.order_number} (${order.quantity} units of ${order.product?.part_number || 'N/A'})`);
    console.log(`  Order Status: ${order.status}`);
    console.log(`  Availability Status: ${avail.status || 'UNKNOWN'}`);
    console.log(`  Total BOM materials: ${materials.length}`);
    console.log(`  Materials available: ${canFulfill}`);
    console.log(`  Materials with shortage: ${cannotFulfill}`);

    if (cannotFulfill > 0) {
      console.log('  Top shortages:');
      const shortages = materials.filter(m => !m.can_fulfill).sort((a, b) => b.shortage - a.shortage).slice(0, 5);
      for (const s of shortages) {
        console.log(`    - ${s.material?.internal_part_number}: need ${s.required_quantity}, have ${s.quantity_available}, short ${s.shortage}`);
      }
    }
    console.log('');
  }
}

main().catch(console.error);
