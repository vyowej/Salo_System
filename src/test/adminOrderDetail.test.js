import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createServer } from 'vite';

const ROOT_DIR = fileURLToPath(new URL('../../', import.meta.url));

test('adminApiService.getOrderTracking calls /admin/orders/{id}/tracking and surfaces 404/error responses', async () => {
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
      if (url.endsWith('/admin/orders/42/tracking')) {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              order_id: 42,
              order_reference: 'SALO-ORD-042',
              order_status: 'out_for_delivery',
              order_type: 'delivery',
              pickup: { restaurant_id: 5, restaurant_name: 'Casa Salo', address: '123 Main St' },
              dropoff: { recipient_name: 'Juan', address: '456 Side St', notes: 'Gate 2' },
              delivery: { delivery_id: 9, status: 'picked_up' },
              rider: { name: 'Pedro Santos', vehicle_type: 'motorcycle', plate_number: 'ABC-123' },
              rider_location: { latitude: 14.6, longitude: 121.0, recorded_at: '2026-11-18T14:00:00Z', is_stale: false },
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

    const tracking = await adminApiService.getOrderTracking(42);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, 'GET');
    assert.ok(calls[0].url.endsWith('/admin/orders/42/tracking'));
    assert.equal(tracking.order_reference, 'SALO-ORD-042');
    assert.equal(tracking.delivery.status, 'picked_up');
    assert.equal(tracking.rider.name, 'Pedro Santos');

    await assert.rejects(
      () => adminApiService.getOrderTracking(999),
      (err) => err?.status === 404 && /Order not found/i.test(err.message),
    );
  } finally {
    globalThis.fetch = previousFetch;
    await server.close();
  }
});

test('AdminOrderDetailPage connects to adminApiService.getOrderTracking with loading, not-found, and error states', async () => {
  const source = await fs.readFile(
    new URL('../features/admin/pages/AdminOrderDetailPage.jsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /adminApiService\.getOrderTracking/);
  assert.match(source, /state="loading"/);
  assert.match(source, /title="Order not found"/);
  assert.match(source, /state="error"/);
  assert.match(source, /err\?\.status === 404/);
});
