import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import {
  buildRiderMapState,
  isValidCoordPair,
} from '../features/rider/utils/riderMapData.js';

test('isValidCoordPair validates coordinate ranges and rejects missing/NaN values', () => {
  assert.equal(isValidCoordPair(14.5995, 120.9842), true);
  assert.equal(isValidCoordPair('14.5995', '120.9842'), true);
  assert.equal(isValidCoordPair(null, 120.9842), false);
  assert.equal(isValidCoordPair('', 120.9842), false);
  assert.equal(isValidCoordPair(Number.NaN, 120.9842), false);
  assert.equal(isValidCoordPair(95, 120.9842), false);
  assert.equal(isValidCoordPair(14.5995, 190), false);
});

test('buildRiderMapState handles no active delivery, missing backend coordinates, and full coordinates', () => {
  // 1. No delivery, no GPS
  const empty = buildRiderMapState({ delivery: null, riderLocation: null });
  assert.equal(empty.markers.length, 0);
  assert.equal(empty.route, null);
  assert.equal(empty.missingCoordinatesNotice, '');

  // 2. No delivery, live GPS present
  const gpsOnly = buildRiderMapState({
    delivery: null,
    riderLocation: { lat: 14.61, lng: 121.02, accuracy: 12 },
  });
  assert.equal(gpsOnly.markers.length, 1);
  assert.equal(gpsOnly.markers[0].type, 'rider');
  assert.deepEqual(gpsOnly.center, { lat: 14.61, lng: 121.02 });
  assert.equal(gpsOnly.route, null);

  // 3. Active delivery without pickup/dropoff coordinates (current RiderDeliveryService response)
  const noStopCoords = buildRiderMapState({
    delivery: {
      delivery_id: 5,
      order_id: 12,
      restaurant_name: 'Casa Salo',
      pickup_address_text: '123 Main St',
      customer_name: 'Juan',
      dropoff_address_text: '456 Side St',
    },
    riderLocation: { lat: 14.61, lng: 121.02, accuracy: 10 },
  });
  assert.equal(noStopCoords.markers.length, 1);
  assert.equal(noStopCoords.pickupMarker, null);
  assert.equal(noStopCoords.dropoffMarker, null);
  assert.equal(noStopCoords.route, null);
  assert.match(noStopCoords.missingCoordinatesNotice, /coordinates are not provided/i);

  // 4. Active delivery with valid pickup & dropoff coordinates + invalid rider coords
  const withStops = buildRiderMapState({
    delivery: {
      restaurant_name: 'Casa Salo',
      pickup_address_text: '123 Main St',
      pickup_latitude: 14.6,
      pickup_longitude: 121.0,
      customer_name: 'Juan',
      dropoff_address_text: '456 Side St',
      dropoff_latitude: 14.62,
      dropoff_longitude: 121.03,
    },
    riderLocation: { lat: 999, lng: 121.01 },
  });
  assert.equal(withStops.riderMarker, null);
  assert.equal(withStops.markers.length, 2);
  assert.equal(withStops.pickupMarker.type, 'pickup');
  assert.equal(withStops.dropoffMarker.type, 'dropoff');
  assert.deepEqual(withStops.route, {
    origin: { lat: 14.6, lng: 121.0 },
    destination: { lat: 14.62, lng: 121.03 },
    waypoints: [],
  });
  assert.equal(withStops.missingCoordinatesNotice, '');
});

test('RiderMapPage reuses SharedMap and RiderGpsContext without duplicating GPS tracker', async () => {
  const mapSource = await fs.readFile(
    new URL('../features/rider/pages/RiderMapPage.jsx', import.meta.url),
    'utf8',
  );
  const layoutSource = await fs.readFile(
    new URL('../layouts/RiderLayout.jsx', import.meta.url),
    'utf8',
  );

  assert.match(mapSource, /SharedMap/);
  assert.match(mapSource, /riderService\.getCurrentDelivery/);
  assert.match(mapSource, /useRiderGps/);
  assert.match(mapSource, /salo:riderUpdated/);
  assert.doesNotMatch(mapSource, /useRiderGpsTracker/);
  assert.doesNotMatch(mapSource, /Turn-by-turn/i);

  assert.match(layoutSource, /RiderGpsContext\.Provider/);
});
