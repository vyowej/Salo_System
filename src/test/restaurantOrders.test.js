import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createServer } from 'vite';

const ROOT_DIR = fileURLToPath(new URL('../../', import.meta.url));

test('ownerService calls restaurant order endpoints and normalizes responses', async () => {
  const server = await createServer({
    configFile: false,
    root: ROOT_DIR,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });

  const previousFetch = globalThis.fetch;
  const calls = [];

  try {
    const { clearCsrfCache } = await server.ssrLoadModule('/src/services/apiClient.js');
    const { ownerService } = await server.ssrLoadModule('/src/services/ownerService.js');

    clearCsrfCache();

    globalThis.fetch = async (url, init = {}) => {
      calls.push({ url, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null });

      if (url.endsWith('/auth/csrf')) {
        return new Response(JSON.stringify({ success: true, data: { csrf_token: 'owner-csrf' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.includes('/restaurant/orders?')) {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              orders: [
                {
                  order_id: 50,
                  order_reference: 'SALO-ORD-50',
                  fulfillment: 'delivery',
                  order_status: 'pending',
                  customer_name: 'Maria Santos',
                  customer_phone: '09171234567',
                  delivery_address_text: '123 Mabini St',
                  subtotal_amount: 150,
                  delivery_fee: 49,
                  total_amount: 199,
                  payment_method: 'cod',
                  payment_status: 'pending',
                  items: [{ order_item_id: 1, menu_item_id: 9, item_name: 'Sisig', unit_price: 150, quantity: 1, line_total: 150 }],
                },
              ],
              pagination: { current_page: 1, last_page: 1, per_page: 15, total: 1 },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (url.endsWith('/restaurant/orders/50')) {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              order: {
                order_id: 50,
                order_reference: 'SALO-ORD-50',
                fulfillment: 'delivery',
                order_status: 'pending',
                customer_name: 'Maria Santos',
                customer_phone: '09171234567',
                delivery_address: { recipient_name: 'Maria Santos', phone: '09171234567', address_text: '123 Mabini St', notes: 'Gate 2' },
                subtotal_amount: 150,
                delivery_fee: 49,
                total_amount: 199,
                payment: { method: 'cod', status: 'pending', amount: 199 },
                items: [],
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (url.endsWith('/restaurant/orders/50/accept')) {
        return new Response(
          JSON.stringify({ success: true, data: { order: { order_id: 50, order_status: 'accepted' } } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (url.endsWith('/restaurant/orders/50/prepare')) {
        return new Response(
          JSON.stringify({ success: true, data: { order: { order_id: 50, order_status: 'preparing' } } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (url.endsWith('/restaurant/orders/50/ready')) {
        return new Response(
          JSON.stringify({ success: true, data: { order: { order_id: 50, order_status: 'ready' } } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (url.endsWith('/restaurant/orders/50/reject')) {
        return new Response(
          JSON.stringify({
            success: true,
            data: { order: { order_id: 50, order_status: 'rejected', rejection_reason: 'Out of stock' } },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      return new Response(JSON.stringify({ success: false, message: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const list = await ownerService.fetchRestaurantOrders({ status: 'pending', page: 1 });
    assert.equal(list.orders.length, 1);
    assert.equal(list.orders[0].status, 'pending');
    assert.equal(list.orders[0].customerName, 'Maria Santos');
    assert.equal(list.orders[0].items[0].name, 'Sisig');

    const detail = await ownerService.fetchRestaurantOrderDetail(50);
    assert.equal(detail.deliveryAddress, '123 Mabini St');
    assert.equal(detail.deliveryInstructions, 'Gate 2');

    const accepted = await ownerService.acceptOrder(50);
    assert.equal(accepted.status, 'accepted');

    const preparing = await ownerService.prepareOrder(50);
    assert.equal(preparing.status, 'preparing');

    const ready = await ownerService.readyOrder(50);
    assert.equal(ready.status, 'ready');

    const rejected = await ownerService.rejectOrder(50, 'Out of stock');
    assert.equal(rejected.status, 'rejected');
    assert.equal(rejected.rejectionReason, 'Out of stock');
    assert.ok(calls.some((c) => c.url.endsWith('/restaurant/orders/50/reject') && c.body?.reason === 'Out of stock'));
  } finally {
    globalThis.fetch = previousFetch;
    await server.close();
  }
});

test('OwnerOrdersPage and customer order pages are wired to real statuses and rejection_reason', async () => {
  const [ownerOrdersSrc, ordersSrc, orderDetailSrc] = await Promise.all([
    fs.readFile(new URL('../features/restaurant/pages/OwnerOrdersPage.jsx', import.meta.url), 'utf8'),
    fs.readFile(new URL('../features/customer/pages/OrdersPage.jsx', import.meta.url), 'utf8'),
    fs.readFile(new URL('../features/customer/pages/OrderDetailPage.jsx', import.meta.url), 'utf8'),
  ]);

  assert.equal(ownerOrdersSrc.includes('ownerService.getOrders'), false);
  assert.equal(ownerOrdersSrc.includes('updateOrderStatus'), false);
  assert.ok(ownerOrdersSrc.includes('fetchRestaurantOrders'));
  assert.ok(ownerOrdersSrc.includes('acceptOrder'));
  assert.ok(ownerOrdersSrc.includes('rejectOrder'));
  assert.ok(ownerOrdersSrc.includes('prepareOrder'));
  assert.ok(ownerOrdersSrc.includes('readyOrder'));
  assert.ok(ownerOrdersSrc.includes('disabled={saving}'));

  assert.ok(ordersSrc.includes('rejectionReason'));
  assert.ok(ordersSrc.includes('formatStatusLabel'));
  assert.ok(orderDetailSrc.includes('rejectionReason'));
  assert.ok(orderDetailSrc.includes('formatBackendStatus'));
  assert.ok(orderDetailSrc.includes('Payment Status'));
});

test('permissionMap derives staff order permissions from backend order_handler_positions without hardcoding', async () => {
  const server = await createServer({
    configFile: false,
    root: ROOT_DIR,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });

  try {
    const { canStaffPositionHandleOrders, ORDER_HANDLER_PERMISSIONS } = await server.ssrLoadModule(
      '/src/features/restaurant/access/permissionMap.js',
    );
    const permSrc = await fs.readFile(new URL('../features/restaurant/access/permissionMap.js', import.meta.url), 'utf8');
    assert.equal(permSrc.includes('Order Handler'), false);
    assert.equal(permSrc.includes('Order Staff'), false);

    const allowedFromBackend = ['Manager', 'Order Handler', 'Order Staff'];
    assert.equal(canStaffPositionHandleOrders('  manager ', allowedFromBackend), true);
    assert.equal(canStaffPositionHandleOrders('Order Handler', allowedFromBackend), true);
    assert.equal(canStaffPositionHandleOrders('Reservation Handler', allowedFromBackend), false);
    assert.equal(canStaffPositionHandleOrders('Reservation Handler', allowedFromBackend, true), true);
    assert.ok(ORDER_HANDLER_PERMISSIONS.includes('orders.view'));
    assert.ok(ORDER_HANDLER_PERMISSIONS.includes('orders.accept'));
  } finally {
    await server.close();
  }
});
