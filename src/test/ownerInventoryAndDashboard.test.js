import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createServer } from 'vite';

const ROOT_DIR = fileURLToPath(new URL('../../', import.meta.url));

test('OwnerInventoryPage uses real ownerService menu/availability/config methods without nonexistent calls', async () => {
  const source = await fs.readFile(
    new URL('../features/restaurant/pages/OwnerInventoryPage.jsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /ownerService\.fetchMenuItems/);
  assert.match(source, /ownerService\.fetchMenuCategories/);
  assert.match(source, /ownerService\.updateMenuItemAvailability/);
  assert.match(source, /ownerService\.getInventoryConfig/);
  assert.match(source, /ownerService\.updateInventoryConfig/);
  assert.match(source, /Promise\.all\(\[[\s\S]*ownerService\.getInventoryConfig\(restaurantId\)/);
  assert.match(source, /role="status"/);
  assert.match(source, /disabled=\{!can\('inventory\.adjustStock'\) \|\| saving\}/);

  assert.doesNotMatch(source, /ownerService\.getMenuItems\b/);
  assert.doesNotMatch(source, /ownerService\.getMenuCategories\b/);
  assert.doesNotMatch(source, /ownerService\.updateMenuItem\(/);
  assert.doesNotMatch(source, /ownerService\.getInventorySettings\b/);
  assert.doesNotMatch(source, /ownerService\.setInventoryDeductionMode\b/);
});

test('OwnerDashboard uses fetchRestaurantOrders and real order transition methods without nonexistent calls', async () => {
  const source = await fs.readFile(
    new URL('../features/restaurant/pages/OwnerDashboard.jsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /ownerService\.fetchRestaurantOrders/);
  assert.match(source, /ownerService\.acceptOrder/);
  assert.match(source, /ownerService\.prepareOrder/);
  assert.match(source, /ownerService\.readyOrder/);
  assert.match(source, /ownerService\.completeOrder/);

  assert.doesNotMatch(source, /ownerService\.getOrders\b/);
  assert.doesNotMatch(source, /ownerService\.getRestaurant\b/);
  assert.doesNotMatch(source, /ownerService\.updateOrderStatus\b/);
});

test('ownerService inventory config retrieves and updates backend config and propagates errors without fallback', async () => {
  const server = await createServer({
    configFile: false,
    root: ROOT_DIR,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });

  const previousFetch = globalThis.fetch;
  const calls = [];
  let savedMode = 'on_completion';
  let failNextGet = false;
  let failNextPatch = false;

  try {
    const { clearCsrfCache } = await server.ssrLoadModule('/src/services/apiClient.js');
    const { ownerService } = await server.ssrLoadModule('/src/services/ownerService.js');

    clearCsrfCache();

    globalThis.fetch = async (url, init = {}) => {
      const method = init.method || 'GET';
      const body = init.body ? JSON.parse(init.body) : null;
      calls.push({ url, method, body });

      if (url.endsWith('/auth/csrf')) {
        return new Response(JSON.stringify({ success: true, data: { csrf_token: 'inv-csrf' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.includes('/restaurant/inventory/config') && method === 'GET') {
        if (failNextGet) {
          failNextGet = false;
          return new Response(JSON.stringify({ success: false, message: 'Database unavailable.' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({
          success: true,
          data: { config: { restaurant_id: 7, deduction_mode: savedMode } },
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.includes('/restaurant/inventory/config') && method === 'PATCH') {
        if (failNextPatch) {
          failNextPatch = false;
          return new Response(JSON.stringify({
            success: false,
            message: 'The given data was invalid.',
            errors: { deduction_mode: ['Invalid deduction mode.'] },
          }), {
            status: 422,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        savedMode = body.deduction_mode;
        return new Response(JSON.stringify({
          success: true,
          data: { config: { restaurant_id: body.restaurant_id, deduction_mode: savedMode } },
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: false, message: 'Unexpected URL' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    // 1. Retrieves saved backend config
    const loaded = await ownerService.getInventoryConfig(7);
    assert.deepEqual(loaded, { restaurantId: 7, deductionMode: 'on_completion' });
    assert.equal(calls.some((c) => c.method === 'GET' && c.url.includes('/restaurant/inventory/config?restaurant_id=7')), true);

    // 2. Updates backend config and persists
    const updated = await ownerService.updateInventoryConfig(7, { deductionMode: 'manual' });
    assert.deepEqual(updated, { restaurantId: 7, deductionMode: 'manual' });
    const reloaded = await ownerService.getInventoryConfig(7);
    assert.deepEqual(reloaded, { restaurantId: 7, deductionMode: 'manual' });

    // 3. Does not silently fall back to hardcoded default on GET failure
    failNextGet = true;
    await assert.rejects(
      () => ownerService.getInventoryConfig(7),
      /Database unavailable/i,
    );

    // 4. Rejects failed PATCH without fake success
    failNextPatch = true;
    await assert.rejects(
      () => ownerService.updateInventoryConfig(7, { deductionMode: 'auto' }),
      /Invalid deduction mode|given data was invalid/i,
    );
  } finally {
    globalThis.fetch = previousFetch;
    await server.close();
  }
});
