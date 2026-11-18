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

test('ownerService inventory config reads default mode and rejects unsupported updates explicitly', async () => {
  const server = await createServer({
    configFile: false,
    root: ROOT_DIR,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'silent',
  });

  try {
    const { ownerService } = await server.ssrLoadModule('/src/services/ownerService.js');
    assert.deepEqual(ownerService.getInventoryConfig(), { deductionMode: 'manual' });
    assert.throws(
      () => ownerService.updateInventoryConfig(1, { deductionMode: 'auto' }),
      /not available yet|pending implementation/i,
    );
  } finally {
    await server.close();
  }
});
