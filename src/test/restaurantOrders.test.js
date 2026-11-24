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
  assert.ok(ordersSrc.includes('formatOrderStatusText'));
  assert.ok(ordersSrc.includes('buildOrderTimelineSteps'));
  assert.ok(orderDetailSrc.includes('rejectionReason'));
  assert.ok(orderDetailSrc.includes('formatOrderStatusText'));
  assert.ok(orderDetailSrc.includes('buildOrderTimelineSteps'));
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

test('Step 9a orderTimeline, complete/cancel service methods, and UI pages match Step 9a rules', async () => {
  const server = await createServer({
    configFile: false,
    root: ROOT_DIR,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });

  const previousFetch = globalThis.fetch;

  try {
    const {
      buildOrderTimelineSteps,
      canCustomerCancelOrder,
      formatOrderStatusText,
      formatPaymentStatusLabel,
    } = await server.ssrLoadModule('/src/features/customer/utils/orderTimeline.js');
    const { clearCsrfCache } = await server.ssrLoadModule('/src/services/apiClient.js');
    const { ownerService } = await server.ssrLoadModule('/src/services/ownerService.js');
    const { customerService } = await server.ssrLoadModule('/src/services/customerService.js');

    // Pickup timeline includes Completed and Ready for pickup; Preparing/Ready have null timestamps
    const pickupSteps = buildOrderTimelineSteps({
      fulfillment: 'pickup',
      overallStatus: 'completed',
      createdAt: '2026-11-18T11:00:00+08:00',
      acceptedAt: '2026-11-18T11:05:00+08:00',
      completedAt: '2026-11-18T11:20:00+08:00',
    });
    assert.deepEqual(pickupSteps.map((s) => s.label), ['Pending', 'Accepted', 'Preparing', 'Ready for pickup', 'Completed']);
    assert.equal(pickupSteps[2].timestamp, null);
    assert.equal(pickupSteps[3].timestamp, null);
    assert.equal(pickupSteps[4].timestamp, '2026-11-18T11:20:00+08:00');

    // Delivery timeline extends to Out for delivery -> Delivered
    const deliverySteps = buildOrderTimelineSteps({
      fulfillment: 'delivery',
      overallStatus: 'delivered',
      createdAt: '2026-11-18T11:00:00+08:00',
      acceptedAt: '2026-11-18T11:05:00+08:00',
      deliveredAt: '2026-11-18T11:30:00+08:00',
    });
    assert.deepEqual(deliverySteps.map((s) => s.label), [
      'Pending',
      'Accepted',
      'Preparing',
      'Ready',
      'Out for delivery',
      'Rider arrived',
      'Customer reached',
      'Delivered',
    ]);
    assert.equal(deliverySteps[7].timestamp, '2026-11-18T11:30:00+08:00');
    assert.equal(formatOrderStatusText('ready', 'delivery'), 'Ready');
    assert.equal(formatOrderStatusText('out_for_delivery', 'delivery'), 'Out for delivery');
    assert.equal(formatOrderStatusText('delivered', 'delivery'), 'Delivered');
    assert.equal(formatOrderStatusText('ready', 'pickup'), 'Ready for pickup');

    // Rejected & Cancelled terminal timelines
    const rejectedSteps = buildOrderTimelineSteps({ overallStatus: 'rejected', rejectedAt: '2026-11-18T11:06:00+08:00' });
    assert.deepEqual(rejectedSteps.map((s) => s.label), ['Pending', 'Rejected']);
    const cancelledSteps = buildOrderTimelineSteps({ overallStatus: 'cancelled', cancelledAt: '2026-11-18T11:02:00+08:00' });
    assert.deepEqual(cancelledSteps.map((s) => s.label), ['Pending', 'Cancelled']);

    // Cancel button only for pending
    assert.equal(canCustomerCancelOrder({ overallStatus: 'pending' }), true);
    assert.equal(canCustomerCancelOrder({ overallStatus: 'accepted' }), false);
    assert.equal(canCustomerCancelOrder({ overallStatus: 'completed' }), false);
    assert.equal(canCustomerCancelOrder({ overallStatus: 'cancelled' }), false);
    assert.equal(formatPaymentStatusLabel('paid'), 'Paid');
    assert.equal(formatPaymentStatusLabel('cancelled'), 'Cancelled');

    // API client calls for completeOrder and cancelOrder
    clearCsrfCache();
    globalThis.fetch = async (url) => {
      if (url.endsWith('/auth/csrf')) {
        return new Response(JSON.stringify({ success: true, data: { csrf_token: 's9a-csrf' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.endsWith('/restaurant/orders/77/complete')) {
        return new Response(
          JSON.stringify({
            success: true,
            data: { order: { order_id: 77, order_status: 'completed', payment: { status: 'paid' } } },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.endsWith('/customer/orders/77/cancel')) {
        return new Response(
          JSON.stringify({
            success: true,
            data: { order: { order_id: 77, order_status: 'cancelled', payment: { status: 'cancelled' } } },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('{}', { status: 404 });
    };

    const completed = await ownerService.completeOrder(77);
    assert.equal(completed.status, 'completed');
    assert.equal(completed.paymentStatus, 'paid');

    const cancelled = await customerService.cancelOrder(77, 'Changed mind');
    assert.equal(cancelled.order_status, 'cancelled');
    assert.equal(cancelled.payment.status, 'cancelled');

    const [ownerOrdersSrc, orderDetailSrc] = await Promise.all([
      fs.readFile(new URL('../features/restaurant/pages/OwnerOrdersPage.jsx', import.meta.url), 'utf8'),
      fs.readFile(new URL('../features/customer/pages/OrderDetailPage.jsx', import.meta.url), 'utf8'),
    ]);

    // OwnerOrdersPage Complete button only on ready + pickup with cash confirmation dialog
    assert.ok(ownerOrdersSrc.includes("statusKey === 'ready' && isPickup"));
    assert.ok(ownerOrdersSrc.includes('Mark as Picked Up / Completed'));
    assert.ok(ownerOrdersSrc.includes('cash received from the customer?'));
    assert.ok(ownerOrdersSrc.includes('completeOrder'));

    // OrderDetailPage has no fake rider/ETA/map content and wires real cancelOrder
    assert.equal(orderDetailSrc.includes('Kuya Juan'), false);
    assert.equal(orderDetailSrc.includes('25–35 min'), false);
    assert.equal(orderDetailSrc.includes('MapSlot'), false);
    assert.equal(orderDetailSrc.includes('QUICK_RIDER_MESSAGES'), false);
    assert.ok(orderDetailSrc.includes('canCustomerCancelOrder'));
    assert.ok(orderDetailSrc.includes('cancelOrder'));
  } finally {
    globalThis.fetch = previousFetch;
    await server.close();
  }
});

test('Step 9b riderService, admin activation, rider UI states, and no fake remittance UI', async () => {
  const server = await createServer({
    configFile: false,
    root: ROOT_DIR,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });

  const previousFetch = globalThis.fetch;

  try {
    const { clearCsrfCache } = await server.ssrLoadModule('/src/services/apiClient.js');
    const { riderService } = await server.ssrLoadModule('/src/services/riderService.js');
    const { adminApiService } = await server.ssrLoadModule('/src/services/adminApiService.js');

    clearCsrfCache();
    globalThis.fetch = async (url) => {
      if (url.endsWith('/auth/csrf')) {
        return new Response(JSON.stringify({ success: true, data: { csrf_token: 's9b-csrf' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/rider/deliveries/available')) {
        return new Response(
          JSON.stringify({ success: true, data: { deliveries: [{ order_id: 91, restaurant_name: 'Grill' }], pagination: { current_page: 1, last_page: 1 } } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.endsWith('/rider/deliveries/91/accept')) {
        return new Response(
          JSON.stringify({ success: true, data: { delivery: { order_id: 91, delivery_status: 'accepted' } } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.endsWith('/rider/deliveries/91/picked-up')) {
        return new Response(
          JSON.stringify({ success: true, data: { delivery: { order_id: 91, delivery_status: 'picked_up', order_status: 'out_for_delivery' } } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.endsWith('/rider/deliveries/91/delivered')) {
        return new Response(
          JSON.stringify({ success: true, data: { delivery: { order_id: 91, delivery_status: 'delivered', order_status: 'delivered', payment_status: 'paid' } } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.endsWith('/admin/riders/12/activate')) {
        return new Response(
          JSON.stringify({ success: true, data: { rider: { rider_id: 12, rider_status: 'active' } } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('{}', { status: 404 });
    };

    const avail = await riderService.getAvailableDeliveries();
    assert.equal(avail.deliveries[0].order_id, 91);
    assert.equal((await riderService.acceptDelivery(91)).delivery_status, 'accepted');
    assert.equal((await riderService.markPickedUp(91)).delivery_status, 'picked_up');
    assert.equal((await riderService.markDelivered(91, 229)).payment_status, 'paid');
    assert.equal((await adminApiService.activateRider(12)).rider_status, 'active');

    const [
      deliveriesSrc,
      activeSrc,
      earningsSrc,
      dashboardSrc,
      layoutSrc,
      ownerOrdersSrc,
    ] = await Promise.all([
      fs.readFile(new URL('../features/rider/pages/RiderDeliveriesPage.jsx', import.meta.url), 'utf8'),
      fs.readFile(new URL('../features/rider/pages/RiderActiveDeliveryPage.jsx', import.meta.url), 'utf8'),
      fs.readFile(new URL('../features/rider/pages/RiderEarningsPage.jsx', import.meta.url), 'utf8'),
      fs.readFile(new URL('../features/rider/pages/RiderDashboardPage.jsx', import.meta.url), 'utf8'),
      fs.readFile(new URL('../layouts/RiderLayout.jsx', import.meta.url), 'utf8'),
      fs.readFile(new URL('../features/restaurant/pages/OwnerOrdersPage.jsx', import.meta.url), 'utf8'),
    ]);

    // Rider UI buttons, disabled states, awaiting activation, and no localStorage / self-remit UI
    assert.equal(deliveriesSrc.includes('localStorage'), false);
    assert.ok(deliveriesSrc.includes('Accept'));
    assert.ok(deliveriesSrc.includes('acceptingId !== null'));
    assert.ok(activeSrc.includes('Picked Up'));
    assert.ok(activeSrc.includes('Delivered'));
    assert.ok(activeSrc.includes('amount_to_collect'));
    assert.ok(activeSrc.includes('disabled={submitting'));
    assert.ok(dashboardSrc.includes('Awaiting activation'));
    assert.ok(layoutSrc.includes('Awaiting activation'));
    assert.ok(earningsSrc.includes('getFinanceSummary'));
    assert.ok(earningsSrc.includes('submitCodRemittance'));
    assert.ok(ownerOrdersSrc.includes('out_for_delivery'));
    assert.ok(ownerOrdersSrc.includes('delivered'));
    assert.ok(ownerOrdersSrc.includes('riderFirstName'));
  } finally {
    globalThis.fetch = previousFetch;
    await server.close();
  }
});
