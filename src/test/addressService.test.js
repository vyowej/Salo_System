import test from 'node:test';
import assert from 'node:assert/strict';
import addressService, { mapBackendAddress, toBackendAddressPayload } from '../services/addressService.js';
import customerService from '../services/customerService.js';

test('addressService: starts with empty cache and maps backend address rows', () => {
  addressService.clearCache();
  assert.deepEqual(addressService.getAddresses(), []);
  assert.equal(addressService.getDefaultAddress(), null);

  const mapped = mapBackendAddress({
    id: 42,
    address_id: 99,
    label: 'Home',
    is_default: true,
    recipient_name: 'Maria Santos',
    recipient_phone: '09171234567',
    province: 'Metro Manila',
    city: 'Quezon City',
    barangay: 'Laging Handa',
    street: '42 Scout Gandia St.',
    landmark: 'Blue gate',
    postal_code: '1103',
    latitude: 14.6321,
    longitude: 121.0312,
    is_service_area_supported: true,
    service_area_message: null,
  });

  assert.equal(mapped.id, 42);
  assert.equal(mapped.isDefault, true);
  assert.equal(mapped.mobileNumber, '09171234567');
  assert.equal(mapped.notes, 'Blue gate');
  assert.equal(mapped.lat, 14.6321);
});

test('addressService: toBackendAddressPayload normalizes frontend fields for /api/customer/addresses', () => {
  const payload = toBackendAddressPayload({
    label: ' Work ',
    recipientName: ' Juan Dela Cruz ',
    mobileNumber: '09181112222',
    province: 'Metro Manila',
    city: 'Makati City',
    barangay: 'Bel-Air',
    street: 'Ayala Ave',
    notes: 'Lobby desk',
    postalCode: '1209',
    lat: 14.5547,
    lng: 121.0244,
    isDefault: true,
  });

  assert.equal(payload.label, 'Work');
  assert.equal(payload.recipient_name, 'Juan Dela Cruz');
  assert.equal(payload.recipient_phone, '09181112222');
  assert.equal(payload.landmark, 'Lobby desk');
  assert.equal(payload.is_default, true);
});

test('customerService: unbacked Category B collections return honest empty arrays', () => {
  assert.deepEqual(customerService.getOrders(), []);
  assert.deepEqual(customerService.getReservations(), []);
  assert.deepEqual(customerService.getFavoriteRestaurants(), []);
  assert.deepEqual(customerService.getNotifications(), []);
});
