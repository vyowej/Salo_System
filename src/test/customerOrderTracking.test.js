import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createServer } from 'vite';

const ROOT_DIR = fileURLToPath(new URL('../../', import.meta.url));

test('customerService.getCustomerOrderTracking calls /customer/orders/{id}/tracking and returns tracking payload', async () => {
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
    const { default: customerService } = await server.ssrLoadModule('/src/services/customerService.js');

    globalThis.fetch = async (url, init = {}) => {
      calls.push({ url, method: init.method || 'GET' });
      if (url.endsWith('/customer/orders/77/tracking')) {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              order_id: 77,
              order_reference: 'ORD-077',
              order_status: 'out_for_delivery',
              order_type: 'delivery',
              pickup: {
                restaurant_id: 5,
                restaurant_name: 'Casa Salo',
                address: '123 Main St',
                latitude: 14.6,
                longitude: 121.0,
              },
              dropoff: {
                recipient_name: 'Juan',
                address: '456 Side St',
                latitude: 14.61,
                longitude: 121.01,
                notes: 'Gate 2',
              },
              delivery: {
                delivery_id: 12,
                status: 'picked_up',
              },
              rider: {
                name: 'Pedro Santos',
                vehicle_type: 'motorcycle',
                plate_number: 'ABC-123',
              },
              rider_location: {
                latitude: 14.605,
                longitude: 121.005,
                recorded_at: '2026-11-18T14:00:00+00:00',
                age_seconds: 10,
                is_stale: false,
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      return new Response(
        JSON.stringify({ success: false, message: 'Order not found.' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const tracking = await customerService.getCustomerOrderTracking(77);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, 'GET');
    assert.ok(calls[0].url.endsWith('/customer/orders/77/tracking'));
    assert.equal(tracking.order_id, 77);
    assert.equal(tracking.delivery.status, 'picked_up');
    assert.equal(tracking.rider.name, 'Pedro Santos');
    assert.equal(tracking.rider_location.is_stale, false);

    await assert.rejects(
      () => customerService.getCustomerOrderTracking(999),
      (err) => err?.status === 404 && /Order not found/i.test(err.message),
    );
  } finally {
    globalThis.fetch = previousFetch;
    await server.close();
  }
});

test('OrderDetailPage integrates getCustomerOrderTracking with loading, empty, and error states', async () => {
  const source = await fs.readFile(
    new URL('../features/customer/pages/OrderDetailPage.jsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /getCustomerOrderTracking/);
  assert.match(source, /trackingLoading/);
  assert.match(source, /trackingError/);
  assert.match(source, /tracking\?\.rider_location/);
});
