import assert from 'node:assert/strict';
import test from 'node:test';
import { DEMO_SEED } from './seedData.js';
import { canPerformRestaurantAction, demoAdapter } from './demoAdapter.js';
import { classifyInventoryItem, createStockAdjustment, createStockMovement } from './inventoryRules.js';

const STORAGE_KEY = 'salo_demo_store_v1';
const OWNER = { id: 2, email: 'owner@salo.ph', name: 'Demo Owner', role: 'owner' };

function installDemoSession(user = OWNER) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const storage = new Map([
    [STORAGE_KEY, JSON.stringify(DEMO_SEED)],
    ['salo_user', JSON.stringify(user)],
  ]);
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
    },
  });
  return () => {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  };
}

test('stock movement math records received, used, returned, and adjusted quantities', () => {
  const item = { id: 'I1', name: 'Rice', quantity: 5 };
  const received = createStockMovement(item, 'received', 3, '', { name: 'Owner' }, new Date('2026-11-01T10:00:00Z'));
  assert.deepEqual([received.before, received.after, received.movement.quantity], [5, 8, 3]);
  const used = createStockMovement({ ...item, quantity: received.after }, 'deducted', 2, 'Kitchen prep', { name: 'Staff' });
  assert.deepEqual([used.before, used.after, used.movement.quantity], [8, 6, -2]);
  const adjusted = createStockAdjustment({ ...item, quantity: used.after }, 4, 'Count correction', { name: 'Owner' });
  assert.deepEqual([adjusted.before, adjusted.after, adjusted.movement.quantity], [6, 4, -2]);
  assert.throws(() => createStockMovement(item, 'deducted', 6), /negative/);
  assert.throws(() => createStockMovement(item, 'received', 0), /greater than zero/);
  assert.throws(() => createStockAdjustment(item, -1, 'Correction'), /non-negative/);
  assert.throws(() => createStockAdjustment(item, 4, '  '), /reason is required/);
});

test('inventory classification identifies in-stock, low, out, expiring, and unavailable items', () => {
  const now = new Date('2026-11-07T12:00:00');
  assert.equal(classifyInventoryItem({ quantity: 8, minimumLevel: 3 }, 7, now), 'In Stock');
  assert.equal(classifyInventoryItem({ quantity: 3, minimumLevel: 3 }, 7, now), 'Low Stock');
  assert.equal(classifyInventoryItem({ quantity: 0, minimumLevel: 3 }, 7, now), 'Out of Stock');
  assert.equal(classifyInventoryItem({ quantity: 8, minimumLevel: 3, expirationDate: '2026-11-10' }, 7, now), 'Expiring Soon');
  assert.equal(classifyInventoryItem({ quantity: 8, minimumLevel: 3, availability: 'unavailable' }, 7, now), 'Unavailable');
});

function createPickupOrder(quantity = 2) {
  return demoAdapter.createCustomerOrder({
    paymentMethod: 'Cash on Delivery',
    paymentStatus: 'Pending COD Collection',
    subOrders: [{
      restaurantId: 'dalisay-heritage',
      fulfillment: 'pickup',
      subtotal: quantity * 195,
      items: [{ menuItemId: 'menu-1', name: 'Inasal na Manok (Quarter Leg)', qty: quantity, price: 195 }],
    }],
  });
}

function completePickupOrder(subOrderId) {
  demoAdapter.updateOrderStatus(subOrderId, 'Accepted', 'dalisay-heritage');
  demoAdapter.updateOrderStatus(subOrderId, 'Preparing', 'dalisay-heritage');
  demoAdapter.updateOrderStatus(subOrderId, 'Ready for Pickup', 'dalisay-heritage');
  return demoAdapter.updateOrderStatus(subOrderId, 'Completed', 'dalisay-heritage');
}

test('inventory stock operations write immutable movement history and prevent negative stock', () => {
  const restore = installDemoSession();
  try {
    const item = demoAdapter.createInventoryItem({
      name: 'Test Flour',
      category: 'Ingredients',
      unit: 'kg',
      quantity: 5,
      minimumLevel: 2,
      maximumLevel: 10,
    }, 'dalisay-heritage');
    demoAdapter.receiveInventoryStock(item.id, 3, 'dalisay-heritage', 'Delivery');
    demoAdapter.recordInventoryUsage(item.id, 2, 'dalisay-heritage', 'Prep');
    demoAdapter.adjustInventoryStock(item.id, 4, 'Count correction', 'dalisay-heritage');
    demoAdapter.returnInventoryStock(item.id, 1, 'dalisay-heritage', 'Supplier return reversed');
    assert.equal(demoAdapter.getInventoryItems('dalisay-heritage').find((entry) => entry.id === item.id).quantity, 5);
    assert.equal(demoAdapter.getInventoryMovements('dalisay-heritage', item.id).length, 5);
    assert.throws(() => demoAdapter.recordInventoryUsage(item.id, 6, 'dalisay-heritage'), /negative/);
    assert.throws(() => demoAdapter.adjustInventoryStock(item.id, -1, 'bad count', 'dalisay-heritage'), /non-negative/);
    assert.throws(() => demoAdapter.adjustInventoryStock(item.id, 4, '', 'dalisay-heritage'), /reason is required/);
    assert.equal(demoAdapter.getInventoryMovements('dalisay-heritage', item.id).length, 5);
  } finally {
    restore();
  }
});

test('manual deduction is the default and on-completion deductions run once without negative stock', () => {
  const restore = installDemoSession();
  try {
    const menuItem = () => demoAdapter.getMenuItems('dalisay-heritage').find((item) => item.id === 'menu-1');
    assert.equal(demoAdapter.getInventorySettings('dalisay-heritage').deductionMode, 'manual');
    const manual = createPickupOrder();
    completePickupOrder(manual.subOrders[0].id);
    assert.equal(menuItem().stockQuantity, 10);

    demoAdapter.setInventoryDeductionMode('on_completion', 'dalisay-heritage');
    const automatic = createPickupOrder(3);
    completePickupOrder(automatic.subOrders[0].id);
    assert.equal(menuItem().stockQuantity, 7);
    assert.equal(demoAdapter.getInventoryMovements('dalisay-heritage', 'menu-1').filter((entry) => entry.type === 'deducted').length, 1);
    assert.throws(() => demoAdapter.updateOrderStatus(automatic.subOrders[0].id, 'Completed', 'dalisay-heritage'), /cannot move/);
    assert.equal(menuItem().stockQuantity, 7);

    const tooLarge = createPickupOrder(20);
    demoAdapter.updateOrderStatus(tooLarge.subOrders[0].id, 'Accepted', 'dalisay-heritage');
    demoAdapter.updateOrderStatus(tooLarge.subOrders[0].id, 'Preparing', 'dalisay-heritage');
    demoAdapter.updateOrderStatus(tooLarge.subOrders[0].id, 'Ready for Pickup', 'dalisay-heritage');
    assert.throws(() => demoAdapter.updateOrderStatus(tooLarge.subOrders[0].id, 'Completed', 'dalisay-heritage'), /Not enough/);
    assert.equal(menuItem().stockQuantity, 7);
  } finally {
    restore();
  }
});

test('inventory service actions enforce inventory-manager permissions and reject table access', () => {
  const inventoryStaff = { id: 7, email: 'inventory.staff@salo.ph', role: 'customer' };
  const memberships = {
    ownershipMemberships: DEMO_SEED.ownershipMemberships,
    staffMemberships: DEMO_SEED.staffMemberships,
  };
  assert.equal(canPerformRestaurantAction(inventoryStaff, memberships, 'dalisay-heritage', 'inventory.addStock'), true);
  assert.equal(canPerformRestaurantAction(inventoryStaff, memberships, 'dalisay-heritage', 'inventory.adjustStock'), true);
  assert.equal(canPerformRestaurantAction(inventoryStaff, memberships, 'dalisay-heritage', 'tables.view'), false);

  const restore = installDemoSession(inventoryStaff);
  try {
    const item = demoAdapter.getInventoryItems('dalisay-heritage').find((entry) => entry.id === 'inv-oil');
    demoAdapter.receiveInventoryStock(item.id, 2, 'dalisay-heritage');
    assert.throws(() => demoAdapter.addTable({ name: 'Unauthorized', capacity: 2, area: 'Indoor' }, 'dalisay-heritage'), /do not have permission/);
    assert.throws(() => demoAdapter.getTables('dalisay-heritage'), /do not have permission/);
  } finally {
    restore();
  }
});

test('menu stock reaches the customer menu as Sold Out at zero and restores from the same quantity', () => {
  const restore = installDemoSession();
  try {
    const updated = demoAdapter.updateMenuItemStock('menu-1', 0, 'Prep stock depleted', 'dalisay-heritage');
    assert.equal(updated.availability, 'sold_out');
    assert.equal(updated.isAvailable, false);
    assert.equal(demoAdapter.getRestaurant('dalisay-heritage').menu.find((item) => item.id === 'menu-1').availability, 'sold_out');

    const restored = demoAdapter.updateMenuItemStock('menu-1', 4, 'Received replenishment', 'dalisay-heritage');
    assert.equal(restored.stockQuantity, 4);
    assert.equal(restored.availability, 'available');
    assert.equal(restored.isAvailable, true);
  } finally {
    restore();
  }
});

test('reservation staff cannot invoke inventory stock actions', () => {
  const restore = installDemoSession({ id: 6, email: 'reservation.staff@salo.ph', role: 'customer' });
  try {
    assert.throws(
      () => demoAdapter.receiveInventoryStock('inv-oil', 1, 'dalisay-heritage'),
      /do not have permission/,
    );
  } finally {
    restore();
  }
});
