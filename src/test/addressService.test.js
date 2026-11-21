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
  assert.equal('recipientName' in mapped, false);
  assert.equal('mobileNumber' in mapped, false);
  assert.equal('phone' in mapped, false);
  assert.equal(mapped.notes, 'Blue gate');
  assert.equal(mapped.lat, 14.6321);
});

test('addressService: toBackendAddressPayload normalizes frontend fields for /api/customer/addresses', () => {
  const payload = toBackendAddressPayload({
    label: ' Work ',
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
  assert.equal('recipient_name' in payload, false);
  assert.equal('recipient_phone' in payload, false);
  assert.equal(payload.landmark, 'Lobby desk');
  assert.equal(payload.is_default, true);
});

test('customerService: unbacked Category B collections return honest empty arrays', () => {
  assert.deepEqual(customerService.getOrders(), []);
  assert.deepEqual(customerService.getReservations(), []);
  assert.deepEqual(customerService.getFavoriteRestaurants(), []);
  assert.deepEqual(customerService.getNotifications(), []);
});

test('addressService.fetchAddresses deduplicates concurrent in-flight requests and allows subsequent fresh calls', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;

  try {
    globalThis.fetch = async (url) => {
      if (String(url).endsWith('/customer/addresses')) {
        fetchCount += 1;
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              addresses: [
                {
                  id: 1,
                  address_id: 10,
                  label: 'Home',
                  is_default: true,
                  province: 'Metro Manila',
                  city: 'Quezon City',
                  barangay: 'Bagumbayan',
                  street: '123 Main St',
                },
              ],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('{}', { status: 404 });
    };

    addressService.clearCache();
    const [resA, resB] = await Promise.all([
      addressService.fetchAddresses(),
      addressService.fetchAddresses(),
    ]);

    assert.equal(fetchCount, 1);
    assert.equal(resA.length, 1);
    assert.equal(resB.length, 1);

    // Subsequent call after first settled triggers a new request
    await addressService.fetchAddresses();
    assert.equal(fetchCount, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
