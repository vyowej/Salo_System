import assert from 'node:assert/strict';
import test from 'node:test';

import {
  geocodeAddress,
  reverseGeocode,
  searchPhilippinePlaces,
} from '../services/geocodingService.js';

test('geocodingService caches searchPhilippinePlaces and geocodeAddress and throttles Nominatim requests to >= 1000ms', async () => {
  const originalFetch = globalThis.fetch;
  const callTimestamps = [];
  const requestedUrls = [];

  globalThis.fetch = async (url) => {
    callTimestamps.push(Date.now());
    requestedUrls.push(String(url));

    if (String(url).includes('/reverse')) {
      return {
        ok: true,
        async json() {
          return {
            display_name: 'Katipunan Ave, Loyola Heights, Quezon City, Metro Manila, Philippines',
            address: {
              road: 'Katipunan Ave',
              suburb: 'Loyola Heights',
              city: 'Quezon City',
              state: 'Metro Manila',
              postcode: '1108',
            },
          };
        },
      };
    }

    if (String(url).includes('q=Fail%20Query')) {
      return {
        ok: false,
        status: 503,
        async json() {
          return [];
        },
      };
    }

    return {
      ok: true,
      async json() {
        return [
          {
            place_id: 101,
            lat: '14.6391',
            lon: '121.0746',
            display_name: 'Ateneo, Katipunan Ave, Loyola Heights, Quezon City, Metro Manila, Philippines',
            address: {
              road: 'Katipunan Ave',
              suburb: 'Loyola Heights',
              city: 'Quezon City',
              state: 'Metro Manila',
              postcode: '1108',
            },
          },
        ];
      },
    };
  };

  try {
    // 1. Concurrent uncached requests across search, geocode, and reverse must be serialized >= 1000ms apart
    const [searchRes, geocodeRes, reverseRes] = await Promise.all([
      searchPhilippinePlaces('Ateneo Katipunan'),
      geocodeAddress('Loyola Heights Quezon City'),
      reverseGeocode(14.6391, 121.0746),
    ]);

    assert.equal(searchRes.length, 1);
    assert.equal(searchRes[0].placeId, '101');
    assert.equal(geocodeRes.lat, 14.6391);
    assert.equal(reverseRes.components.city, 'Quezon City');
    assert.equal(requestedUrls.length, 3);

    // Verify >= 950ms spacing between consecutive Nominatim network requests (1 req/sec throttle)
    assert.ok(
      callTimestamps[1] - callTimestamps[0] >= 950,
      `Expected >= 950ms between call 1 and 2, got ${callTimestamps[1] - callTimestamps[0]}ms`,
    );
    assert.ok(
      callTimestamps[2] - callTimestamps[1] >= 950,
      `Expected >= 950ms between call 2 and 3, got ${callTimestamps[2] - callTimestamps[1]}ms`,
    );

    // 2. Repeated calls hit in-memory cache without invoking fetch
    const searchCached = await searchPhilippinePlaces('  ateneo katipunan  ');
    const geocodeCached = await geocodeAddress('  loyola heights quezon city ');
    const reverseCached = await reverseGeocode(14.6391, 121.0746);

    assert.equal(searchCached[0].placeId, '101');
    assert.equal(geocodeCached.lng, 121.0746);
    assert.equal(reverseCached.components.barangay, 'Loyola Heights');
    assert.equal(requestedUrls.length, 3, 'Cached calls must not trigger additional fetch requests');

    // 3. Failed requests do not break the queue or get cached
    const failedRes = await searchPhilippinePlaces('Fail Query');
    assert.deepEqual(failedRes, []);
    assert.equal(requestedUrls.length, 4);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
