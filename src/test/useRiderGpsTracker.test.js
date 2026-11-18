import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import {
  buildTrackerLocationPayload,
  createRiderGpsController,
} from '../features/rider/hooks/useRiderGpsTracker.js';

function createMockGeolocation() {
  let nextWatchId = 1;
  let successCb = null;
  let errorCb = null;
  const activeWatches = new Set();
  const clearedWatches = [];

  return {
    geolocation: {
      watchPosition(onSuccess, onError) {
        const id = nextWatchId++;
        activeWatches.add(id);
        successCb = onSuccess;
        errorCb = onError;
        return id;
      },
      clearWatch(id) {
        activeWatches.delete(id);
        clearedWatches.push(id);
      },
    },
    emitPosition(pos) {
      return successCb?.(pos);
    },
    emitError(err) {
      return errorCb?.(err);
    },
    getActiveWatchCount() {
      return activeWatches.size;
    },
    getClearedWatches() {
      return clearedWatches;
    },
  };
}

test('buildTrackerLocationPayload formats exact /rider/location payload and rejects invalid coords', () => {
  const built = buildTrackerLocationPayload(
    {
      coords: {
        latitude: 14.59951234,
        longitude: 120.98421234,
        accuracy: 14.6,
        heading: 90,
        speed: 4.5,
      },
      timestamp: 1700000000000,
    },
    42,
  );

  assert.deepEqual(built.payload, {
    delivery_id: 42,
    latitude: 14.599512,
    longitude: 120.984212,
    accuracy_meters: 15,
    heading: 90,
    speed_mps: 4.5,
    recorded_at: new Date(1700000000000).toISOString(),
  });

  assert.throws(() =>
    buildTrackerLocationPayload({ coords: { latitude: 95, longitude: 120 } }),
  );
  assert.throws(() =>
    buildTrackerLocationPayload({ coords: { latitude: Number.NaN, longitude: 120 } }),
  );
});

test('createRiderGpsController starts watch once, submits payload, prevents overlap/throttle, and cleans up on stop', async () => {
  const mockGeo = createMockGeolocation();
  const posted = [];
  const synced = [];
  const syncErrors = [];
  let currentTime = 10000;
  let resolvePending = null;

  const controller = createRiderGpsController({
    geolocation: mockGeo.geolocation,
    minSendIntervalMs: 8000,
    now: () => currentTime,
    postLocation: (payload) => {
      posted.push(payload);
      return new Promise((resolve) => {
        resolvePending = resolve;
      });
    },
    onSynced: (ts) => synced.push(ts),
    onSyncError: (msg) => syncErrors.push(msg),
  });

  controller.start({ deliveryId: 7 });
  controller.start({ deliveryId: 7 }); // duplicate start ignored
  assert.equal(mockGeo.getActiveWatchCount(), 1);

  // First GPS tick fires postLocation (in-flight)
  const firstTick = mockGeo.emitPosition({
    coords: { latitude: 14.6, longitude: 121.0, accuracy: 10 },
    timestamp: 1700000001000,
  });
  assert.equal(posted.length, 1);

  // Overlapping tick while first request is still in flight is ignored
  currentTime += 10000;
  await mockGeo.emitPosition({
    coords: { latitude: 14.601, longitude: 121.001, accuracy: 10 },
    timestamp: 1700000002000,
  });
  assert.equal(posted.length, 1);

  resolvePending({ recorded: true });
  await firstTick;
  assert.equal(synced.length, 1);
  assert.equal(syncErrors.at(-1), '');

  // Tick within minSendIntervalMs (8000ms) is throttled
  currentTime = 13000;
  await mockGeo.emitPosition({
    coords: { latitude: 14.602, longitude: 121.002, accuracy: 10 },
    timestamp: 1700000005000,
  });
  assert.equal(posted.length, 1);

  // Cleanup on stop / unmount
  controller.stop();
  assert.equal(mockGeo.getActiveWatchCount(), 0);
  assert.deepEqual(mockGeo.getClearedWatches(), [1]);
});

test('createRiderGpsController handles GPS permission denial and API failure without false success', async () => {
  const mockGeo = createMockGeolocation();
  const synced = [];
  const gpsErrors = [];
  const syncErrors = [];
  const permissions = [];

  const controller = createRiderGpsController({
    geolocation: mockGeo.geolocation,
    minSendIntervalMs: 0,
    now: () => 20000,
    postLocation: async () => {
      throw new Error('Network unreachable');
    },
    onSynced: (ts) => synced.push(ts),
    onGpsError: (msg) => gpsErrors.push(msg),
    onSyncError: (msg) => syncErrors.push(msg),
    onPermissionChange: (p) => permissions.push(p),
  });

  controller.start();

  // API error must NOT mark synced
  await mockGeo.emitPosition({
    coords: { latitude: 14.6, longitude: 121.0, accuracy: 12 },
    timestamp: 1700000001000,
  });
  assert.equal(synced.length, 0);
  assert.equal(syncErrors.at(-1), 'Network unreachable');

  // Permission denied
  mockGeo.emitError({ code: 1 });
  assert.equal(permissions.at(-1), 'denied');
  assert.match(gpsErrors.at(-1), /permission denied/i);

  controller.stop();
});

test('RiderLayout mounts useRiderGpsTracker when active rider is online or on active delivery', async () => {
  const layoutSrc = await fs.readFile(
    new URL('../layouts/RiderLayout.jsx', import.meta.url),
    'utf8',
  );

  assert.match(layoutSrc, /useRiderGpsTracker/);
  assert.match(layoutSrc, /availability === 'online' \|\| Boolean\(activeDelivery\)/);
  assert.match(layoutSrc, /deliveryId:\s*activeDelivery\?\.delivery_id \?\? null/);
});
