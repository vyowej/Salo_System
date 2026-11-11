import assert from 'node:assert/strict';
import test from 'node:test';
import {
  filterInventoryMenuItems,
  getInventoryMenuAlertCounts,
  getMenuStockDisplay,
  groupInventoryMenuItems,
  INVENTORY_MENU_DISPLAY,
  MENU_STOCK_STATUS,
} from './inventoryMenuDisplayConfig.js';

test('menu stock uses the configured default threshold and existing item thresholds', () => {
  assert.equal(INVENTORY_MENU_DISPLAY.defaultAlertThreshold, 5);
  assert.equal(getMenuStockDisplay({ name: 'Tracked item', stockQuantity: 5 }).inventoryStockStatus, MENU_STOCK_STATUS.LOW);
  assert.equal(getMenuStockDisplay({ name: 'Tracked item', stockQuantity: 6 }).inventoryStockStatus, MENU_STOCK_STATUS.IN);
  assert.equal(getMenuStockDisplay({ name: 'Tracked item', stockQuantity: 0 }).inventoryStockStatus, MENU_STOCK_STATUS.OUT);
  assert.equal(getMenuStockDisplay({ name: 'Custom threshold item', stockQuantity: 8, minimumLevel: 8 }).inventoryStockStatus, MENU_STOCK_STATUS.LOW);
});

test('untracked menu items remain neutral and do not receive a made-up quantity', () => {
  const item = getMenuStockDisplay({ name: 'Untracked item', stockQuantity: null });
  assert.equal(item.stockTracked, false);
  assert.equal(item.stockQuantity, null);
  assert.equal(item.inventoryStockStatus, MENU_STOCK_STATUS.UNTRACKED);
});

test('menu sections follow category order and sort items by stock urgency then name', () => {
  const categories = [
    { id: 'first', name: 'First category' },
    { id: 'second', name: 'Second category' },
  ];
  const items = [
    getMenuStockDisplay({ id: 'in', name: 'Zulu', category: 'First category', stockQuantity: 12 }),
    getMenuStockDisplay({ id: 'low-z', name: 'Zulu', category: 'First category', stockQuantity: 5 }),
    getMenuStockDisplay({ id: 'out', name: 'Beta', category: 'First category', stockQuantity: 0 }),
    getMenuStockDisplay({ id: 'low-a', name: 'Alpha', category: 'First category', stockQuantity: 4 }),
    getMenuStockDisplay({ id: 'other', name: 'Other', category: 'Second category', stockQuantity: null }),
  ];
  const sections = groupInventoryMenuItems(categories, items);
  assert.deepEqual(sections.map((section) => section.name), ['First category', 'Second category']);
  assert.deepEqual(sections[0].items.map((item) => item.id), ['out', 'low-a', 'low-z', 'in']);
  assert.deepEqual(sections[1].items.map((item) => item.id), ['other']);
});

test('alert counts include only tracked low and out-of-stock items', () => {
  const items = [
    getMenuStockDisplay({ name: 'Low item', stockQuantity: 3 }),
    getMenuStockDisplay({ name: 'Out item', stockQuantity: 0 }),
    getMenuStockDisplay({ name: 'In item', stockQuantity: 9 }),
    getMenuStockDisplay({ name: 'Untracked item', stockQuantity: null }),
  ];
  assert.deepEqual(getInventoryMenuAlertCounts(items), { low: 1, out: 1 });
});

test('menu filters combine alert status, category, and search criteria', () => {
  const items = [
    getMenuStockDisplay({ id: 'low', name: 'Citrus dish', category: 'Meals', stockQuantity: 4 }),
    getMenuStockDisplay({ id: 'out', name: 'Citrus drink', category: 'Drinks', stockQuantity: 0 }),
    getMenuStockDisplay({ id: 'in', name: 'Citrus bowl', category: 'Meals', stockQuantity: 9 }),
    getMenuStockDisplay({ id: 'untracked', name: 'Other', category: 'Meals', stockQuantity: null }),
  ];
  assert.deepEqual(
    filterInventoryMenuItems(items, { search: 'citrus', category: 'Meals', alertOnly: true }).map((item) => item.id),
    ['low'],
  );
  assert.deepEqual(
    filterInventoryMenuItems(items, { status: MENU_STOCK_STATUS.OUT }).map((item) => item.id),
    ['out'],
  );
});

test('invalid tracked quantities are surfaced rather than treated as untracked', () => {
  assert.throws(() => getMenuStockDisplay({ name: 'Invalid item', stockQuantity: 'invalid' }), /stock quantity.*invalid/i);
});
