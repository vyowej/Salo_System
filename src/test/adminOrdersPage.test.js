import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createServer } from 'vite';
import {
  buildAdminOrdersQuery,
  mapAdminOrder,
  validateDateRange,
} from '../features/admin/utils/adminOrdersHelpers.js';

const ROOT_DIR = fileURLToPath(new URL('../../', import.meta.url));

test('mapAdminOrder maps all GET /api/admin/orders fields without fabricating missing values', () => {
  const mapped = mapAdminOrder({
    order_id: 101,
    checkout_id: 55,
    order_reference: 'SALO-ORD-101',
    customer_name: 'Juan Dela Cruz',
    restaurant_name: 'Casa Manila',
    order_type: 'delivery',
    order_status: 'preparing',
    payment_method: 'cod',
    payment_status: 'pending',
    subtotal_amount: 300,
    delivery_fee: 49,
    total_amount: 349,
    items_count: 2,
    total_quantity: 4,
    delivery_status: 'accepted',
    placed_at: '2026-11-18T10:00:00+08:00',
    paid_at: null,
  });

  assert.equal(mapped.id, 101);
  assert.equal(mapped.order_reference, 'SALO-ORD-101');
  assert.equal(mapped.customer_name, 'Juan Dela Cruz');
  assert.equal(mapped.restaurant_name, 'Casa Manila');
  assert.equal(mapped.order_type, 'delivery');
  assert.equal(mapped.order_status, 'preparing');
  assert.equal(mapped.payment_method, 'cod');
  assert.equal(mapped.payment_status, 'pending');
  assert.equal(mapped.subtotal_amount, 300);
  assert.equal(mapped.delivery_fee, 49);
  assert.equal(mapped.total_amount, 349);
  assert.equal(mapped.items_count, 2);
  assert.equal(mapped.total_quantity, 4);
  assert.equal(mapped.delivery_status, 'accepted');
  assert.equal(mapped.placed_at, '2026-11-18T10:00:00+08:00');
  assert.equal(mapped.paid_at, null);
});

test('buildAdminOrdersQuery and validateDateRange enforce valid filters, pagination, and date bounds', () => {
  assert.equal(validateDateRange('2026-11-01', '2026-11-10'), '');
  assert.match(validateDateRange('2026-11-20', '2026-11-10'), /on or after/i);

  assert.deepEqual(
    buildAdminOrdersQuery({
      search: '  Casa  ',
      orderStatus: 'completed',
      orderType: 'pickup',
      paymentStatus: 'paid',
      dateFrom: '2026-11-01',
      dateTo: '2026-11-18',
      page: 2,
      perPage: 25,
      direction: 'asc',
    }),
    {
      page: 2,
      per_page: 25,
      direction: 'asc',
      search: 'Casa',
      order_status: 'completed',
      order_type: 'pickup',
      payment_status: 'paid',
      date_from: '2026-11-01',
      date_to: '2026-11-18',
    },
  );

  assert.deepEqual(
    buildAdminOrdersQuery({
      orderStatus: 'all',
      orderType: 'all',
      paymentStatus: 'all',
      page: 0,
      perPage: 999,
    }),
    {
      page: 1,
      per_page: 100,
      direction: 'desc',
    },
  );
});

test('adminApiService.getOrders sends query parameters, returns { items, meta }, and propagates errors', async () => {
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
    const { default: adminApiService } = await server.ssrLoadModule('/src/services/adminApiService.js');

    globalThis.fetch = async (url, init = {}) => {
      calls.push({ url, method: init.method || 'GET' });
      if (url.includes('search=fail')) {
        return new Response(
          JSON.stringify({ success: false, message: 'Server error' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (url.includes('search=empty')) {
        return new Response(
          JSON.stringify({
            success: true,
            data: { items: [], meta: { current_page: 1, last_page: 1, per_page: 15, total: 0 } },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            items: [
              {
                order_id: 7,
                order_reference: 'SALO-ORD-007',
                customer_name: 'Elena Reyes',
                restaurant_name: 'Tondo Grill',
                order_type: 'delivery',
                order_status: 'completed',
                payment_method: 'cod',
                payment_status: 'paid',
                subtotal_amount: 200,
                delivery_fee: 49,
                total_amount: 249,
                items_count: 1,
                total_quantity: 2,
                delivery_status: 'delivered',
                placed_at: '2026-11-18T12:00:00+08:00',
                paid_at: '2026-11-18T12:30:00+08:00',
              },
            ],
            meta: { current_page: 2, last_page: 3, per_page: 25, total: 51 },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const res = await adminApiService.getOrders({
      search: 'Elena',
      order_status: 'completed',
      order_type: 'delivery',
      payment_status: 'paid',
      date_from: '2026-11-01',
      date_to: '2026-11-18',
      page: 2,
      per_page: 25,
    });

    assert.equal(calls.length, 1);
    assert.ok(calls[0].url.includes('/admin/orders?'));
    assert.ok(calls[0].url.includes('order_status=completed'));
    assert.ok(calls[0].url.includes('order_type=delivery'));
    assert.ok(calls[0].url.includes('payment_status=paid'));
    assert.ok(calls[0].url.includes('date_from=2026-11-01'));
    assert.ok(calls[0].url.includes('date_to=2026-11-18'));
    assert.equal(res.items.length, 1);
    assert.equal(res.meta.total, 51);

    const emptyRes = await adminApiService.getOrders({ search: 'empty' });
    assert.deepEqual(emptyRes.items, []);
    assert.equal(emptyRes.meta.total, 0);

    await assert.rejects(
      () => adminApiService.getOrders({ search: 'fail' }),
      (err) => err?.status === 500,
    );
  } finally {
    globalThis.fetch = previousFetch;
    await server.close();
  }
});

test('AdminOrdersPage wires DataTable, filters, pagination, states, and detail navigation without mock data', async () => {
  const source = await fs.readFile(
    new URL('../features/admin/pages/AdminOrdersPage.jsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /adminApiService\.getOrders/);
  assert.match(source, /DataTable/);
  assert.match(source, /state="loading"/);
  assert.match(source, /state="error"/);
  assert.match(source, /state="empty"/);
  assert.match(source, /Clear filters/);
  assert.match(source, /Retry/);
  assert.match(source, /\/admin\/orders\/\$\{order\.order_id\}/);
  assert.doesNotMatch(source, /Admin orders view is not available yet/);
});
