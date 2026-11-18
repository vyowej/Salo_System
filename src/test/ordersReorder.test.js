import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import {
  mapOrderItemsForReorder,
  resolveReorderItems,
} from '../features/customer/utils/reorderOrder.js';

test('mapOrderItemsForReorder maps backend order_items including menu_item_id, quantity, and add-ons', () => {
  const mapped = mapOrderItemsForReorder([
    {
      order_item_id: 101,
      menu_item_id: 42,
      item_name: 'Chicken Adobo',
      unit_price: 185,
      quantity: 2,
      line_total: 370,
      add_ons: [{ id: '9', name: 'Extra Rice', price: 35 }],
    },
    {
      order_item_id: 102,
      menu_item_id: null,
      item_name: 'Deleted Seasonal Dish',
      unit_price: 220,
      quantity: 1,
      line_total: 220,
    },
  ]);

  assert.equal(mapped.length, 2);
  assert.deepEqual(mapped[0], {
    orderItemId: '101',
    menuItemId: '42',
    name: 'Chicken Adobo',
    price: 185,
    quantity: 2,
    addOns: [{ id: '9', name: 'Extra Rice', price: 35 }],
  });
  assert.equal(mapped[1].menuItemId, null);
  assert.equal(mapped[1].name, 'Deleted Seasonal Dish');
});

test('resolveReorderItems includes only available live menu items and skips deleted/unavailable ones', () => {
  const orderItems = mapOrderItemsForReorder([
    {
      order_item_id: 1,
      menu_item_id: 10,
      item_name: 'Pork Sisig',
      unit_price: 199,
      quantity: 2,
      add_ons: [
        { id: '1', name: 'Egg', price: 20 },
        { id: '2', name: 'Sold Out Side', price: 40 },
      ],
    },
    {
      order_item_id: 2,
      menu_item_id: 11,
      item_name: 'Out of Stock Halo-Halo',
      unit_price: 120,
      quantity: 1,
    },
    {
      order_item_id: 3,
      menu_item_id: null,
      item_name: 'Removed Item',
      unit_price: 150,
      quantity: 1,
    },
    {
      order_item_id: 4,
      menu_item_id: 999,
      item_name: 'Inactive Item',
      unit_price: 180,
      quantity: 1,
    },
  ]);

  const liveRestaurant = {
    id: '5',
    name: 'Casa Salo',
    logoImage: '/logo.png',
    availability: { temporarily_unavailable: false },
    operatingSchedule: { acceptingOrders: true },
    menu: [
      {
        id: '10',
        name: 'Pork Sisig',
        price: 210,
        photo: '/sisig.png',
        isAvailable: true,
        addOns: [
          {
            id: 'g1',
            name: 'Extras',
            options: [
              { id: '1', name: 'Egg', price: 20, isAvailable: true },
              { id: '2', name: 'Sold Out Side', price: 40, isAvailable: false },
            ],
          },
        ],
      },
      {
        id: '11',
        name: 'Out of Stock Halo-Halo',
        price: 120,
        photo: null,
        isAvailable: false,
        addOns: [],
      },
    ],
  };

  const result = resolveReorderItems(orderItems, liveRestaurant);
  assert.equal(result.unavailableReason, null);
  assert.equal(result.cartItems.length, 1);
  assert.deepEqual(result.cartItems[0], {
    id: '10',
    name: 'Pork Sisig',
    price: 210,
    quantity: 2,
    restaurantId: '5',
    restaurantName: 'Casa Salo',
    image: '/sisig.png',
    selectedAddOns: [{ id: '1', name: 'Egg', price: 20 }],
  });
  assert.deepEqual(result.skippedItems, [
    'Out of Stock Halo-Halo',
    'Removed Item',
    'Inactive Item',
  ]);
  assert.deepEqual(result.unavailableAddOns, ['Pork Sisig: Sold Out Side']);
  assert.equal(result.requiresReview, true);
});

test('resolveReorderItems blocks reorder when restaurant is unavailable or not accepting orders', () => {
  const orderItems = mapOrderItemsForReorder([
    { order_item_id: 1, menu_item_id: 10, item_name: 'Sisig', unit_price: 200, quantity: 1 },
  ]);

  const missingResult = resolveReorderItems(orderItems, null);
  assert.equal(missingResult.cartItems.length, 0);
  assert.match(missingResult.unavailableReason, /unavailable/i);

  const closedResult = resolveReorderItems(orderItems, {
    id: '5',
    name: 'Casa Salo',
    availability: { temporarily_unavailable: true },
    operatingSchedule: { acceptingOrders: false },
    menu: [{ id: '10', name: 'Sisig', price: 200, isAvailable: true }],
  });
  assert.equal(closedResult.cartItems.length, 0);
  assert.match(closedResult.unavailableReason, /not accepting orders/i);
});

test('OrdersPage does not hardcode empty items array and validates reorder via detail and menu endpoints', async () => {
  const source = await fs.readFile(
    new URL('../features/customer/pages/OrdersPage.jsx', import.meta.url),
    'utf8',
  );

  assert.doesNotMatch(source, /items:\s*\[\]/);
  assert.match(source, /mapOrderItemsForReorder/);
  assert.match(source, /fetchOrderDetail/);
  assert.match(source, /getRestaurantById/);
  assert.match(source, /resolveReorderItems/);
});
