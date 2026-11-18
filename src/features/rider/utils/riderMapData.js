const DEFAULT_MAP_CENTER = { lat: 14.5995, lng: 120.9842 };

export function isValidCoordPair(lat, lng) {
  if (lat === null || lat === undefined || lat === '' || lng === null || lng === undefined || lng === '') {
    return false;
  }
  const numLat = Number(lat);
  const numLng = Number(lng);
  return (
    Number.isFinite(numLat) &&
    Number.isFinite(numLng) &&
    numLat >= -90 &&
    numLat <= 90 &&
    numLng >= -180 &&
    numLng <= 180
  );
}

/**
 * Derive SharedMap markers, route, center, and missing-coordinate notices
 * strictly from real backend delivery data and live rider GPS state.
 */
export function buildRiderMapState({ delivery = null, riderLocation = null } = {}) {
  const markers = [];

  const riderLat = riderLocation?.lat ?? riderLocation?.latitude;
  const riderLng = riderLocation?.lng ?? riderLocation?.longitude;
  const riderMarker = isValidCoordPair(riderLat, riderLng)
    ? {
        id: 'rider',
        lat: Number(riderLat),
        lng: Number(riderLng),
        title: 'Your Location',
        subtitle: riderLocation?.accuracy != null ? `GPS accuracy ±${riderLocation.accuracy}m` : 'Live GPS',
        type: 'rider',
      }
    : null;

  if (riderMarker) {
    markers.push(riderMarker);
  }

  let pickupMarker = null;
  let dropoffMarker = null;

  if (delivery) {
    const pLat = delivery.pickup_latitude ?? delivery.pickup?.latitude;
    const pLng = delivery.pickup_longitude ?? delivery.pickup?.longitude;
    if (isValidCoordPair(pLat, pLng)) {
      pickupMarker = {
        id: 'pickup',
        lat: Number(pLat),
        lng: Number(pLng),
        title: delivery.restaurant_name || 'Pickup Restaurant',
        subtitle: delivery.pickup_address_text || '',
        type: 'pickup',
      };
      markers.push(pickupMarker);
    }

    const dLat = delivery.dropoff_latitude ?? delivery.dropoff?.latitude;
    const dLng = delivery.dropoff_longitude ?? delivery.dropoff?.longitude;
    if (isValidCoordPair(dLat, dLng)) {
      dropoffMarker = {
        id: 'dropoff',
        lat: Number(dLat),
        lng: Number(dLng),
        title: delivery.customer_name || 'Delivery Drop-off',
        subtitle: delivery.dropoff_address_text || '',
        type: 'dropoff',
      };
      markers.push(dropoffMarker);
    }
  }

  const route =
    pickupMarker && dropoffMarker
      ? {
          origin: { lat: pickupMarker.lat, lng: pickupMarker.lng },
          destination: { lat: dropoffMarker.lat, lng: dropoffMarker.lng },
          waypoints: riderMarker ? [{ lat: riderMarker.lat, lng: riderMarker.lng }] : [],
        }
      : null;

  const center = riderMarker
    ? { lat: riderMarker.lat, lng: riderMarker.lng }
    : pickupMarker
      ? { lat: pickupMarker.lat, lng: pickupMarker.lng }
      : dropoffMarker
        ? { lat: dropoffMarker.lat, lng: dropoffMarker.lng }
        : DEFAULT_MAP_CENTER;

  let missingCoordinatesNotice = '';
  if (delivery) {
    if (!pickupMarker && !dropoffMarker) {
      missingCoordinatesNotice =
        'Pickup and drop-off coordinates are not provided by the delivery API; showing address details and your live GPS location.';
    } else if (!pickupMarker) {
      missingCoordinatesNotice = 'Pickup coordinates are unavailable; showing address details.';
    } else if (!dropoffMarker) {
      missingCoordinatesNotice = 'Drop-off coordinates are unavailable; showing address details.';
    }
  }

  return {
    markers,
    riderMarker,
    pickupMarker,
    dropoffMarker,
    route,
    center,
    missingCoordinatesNotice,
  };
}
