import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createServer } from 'vite';

const ROOT_DIR = fileURLToPath(new URL('../../', import.meta.url));

test('customerService calls checkout and order endpoints and surfaces per-group 422 and 404 errors', async () => {
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
    const { customerService } = await server.ssrLoadModule('/src/services/customerService.js');

    clearCsrfCache();

    globalThis.fetch = async (url, init = {}) => {
      if (url.endsWith('/auth/csrf')) {
        return new Response(
          JSON.stringify({ success: true, data: { csrf_token: 'cust-csrf' } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (url.endsWith('/customer/checkout')) {
        const body = JSON.parse(init.body || '{}');
        if (body.idempotency_key === 'bad-group-key') {
          return new Response(
            JSON.stringify({
              success: false,
              message: 'The given data was invalid.',
              errors: {
                'groups.0.address_id': ['Restaurant does not deliver to this area.'],
              },
            }),
            { status: 422, headers: { 'Content-Type': 'application/json' } },
          );
        }

        return new Response(
          JSON.stringify({
            success: true,
            data: {
              checkout: {
                checkout_id: 12,
                total_amount: 149.0,
                payment_method: 'cod',
                orders: [{ order_id: 33, order_reference: 'SALO-ORD-20261117-1234', total_amount: 149.0 }],
              },
            },
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (url.includes('/customer/orders?')) {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              orders: [{ order_id: 33, order_reference: 'SALO-ORD-20261117-1234', order_status: 'pending' }],
              pagination: { current_page: 1, last_page: 1, total: 1 },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (url.endsWith('/customer/orders/33')) {
        return new Response(
          JSON.stringify({
            success: true,
            data: { order: { order_id: 33, order_reference: 'SALO-ORD-20261117-1234', items: [] } },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      return new Response(JSON.stringify({ success: false, message: 'Order not found.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    await assert.rejects(
      () => customerService.placeCheckoutOrder({ payment_method: 'cod', idempotency_key: 'bad-group-key', groups: [] }),
      (err) => err.status === 422 && Boolean(err.errors?.['groups.0.address_id']),
    );

    const checkout = await customerService.placeCheckoutOrder({
      payment_method: 'cod',
      idempotency_key: 'good-key-1234',
      groups: [],
    });
    assert.equal(checkout.checkout_id, 12);
    assert.equal(checkout.orders[0].order_id, 33);

    const list = await customerService.fetchOrders({ page: 1, per_page: 10 });
    assert.equal(list.orders.length, 1);

    const detail = await customerService.fetchOrderDetail(33);
    assert.equal(detail.order_id, 33);

    await assert.rejects(
      () => customerService.fetchOrderDetail(9999),
      (err) => err.status === 404,
    );
  } finally {
    globalThis.fetch = previousFetch;
    await server.close();
  }
});

test('CheckoutPage enforces COD-only, estimated total note, per-group errors, and removes pending stub', async () => {
  const checkoutSrc = await fs.readFile(
    new URL('../features/customer/pages/CheckoutPage.jsx', import.meta.url),
    'utf8',
  );
  assert.equal(checkoutSrc.includes('endpoint is pending backend implementation'), false);
  assert.ok(checkoutSrc.includes('placeCheckoutOrder'));
  assert.ok(checkoutSrc.includes('Estimated Total'));
  assert.ok(checkoutSrc.includes('groupErrors[idx]'));
  assert.ok(checkoutSrc.includes('Coming soon'));
});
