import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCheckoutPayload,
  DELIVERY_NOTES_MAX_LENGTH,
  expandRestaurantGroupsToSubOrders,
  findAddressBySelectionId,
  getCheckoutAddressId,
  isValidPhilippineMobile,
  normalizePhilippineMobile,
  parseCheckoutValidationErrors,
  validateDeliveryContactPhone,
  validateDeliveryNotes,
  validateGroupDeliveryAddress,
} from '../features/customer/utils/checkoutAddressValidation.js';

const SAVED_ADDRESSES = [
  {
    id: 1, // user_addresses.user_address_id
    addressId: 42, // addresses.address_id
    label: 'Home',
    street: 'Toribio Drive',
    city: 'Zamboanga City',
    isDefault: true,
    notes: 'Blue gate',
  },
  {
    id: 2,
    addressId: 99,
    label: 'Work',
    street: 'Gov. Alvarez Ave',
    city: 'Zamboanga City',
    isDefault: false,
    notes: 'Lobby guard',
  },
];

test('findAddressBySelectionId matches numeric address IDs against string select values', () => {
  const matched = findAddressBySelectionId(SAVED_ADDRESSES, '2');
  assert.ok(matched);
  assert.equal(matched.id, 2);
  assert.equal(matched.addressId, 99);
  assert.equal(findAddressBySelectionId(SAVED_ADDRESSES, ''), null);
  assert.equal(findAddressBySelectionId(SAVED_ADDRESSES, '999'), null);
});

test('getCheckoutAddressId prefers addresses.address_id (addressId) over user_address_id (id)', () => {
  assert.equal(getCheckoutAddressId(SAVED_ADDRESSES[0]), 42);
  assert.equal(getCheckoutAddressId(SAVED_ADDRESSES[1]), 99);
  assert.equal(getCheckoutAddressId(null), null);
});

test('validateGroupDeliveryAddress validates default/selected addresses, loading state, and deleted addresses', () => {
  const validGroup = {
    restaurantId: 10,
    fulfillment: 'delivery',
    deliveryAddress: SAVED_ADDRESSES[0],
  };

  const ok = validateGroupDeliveryAddress(validGroup, SAVED_ADDRESSES, false);
  assert.equal(ok.isValid, true);
  assert.equal(ok.error, null);
  assert.equal(ok.addressId, 42);

  // While saved addresses are still loading, do not show a premature error
  const loadingRes = validateGroupDeliveryAddress(
    { restaurantId: 10, fulfillment: 'delivery', deliveryAddress: null },
    [],
    true
  );
  assert.equal(loadingRes.isValid, true);

  // Once loaded with no addresses, fail with clear prompt
  const emptyRes = validateGroupDeliveryAddress(
    { restaurantId: 10, fulfillment: 'delivery', deliveryAddress: null },
    [],
    false
  );
  assert.equal(emptyRes.isValid, false);
  assert.match(emptyRes.error, /No saved delivery addresses found/);

  // When selected address is deleted from savedAddresses, trigger the exact error
  const deletedRes = validateGroupDeliveryAddress(validGroup, [SAVED_ADDRESSES[1]], false);
  assert.equal(deletedRes.isValid, false);
  assert.equal(deletedRes.error, 'The selected delivery address was not found in your saved addresses.');

  // Pickup sub-orders do not require a delivery address
  const pickupRes = validateGroupDeliveryAddress(
    { restaurantId: 11, fulfillment: 'pickup', deliveryAddress: null },
    [],
    false
  );
  assert.equal(pickupRes.isValid, true);
});

test('buildCheckoutPayload sends independent addresses.address_id values per sub-order', () => {
  const payload = buildCheckoutPayload({
    idempotencyKey: 'idem-123',
    orderNotes: '',
    restaurantGroups: [
      {
        restaurantId: 101,
        fulfillment: 'delivery',
        deliveryAddress: SAVED_ADDRESSES[0],
        items: [{ id: 5, quantity: 2 }],
      },
      {
        restaurantId: 102,
        fulfillment: 'delivery',
        deliveryAddress: SAVED_ADDRESSES[1],
        items: [{ id: 8, quantity: 1 }],
      },
    ],
  });

  assert.equal(payload.groups[0].restaurant_id, 101);
  assert.equal(payload.groups[0].address_id, 42);
  assert.equal(payload.groups[1].restaurant_id, 102);
  assert.equal(payload.groups[1].address_id, 99);
});

test('buildCheckoutPayload merges identical menu items with identical configurations and preserves expected_total', () => {
  const payload = buildCheckoutPayload({
    idempotencyKey: 'idem-identical-items',
    orderNotes: '',
    restaurantGroups: [
      {
        restaurantId: 101,
        fulfillment: 'delivery',
        deliveryAddress: SAVED_ADDRESSES[0],
        deliveryFee: 49,
        items: [
          { id: 5, name: 'Classic Burger', price: 120, quantity: 2, selectedAddOns: [] },
          { id: 5, name: 'Classic Burger', price: 120, quantity: 1 },
          {
            id: 6,
            name: 'Milk Tea',
            price: 90,
            quantity: 1,
            selectedAddOns: [
              { id: '11', name: 'Pearls', price: 15 },
              { id: '12', name: 'Pudding', price: 20 },
            ],
          },
          {
            id: 6,
            name: 'Milk Tea',
            price: 90,
            quantity: 2,
            selectedAddOns: [
              { id: '12', name: 'Pudding', price: 20 },
              { id: '11', name: 'Pearls', price: 15 },
            ],
          },
        ],
      },
    ],
  });

  assert.deepEqual(payload.groups[0].items, [
    { menu_item_id: 5, quantity: 3 },
    { menu_item_id: 6, quantity: 3, add_on_option_ids: [11, 12] },
  ]);
  // (120 * 3) + ((90 + 15 + 20) * 3) + 49 = 360 + 375 + 49 = 784
  assert.equal(payload.groups[0].expected_total, 784);
});

test('buildCheckoutPayload keeps separate order lines for identical menu items with different add-ons', () => {
  const payload = buildCheckoutPayload({
    idempotencyKey: 'idem-diff-addons',
    restaurantGroups: [
      {
        restaurantId: 101,
        fulfillment: 'delivery',
        deliveryAddress: SAVED_ADDRESSES[0],
        deliveryFee: 49,
        subtotal: 380,
        items: [
          {
            id: 5,
            name: 'Chicken Rice',
            price: 120,
            quantity: 1,
            selectedAddOns: [{ id: 1, name: 'Extra Egg', price: 20 }],
          },
          {
            id: 5,
            name: 'Chicken Rice',
            price: 120,
            quantity: 2,
            selectedAddOns: [{ id: 2, name: 'Extra Rice', price: 0 }],
          },
        ],
      },
    ],
  });

  assert.deepEqual(payload.groups[0].items, [
    { menu_item_id: 5, quantity: 1, add_on_option_ids: [1] },
    { menu_item_id: 5, quantity: 2, add_on_option_ids: [2] },
  ]);
  assert.equal(payload.groups[0].expected_total, 429);

  assert.throws(
    () =>
      buildCheckoutPayload({
        idempotencyKey: 'idem-missing-addon-id',
        restaurantGroups: [
          {
            restaurantId: 101,
            fulfillment: 'pickup',
            items: [
              {
                id: 7,
                name: 'Iced Coffee',
                price: 100,
                quantity: 1,
                selectedAddOns: [{ name: 'Oat Milk', price: 25 }],
              },
            ],
          },
        ],
      }),
    (err) => err.code === 'MISSING_ADDON_OPTION_ID'
  );
});

test('buildCheckoutPayload preserves single-restaurant single-address checkout behavior', () => {
  const payload = buildCheckoutPayload({
    idempotencyKey: 'idem-single-single',
    restaurantGroups: [
      {
        restaurantId: 10,
        restaurantName: 'Solo Grill',
        fulfillment: 'delivery',
        addressMode: 'single',
        deliveryAddress: SAVED_ADDRESSES[0],
        baseDeliveryFee: 49,
        deliveryFee: 49,
        subtotal: 300,
        items: [
          { id: 1, name: 'Chicken Inasal', price: 150, quantity: 2 },
        ],
      },
    ],
  });

  assert.equal(payload.groups.length, 1);
  assert.deepEqual(payload.groups[0], {
    restaurant_id: 10,
    fulfillment: 'delivery',
    address_id: 42,
    delivery_notes: 'Blue gate',
    expected_total: 349,
    items: [{ menu_item_id: 1, quantity: 2 }],
  });
});

test('buildCheckoutPayload splits single restaurant with multiple addresses into separate sub-orders with accurate fees and totals', () => {
  const restaurantGroups = [
    {
      restaurantId: 10,
      restaurantName: 'Solo Grill',
      fulfillment: 'delivery',
      addressMode: 'multiple',
      deliveryAddress: SAVED_ADDRESSES[0],
      baseDeliveryFee: 49,
      deliveryFee: 98,
      subtotal: 410,
      items: [
        { id: 1, name: 'Chicken Inasal', price: 150, quantity: 2, deliveryAddress: SAVED_ADDRESSES[0] },
        { id: 2, name: 'Pork Sisig', price: 110, quantity: 1, deliveryAddress: SAVED_ADDRESSES[1] },
      ],
      addressGroups: [
        {
          addressId: 1,
          address: SAVED_ADDRESSES[0],
          items: [{ id: 1, name: 'Chicken Inasal', price: 150, quantity: 2, itemTotal: 300 }],
          subtotal: 300,
          deliveryFee: 49,
        },
        {
          addressId: 2,
          address: SAVED_ADDRESSES[1],
          items: [{ id: 2, name: 'Pork Sisig', price: 110, quantity: 1, itemTotal: 110 }],
          subtotal: 110,
          deliveryFee: 49,
        },
      ],
    },
  ];

  const subOrders = expandRestaurantGroupsToSubOrders(restaurantGroups);
  assert.equal(subOrders.length, 2);
  assert.equal(validateGroupDeliveryAddress(subOrders[0], SAVED_ADDRESSES, false).addressId, 42);
  assert.equal(validateGroupDeliveryAddress(subOrders[1], SAVED_ADDRESSES, false).addressId, 99);

  const payload = buildCheckoutPayload({
    idempotencyKey: 'idem-single-multi',
    restaurantGroups,
  });

  assert.equal(payload.groups.length, 2);
  assert.deepEqual(payload.groups[0], {
    restaurant_id: 10,
    fulfillment: 'delivery',
    address_id: 42,
    delivery_notes: 'Blue gate',
    expected_total: 349,
    items: [{ menu_item_id: 1, quantity: 2 }],
  });
  assert.deepEqual(payload.groups[1], {
    restaurant_id: 10,
    fulfillment: 'delivery',
    address_id: 99,
    delivery_notes: 'Lobby guard',
    expected_total: 159,
    items: [{ menu_item_id: 2, quantity: 1 }],
  });

  const combinedExpectedTotal = payload.groups.reduce((sum, g) => sum + g.expected_total, 0);
  assert.equal(combinedExpectedTotal, 410 + 98);
});

test('buildCheckoutPayload handles multiple restaurants with different and split addresses without losing items', () => {
  const restaurantGroups = [
    {
      restaurantId: 10,
      restaurantName: 'Resto A',
      fulfillment: 'delivery',
      addressMode: 'multiple',
      baseDeliveryFee: 49,
      deliveryFee: 98,
      subtotal: 250,
      addressGroups: [
        {
          addressId: 1,
          address: SAVED_ADDRESSES[0],
          items: [{ id: 101, name: 'Item A1', price: 100, quantity: 1 }],
          subtotal: 100,
          deliveryFee: 49,
        },
        {
          addressId: 2,
          address: SAVED_ADDRESSES[1],
          items: [{ id: 101, name: 'Item A1', price: 100, quantity: 1 }, { id: 102, name: 'Item A2', price: 50, quantity: 1 }],
          subtotal: 150,
          deliveryFee: 49,
        },
      ],
    },
    {
      restaurantId: 20,
      restaurantName: 'Resto B',
      fulfillment: 'delivery',
      addressMode: 'single',
      deliveryAddress: SAVED_ADDRESSES[1],
      deliveryFee: 49,
      subtotal: 200,
      items: [{ id: 201, name: 'Item B1', price: 200, quantity: 1 }],
    },
    {
      restaurantId: 30,
      restaurantName: 'Resto C',
      fulfillment: 'pickup',
      deliveryAddress: null,
      deliveryFee: 0,
      subtotal: 80,
      items: [{ id: 301, name: 'Item C1', price: 80, quantity: 1 }],
    },
  ];

  const payload = buildCheckoutPayload({
    idempotencyKey: 'idem-multi-resto-multi-addr',
    restaurantGroups,
  });

  assert.equal(payload.groups.length, 4);
  assert.equal(payload.groups[0].restaurant_id, 10);
  assert.equal(payload.groups[0].address_id, 42);
  assert.equal(payload.groups[0].expected_total, 149);
  assert.deepEqual(payload.groups[0].items, [{ menu_item_id: 101, quantity: 1 }]);

  assert.equal(payload.groups[1].restaurant_id, 10);
  assert.equal(payload.groups[1].address_id, 99);
  assert.equal(payload.groups[1].expected_total, 199);
  assert.deepEqual(payload.groups[1].items, [
    { menu_item_id: 101, quantity: 1 },
    { menu_item_id: 102, quantity: 1 },
  ]);

  assert.equal(payload.groups[2].restaurant_id, 20);
  assert.equal(payload.groups[2].address_id, 99);
  assert.equal(payload.groups[2].expected_total, 249);

  assert.equal(payload.groups[3].restaurant_id, 30);
  assert.equal(payload.groups[3].fulfillment, 'pickup');
  assert.equal(payload.groups[3].address_id, null);
  assert.equal(payload.groups[3].expected_total, 80);
});

test('validateDeliveryContactPhone enforces valid Philippine mobile for delivery orders and allows pickup without phone', () => {
  const deliverySubOrders = [{ restaurantId: 10, fulfillment: 'delivery' }];
  const pickupSubOrders = [{ restaurantId: 10, fulfillment: 'pickup' }];

  assert.equal(normalizePhilippineMobile('+63 917-123-4567'), '09171234567');
  assert.equal(isValidPhilippineMobile('09171234567'), true);
  assert.equal(isValidPhilippineMobile('12345'), false);

  const valid = validateDeliveryContactPhone({ phone_number: '+639171234567' }, deliverySubOrders);
  assert.equal(valid.isValid, true);
  assert.equal(valid.phone, '09171234567');

  const missing = validateDeliveryContactPhone({ phone_number: null }, deliverySubOrders);
  assert.equal(missing.isValid, false);
  assert.match(missing.error, /contact phone number is required/i);

  const invalid = validateDeliveryContactPhone({ phone_number: '08171234567' }, deliverySubOrders);
  assert.equal(invalid.isValid, false);
  assert.match(invalid.error, /valid Philippine mobile number/i);

  const pickupOk = validateDeliveryContactPhone({ phone_number: null }, pickupSubOrders);
  assert.equal(pickupOk.isValid, true);
  assert.equal(pickupOk.phone, null);
});

test('validateDeliveryNotes enforces 500-char limit and allows empty notes', () => {
  assert.equal(DELIVERY_NOTES_MAX_LENGTH, 500);
  const subOrders = [{ subOrderKey: '10:single', restaurantName: 'Resto A' }];

  assert.equal(validateDeliveryNotes({ orderNotes: '', subOrders }).isValid, true);
  assert.equal(validateDeliveryNotes({ orderNotes: 'a'.repeat(500), subOrders }).isValid, true);

  const tooLongGeneral = validateDeliveryNotes({ orderNotes: 'a'.repeat(501), subOrders });
  assert.equal(tooLongGeneral.isValid, false);
  assert.match(tooLongGeneral.errors.general, /500/);

  const tooLongSubOrder = validateDeliveryNotes({
    orderNotes: '',
    orderNotesBySubOrder: { '10:single': 'b'.repeat(501) },
    subOrders,
  });
  assert.equal(tooLongSubOrder.isValid, false);
  assert.match(tooLongSubOrder.errors['10:single'], /500/);
});

test('buildCheckoutPayload preserves separate delivery_notes per restaurant and address sub-order', () => {
  const restaurantGroups = [
    {
      restaurantId: 10,
      restaurantName: 'Resto A',
      fulfillment: 'delivery',
      addressMode: 'multiple',
      baseDeliveryFee: 49,
      addressGroups: [
        {
          addressId: 1,
          address: SAVED_ADDRESSES[0],
          items: [{ id: 1, name: 'Inasal', price: 150, quantity: 1 }],
          subtotal: 150,
          deliveryFee: 49,
        },
        {
          addressId: 2,
          address: SAVED_ADDRESSES[1],
          items: [{ id: 2, name: 'Sisig', price: 120, quantity: 1 }],
          subtotal: 120,
          deliveryFee: 49,
        },
      ],
    },
  ];

  const payload = buildCheckoutPayload({
    idempotencyKey: 'idem-notes-per-suborder',
    orderNotes: 'Fallback note',
    orderNotesBySubOrder: {
      '10:addr:1': 'Leave with security guard',
      '10:addr:2': 'Call upon arrival at lobby',
    },
    restaurantGroups,
  });

  assert.equal(payload.groups[0].delivery_notes, 'Leave with security guard');
  assert.equal(payload.groups[1].delivery_notes, 'Call upon arrival at lobby');

  const emptyNotesPayload = buildCheckoutPayload({
    idempotencyKey: 'idem-notes-empty',
    orderNotes: '   ',
    restaurantGroups: [
      {
        restaurantId: 10,
        fulfillment: 'pickup',
        items: [{ id: 1, price: 100, quantity: 1 }],
      },
    ],
  });
  assert.equal(emptyNotesPayload.groups[0].delivery_notes, null);
});

test('parseCheckoutValidationErrors identifies failing sub-order and menu item for unavailable and deleted items', () => {
  const subOrders = [
    {
      subOrderKey: '10:addr:1',
      restaurantId: 10,
      restaurantName: 'Resto A',
      items: [
        { id: 101, name: 'Chicken Inasal', quantity: 1 },
        { id: 102, name: 'Halo-Halo', quantity: 1 },
      ],
    },
    {
      subOrderKey: '10:addr:2',
      restaurantId: 10,
      restaurantName: 'Resto A',
      items: [
        { id: 999, name: 'Deleted Dish', quantity: 1 },
      ],
    },
  ];
  const payloadGroups = [
    { restaurant_id: 10, items: [{ menu_item_id: 101, quantity: 1 }, { menu_item_id: 102, quantity: 1 }] },
    { restaurant_id: 10, items: [{ menu_item_id: 999, quantity: 1 }] },
  ];

  const parsedSoldOut = parseCheckoutValidationErrors(
    { 'groups.0.items.1.menu_item_id': ['Halo-Halo is currently sold out.'] },
    subOrders,
    payloadGroups
  );
  assert.equal(parsedSoldOut.hasItemErrors, true);
  assert.deepEqual(parsedSoldOut.groupErrors[0], ['Halo-Halo is currently sold out.']);
  assert.deepEqual(parsedSoldOut.itemErrorsByGroup[0][102], ['Halo-Halo is currently sold out.']);
  assert.equal(parsedSoldOut.summaryMessage, 'Resto A: Halo-Halo is currently sold out.');

  // Deleted/invalid item in second split-address sub-order enriches generic backend message with item name
  const parsedDeleted = parseCheckoutValidationErrors(
    { 'groups.1.items.0.menu_item_id': ['Menu item #999 does not belong to Resto A.'] },
    subOrders,
    payloadGroups
  );
  assert.equal(parsedDeleted.hasItemErrors, true);
  assert.equal(parsedDeleted.groupErrors[0], undefined);
  assert.deepEqual(parsedDeleted.groupErrors[1], ['Deleted Dish: Menu item #999 does not belong to Resto A.']);
  assert.deepEqual(parsedDeleted.itemErrorsByGroup[1][999], ['Deleted Dish: Menu item #999 does not belong to Resto A.']);
  assert.equal(parsedDeleted.summaryMessage, 'Deleted Dish: Menu item #999 does not belong to Resto A.');
});
