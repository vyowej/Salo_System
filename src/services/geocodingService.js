/**
 * SALO — Free Geocoding, Reverse Geocoding & Routing Service
 * Uses OpenStreetMap Nominatim (Philippine-scoped) and OSRM with caching and
 * a shared 1-request-per-second Nominatim rate throttle.
 * Never invents missing address components.
 */

const MIN_NOMINATIM_INTERVAL_MS = 1000;

const reverseCache = new Map();
const geocodeCache = new Map();
const searchCache = new Map();

let lastNominatimRequestAt = 0;
let nominatimQueue = Promise.resolve();

function cacheKey(lat, lng) {
  return `${Number(lat).toFixed(5)},${Number(lng).toFixed(5)}`;
}

function queryCacheKey(query) {
  return String(query || '').trim().toLowerCase();
}

function scheduleNominatimRequest(fn) {
  const task = nominatimQueue.then(async () => {
    const now = Date.now();
    const elapsed = now - lastNominatimRequestAt;
    if (lastNominatimRequestAt > 0 && elapsed < MIN_NOMINATIM_INTERVAL_MS) {
      await new Promise((resolve) => setTimeout(resolve, MIN_NOMINATIM_INTERVAL_MS - elapsed));
    }
    lastNominatimRequestAt = Date.now();
    return fn();
  });

  nominatimQueue = task.catch(() => {});
  return task;
}

/**
 * Extract Philippine address components from a Nominatim address object without inventing missing fields.
 */
export function parseNominatimAddress(data) {
  const addr = data?.address || {};
  const rawProvince = addr.province || addr.state || addr.region || '';
  const province = /metro manila|national capital region/i.test(rawProvince)
    ? 'Metro Manila'
    : rawProvince;

  const city = addr.city || addr.town || addr.municipality || addr.city_district || '';
  const rawBarangay = addr.suburb || addr.quarter || addr.neighbourhood || addr.village || '';
  const barangay = rawBarangay.replace(/^Barangay\s+/i, '').replace(/^Brgy\.?\s+/i, '');
  const street = addr.road || addr.pedestrian || addr.residential || '';
  const houseNumber = addr.house_number || '';
  const postalCode = (addr.postcode || '').replace(/\D/g, '').slice(0, 4);

  return {
    formattedAddress: data?.display_name || '',
    houseNumber,
    street,
    barangay,
    city,
    province,
    postalCode,
  };
}

export async function reverseGeocode(lat, lng) {
  const key = cacheKey(lat, lng);
  if (reverseCache.has(key)) {
    return reverseCache.get(key);
  }

  return scheduleNominatimRequest(async () => {
    if (reverseCache.has(key)) {
      return reverseCache.get(key);
    }

    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&addressdetails=1`;
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error('Reverse geocoding request failed.');
    }

    const data = await response.json();
    const parsed = {
      formattedAddress: data?.display_name || '',
      components: parseNominatimAddress(data),
    };

    reverseCache.set(key, parsed);
    return parsed;
  });
}

export async function geocodeAddress(addressText) {
  const query = String(addressText || '').trim();
  if (!query) return null;

  const key = queryCacheKey(query);
  if (geocodeCache.has(key)) {
    return geocodeCache.get(key);
  }

  return scheduleNominatimRequest(async () => {
    if (geocodeCache.has(key)) {
      return geocodeCache.get(key);
    }

    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(query)}&countrycodes=ph&addressdetails=1&limit=1`;
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) return null;
    const results = await response.json();
    const first = Array.isArray(results) ? results[0] : null;
    if (!first) {
      geocodeCache.set(key, null);
      return null;
    }

    const parsed = {
      lat: Number(first.lat),
      lng: Number(first.lon),
      formattedAddress: first.display_name || query,
      components: parseNominatimAddress(first),
    };
    geocodeCache.set(key, parsed);
    return parsed;
  });
}

export async function searchPhilippinePlaces(query) {
  const clean = String(query || '').trim();
  if (clean.length < 3) return [];

  const key = queryCacheKey(clean);
  if (searchCache.has(key)) {
    return searchCache.get(key);
  }

  return scheduleNominatimRequest(async () => {
    if (searchCache.has(key)) {
      return searchCache.get(key);
    }

    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(clean)}&countrycodes=ph&addressdetails=1&limit=6`;
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) return [];
    const results = await response.json();
    if (!Array.isArray(results)) return [];

    const mapped = results.map((item) => {
      const parts = String(item.display_name || '').split(',');
      return {
        placeId: String(item.place_id),
        lat: Number(item.lat),
        lng: Number(item.lon),
        description: item.display_name || '',
        mainText: parts[0]?.trim() || item.display_name || '',
        secondaryText: parts.slice(1).join(',').trim(),
        components: parseNominatimAddress(item),
      };
    });

    searchCache.set(key, mapped);
    return mapped;
  });
}

export async function fetchOsmRoute(origin, destination, waypoints = []) {
  const points = [origin, ...waypoints, destination].filter(
    (p) => p && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)),
  );
  if (points.length < 2) return null;

  const coordsParam = points.map((p) => `${Number(p.lng)},${Number(p.lat)}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coordsParam}?overview=full&geometries=geojson`;

  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) return null;

  const data = await response.json();
  const route = data?.routes?.[0];
  if (!route?.geometry?.coordinates) return null;

  const latLngs = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
  const distanceKm = route.distance ? (route.distance / 1000).toFixed(1) : null;
  const durationMin = route.duration ? Math.max(1, Math.round(route.duration / 60)) : null;

  return {
    latLngs,
    distanceText: distanceKm ? `${distanceKm} km` : '',
    durationText: durationMin ? `${durationMin} min` : '',
    distanceMeters: route.distance || null,
    durationSeconds: route.duration || null,
  };
}
