import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCheckoutPayload,
  findAddressBySelectionId,
  getCheckoutAddressId,
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
