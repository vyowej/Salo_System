import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRiderMapState } from '../features/rider/utils/riderMapData.js';
import {
  isActiveOrApprovedRiderApplication,
  isRiderActiveApplicationConflictError,
  resolveRiderActiveApplicationConflictRedirect,
} from '../pages/RiderApplication/services/riderConflictHelper.js';
import riderService from '../services/riderService.js';

function createMockResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        return name.toLowerCase() === 'content-type' ? 'application/json' : null;
      },
    },
    async json() {
      return body;
    },
  };
}

test('buildRiderMapState handles no-active-delivery, accepted, and picked_up states', () => {
  // 1. No active delivery without GPS -> default Manila center, 0 markers
  const emptyNoGps = buildRiderMapState({ delivery: null, riderLocation: null });
  assert.equal(emptyNoGps.markers.length, 0);
  assert.equal(emptyNoGps.route, null);
  assert.equal(emptyNoGps.center.lat, 14.5995);

  // 2. No active delivery with GPS -> rider marker only
  const emptyWithGps = buildRiderMapState({
    delivery: null,
    riderLocation: { lat: 14.65, lng: 121.05, accuracy: 12 },
  });
  assert.equal(emptyWithGps.markers.length, 1);
  assert.equal(emptyWithGps.markers[0].id, 'rider');
  assert.equal(emptyWithGps.route, null);
  assert.equal(emptyWithGps.center.lat, 14.65);

  // 3. Accepted & picked_up delivery with pickup/dropoff coordinates -> all markers + route
  for (const status of ['accepted', 'picked_up']) {
    const state = buildRiderMapState({
      delivery: {
        order_id: 42,
        delivery_status: status,
        restaurant_name: 'Salo Grill',
        pickup_address_text: '42 Maginhawa St',
        pickup_latitude: 14.645,
        pickup_longitude: 121.06,
        customer_name: 'Juan',
        dropoff_address_text: '10 Katipunan Ave',
        dropoff_latitude: 14.635,
        dropoff_longitude: 121.075,
      },
      riderLocation: { latitude: 14.64, longitude: 121.055, accuracy: 8 },
    });

    assert.equal(state.markers.length, 3);
    assert.deepEqual(
      state.markers.map((m) => m.id),
      ['rider', 'pickup', 'dropoff'],
    );
    assert.deepEqual(state.route.origin, { lat: 14.645, lng: 121.06 });
    assert.deepEqual(state.route.destination, { lat: 14.635, lng: 121.075 });
    assert.equal(state.route.waypoints.length, 1);
    assert.equal(state.missingCoordinatesNotice, '');
  }
});

test('riderService.declineDelivery and updateProfile call expected endpoints', async () => {
  const originalFetch = globalThis.fetch;
  const originalDocument = globalThis.document;
  const calls = [];

  globalThis.document = { cookie: 'XSRF-TOKEN=test-csrf-token' };
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, method: options.method || 'GET', body: options.body || null });
    if (String(url).includes('/decline')) {
      return createMockResponse(200, {
        success: true,
        data: { order_id: 55, declined: true, already_declined: false },
      });
    }
    return createMockResponse(200, {
      success: true,
      data: {
        profile: {
          rider_id: 1,
          available_days: ['mon', 'fri'],
          preferred_shifts: ['breakfast', 'dinner'],
          preferred_hubs: 'Diliman',
        },
      },
    });
  };

  try {
    const declineResult = await riderService.declineDelivery(55);
    assert.equal(declineResult.declined, true);

    const profileResult = await riderService.updateProfile({
      available_days: ['mon', 'fri'],
      preferred_shifts: ['breakfast', 'dinner'],
      preferred_hubs: 'Diliman',
    });
    assert.deepEqual(profileResult.available_days, ['mon', 'fri']);

    assert.equal(calls[0].method, 'POST');
    assert.match(calls[0].url, /\/rider\/deliveries\/55\/decline$/);

    assert.equal(calls[1].method, 'PATCH');
    assert.match(calls[1].url, /\/rider\/profile$/);
    assert.deepEqual(JSON.parse(calls[1].body), {
      available_days: ['mon', 'fri'],
      preferred_shifts: ['breakfast', 'dinner'],
      preferred_hubs: 'Diliman',
    });
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.document = originalDocument;
  }
});

test('409 ACTIVE_APPLICATION_EXISTS conflict helpers resolve redirect and active state', () => {
  const conflictError = {
    status: 409,
    code: 'ACTIVE_APPLICATION_EXISTS',
    message: 'You already have an active or approved rider application (RID-2026-0001).',
    data: {
      rider_application_id: 88,
      application_id: 88,
      application_status: 'under_review',
    },
  };

  assert.equal(isRiderActiveApplicationConflictError(conflictError), true);
  assert.equal(isRiderActiveApplicationConflictError({ status: 422, code: 'VALIDATION_ERROR' }), false);

  const redirect = resolveRiderActiveApplicationConflictRedirect(conflictError);
  assert.deepEqual(redirect, {
    to: '/rider-application/status',
    notice: 'You already have an active or approved rider application (RID-2026-0001).',
    existingApplicationId: 88,
  });

  assert.equal(resolveRiderActiveApplicationConflictRedirect({ status: 500 }), null);
  assert.equal(isActiveOrApprovedRiderApplication({ application_status: 'approved' }), true);
  assert.equal(isActiveOrApprovedRiderApplication({ application_status: 'rejected' }), false);
});
