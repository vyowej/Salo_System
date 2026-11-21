import test from 'node:test';
import assert from 'node:assert/strict';
import contactNumberService, { mapBackendContact } from '../services/contactNumberService.js';
import accountService from '../services/accountService.js';
import { buildCheckoutPayload } from '../features/customer/utils/checkoutAddressValidation.js';

test('mapBackendContact normalizes backend contact fields', () => {
  const mapped = mapBackendContact({
    contact_id: 12,
    id: 12,
    label: 'Work',
    phone_number: '09181234567',
    is_default: 1,
    created_at: '2026-11-21T10:00:00Z',
  });

  assert.deepEqual(mapped, {
    id: 12,
    contactId: 12,
    label: 'Work',
    phoneNumber: '09181234567',
    isDefault: true,
    createdAt: '2026-11-21T10:00:00Z',
  });
});

test('contactNumberService isolates cache per userId and clears on logout/account switch', async () => {
  const originalGet = accountService.getContactNumbers;
  let activeAccount = 'user-1';
  accountService.getContactNumbers = async () =>
    activeAccount === 'user-1'
      ? [{ id: 1, contact_id: 1, label: 'Personal', phone_number: '09171111111', is_default: true }]
      : [{ id: 2, contact_id: 2, label: 'Work', phone_number: '09182222222', is_default: true }];

  try {
    contactNumberService.clearCache();
    assert.equal(contactNumberService.isLoadedFor(1), false);

    await contactNumberService.fetchContactNumbers(1);
    assert.equal(contactNumberService.isLoadedFor(1), true);
    assert.equal(contactNumberService.isLoadedFor(2), false);
    assert.equal(contactNumberService.getDefaultContactNumber()?.phoneNumber, '09171111111');

    // Switch to user 2
    activeAccount = 'user-2';
    await contactNumberService.fetchContactNumbers(2);
    assert.equal(contactNumberService.isLoadedFor(2), true);
    assert.equal(contactNumberService.isLoadedFor(1), false);
    assert.equal(contactNumberService.getContactNumbers().length, 1);
    assert.equal(contactNumberService.getDefaultContactNumber()?.phoneNumber, '09182222222');

    // Logout clears cache
    contactNumberService.clearCache();
    assert.equal(contactNumberService.isLoadedFor(2), false);
    assert.deepEqual(contactNumberService.getContactNumbers(), []);
    assert.equal(contactNumberService.getDefaultContactNumber(), null);
  } finally {
    accountService.getContactNumbers = originalGet;
    contactNumberService.clearCache();
  }
});

test('buildCheckoutPayload includes contact_number_id when selected', () => {
  const payload = buildCheckoutPayload({
    restaurantGroups: [
      {
        restaurantId: 10,
        restaurantName: 'Test Kitchen',
        fulfillment: 'delivery',
        deliveryAddress: { id: 1, addressId: 42 },
        deliveryFee: 49,
        items: [{ id: 100, name: 'Adobo', price: 150, quantity: 1 }],
      },
    ],
    idempotencyKey: 'idem-contact-test-1234',
    contactNumberId: 7,
  });

  assert.equal(payload.contact_number_id, 7);
});
