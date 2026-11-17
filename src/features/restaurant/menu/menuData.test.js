import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getMenuCustomerPrice,
  normalizeMenuAvailability,
  normalizeMenuCategories,
  normalizeMenuItem,
  validateMenuItem,
} from './menuData.js';

test('menu normalization preserves legacy availability and maps old add-on rules', () => {
  const legacy = normalizeMenuItem({
    isAvailable: false,
    addOns: [{ name: 'Toppings', required: false, options: [{ name: 'Cheese' }, { name: 'Olives' }] }],
  });

  assert.equal(legacy.availability, 'sold_out');
  assert.equal(legacy.isAvailable, false);
  assert.equal(legacy.addOns[0].minSelection, 0);
  assert.equal(legacy.addOns[0].maxSelection, 2);
  assert.equal(normalizeMenuAvailability({ availability: 'temporarily_unavailable' }), 'temporarily_unavailable');
});

test('legacy string categories and structured visibility/order normalize consistently', () => {
  assert.deepEqual(normalizeMenuCategories({ categories: ['Mains', 'Drinks'] }), [
    { id: 'category-0-mains', name: 'Mains', visible: true, sortOrder: 0 },
    { id: 'category-1-drinks', name: 'Drinks', visible: true, sortOrder: 1 },
  ]);
  assert.deepEqual(normalizeMenuCategories({
    menuCategories: [
      { id: 'b', name: 'B', visible: true, sortOrder: 1 },
      { id: 'a', name: 'A', visible: false, sortOrder: 0 },
    ],
  }).map(({ id, name, visible }) => ({ id, name, visible })), [
    { id: 'a', name: 'A', visible: false },
    { id: 'b', name: 'B', visible: true },
  ]);
});

test('item validation rejects invalid pricing, discounts, and add-on bounds', () => {
  const item = {
    name: 'Pasta',
    category: 'Mains',
    availability: 'available',
    price: 250,
    discountedPrice: 250,
    addOns: [{ name: 'Extras', minSelection: 3, maxSelection: 2, options: [{ name: 'Cheese', price: -1 }] }],
  };
  const errors = validateMenuItem(item);

  assert.match(errors.discountedPrice, /lower than the regular price/);
  assert.match(errors.addOnGroup0, /selection limits/);
  assert.equal(getMenuCustomerPrice({ price: 250, discountedPrice: 200 }), 200);
  assert.equal(getMenuCustomerPrice({ price: 250 }), 250);
});

test('valid add-on limits permit optional and required groups', () => {
  assert.deepEqual(validateMenuItem({
    name: 'Rice bowl',
    category: 'Mains',
    availability: 'available',
    price: 195,
    discountedPrice: '',
    addOns: [
      { name: 'Rice', minSelection: 1, maxSelection: 1, options: [{ name: 'Garlic', price: 0 }] },
      { name: 'Extras', minSelection: 0, maxSelection: 2, options: [{ name: 'Egg', price: 20 }] },
    ],
  }), {});
});
