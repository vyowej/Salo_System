import { useEffect, useRef, useState } from 'react';
import riderService from '../../../services/riderService.js';

export const MIN_GPS_SEND_INTERVAL_MS = 8000;

/**
 * Validate and format browser GeolocationPosition into the exact payload
 * expected by POST /api/rider/location.
 */
export function buildTrackerLocationPayload(position, deliveryId = null) {
  const coords = position?.coords;
  const rawLat = Number(coords?.latitude);
  const rawLng = Number(coords?.longitude);

  if (
    !Number.isFinite(rawLat) ||
    rawLat < -90 ||
    rawLat > 90 ||
    !Number.isFinite(rawLng) ||
    rawLng < -180 ||
    rawLng > 180
  ) {
    throw new Error('Received invalid GPS coordinates from device.');
  }

  const lat = Number(rawLat.toFixed(6));
  const lng = Number(rawLng.toFixed(6));
  const accuracy =
    coords?.accuracy !== null && coords?.accuracy !== undefined && Number.isFinite(Number(coords.accuracy)) && Number(coords.accuracy) >= 0
      ? Math.round(Number(coords.accuracy))
      : null;
  const heading =
    coords?.heading !== null && coords?.heading !== undefined && Number.isFinite(Number(coords.heading)) && Number(coords.heading) >= 0 && Number(coords.heading) <= 360
      ? Number(coords.heading)
      : null;
  const speed =
    coords?.speed !== null && coords?.speed !== undefined && Number.isFinite(Number(coords.speed)) && Number(coords.speed) >= 0
      ? Number(coords.speed)
      : null;
  const recordedAt = new Date(position?.timestamp || Date.now()).toISOString();
  const parsedDeliveryId =
    deliveryId !== null && deliveryId !== undefined && Number.isFinite(Number(deliveryId)) && Number(deliveryId) > 0
      ? Number(deliveryId)
      : null;

  return {
    location: {
      lat,
      lng,
      accuracy,
      heading,
      speed,
      recordedAt,
    },
    payload: {
      delivery_id: parsedDeliveryId,
      latitude: lat,
      longitude: lng,
      accuracy_meters: accuracy,
      heading,
      speed_mps: speed,
      recorded_at: recordedAt,
    },
  };
}

/**
 * Core GPS watch controller used by useRiderGpsTracker.
 * Separated for deterministic unit testing of watch lifecycle, throttling,
 * overlap prevention, error handling, and cleanup.
 */
export function createRiderGpsController({
  geolocation = typeof navigator !== 'undefined' ? navigator.geolocation : null,
  postLocation = (payload) => riderService.postRiderLocation(payload),
  minSendIntervalMs = MIN_GPS_SEND_INTERVAL_MS,
  now = () => Date.now(),
  onLocation = () => {},
  onSynced = () => {},
  onGpsError = () => {},
  onSyncError = () => {},
  onPermissionChange = () => {},
} = {}) {
  let watchId = null;
  let cancelled = false;
  let inFlight = false;
  let lastSentAt = 0;

  const start = ({ deliveryId = null } = {}) => {
    if (watchId !== null) {
      return;
    }

    if (!geolocation || typeof geolocation.watchPosition !== 'function') {
      onPermissionChange('unsupported');
      onGpsError('Device GPS is not supported in this browser.');
      return;
    }

    cancelled = false;
    watchId = geolocation.watchPosition(
      async (position) => {
        if (cancelled) return;
        onPermissionChange('granted');

        let built;
        try {
          built = buildTrackerLocationPayload(position, deliveryId);
        } catch (coordErr) {
          onGpsError(coordErr?.message || 'Received invalid GPS coordinates from device.');
          return;
        }

        onGpsError('');
        onLocation(built.location);

        const currentTime = now();
        if (inFlight || currentTime - lastSentAt < minSendIntervalMs) {
          return;
        }

        inFlight = true;
        try {
          const result = await postLocation(built.payload);
          if (cancelled) return;

          if (result && result.recorded === false) {
            onSyncError(result.reason || 'Location update was not recorded.');
            return;
          }

          lastSentAt = currentTime;
          onSyncError('');
          onSynced(built.location.recordedAt);
        } catch (apiErr) {
          if (!cancelled) {
            onSyncError(apiErr?.message || 'Unable to sync GPS location.');
          }
        } finally {
          inFlight = false;
        }
      },
      (err) => {
        if (cancelled) return;
        if (err?.code === 1) {
          onPermissionChange('denied');
          onGpsError('Location permission denied. Enable GPS to share live delivery progress.');
        } else if (err?.code === 2) {
          onGpsError('GPS signal temporarily unavailable.');
        } else if (err?.code === 3) {
          onGpsError('GPS update timed out; retrying…');
        } else {
          onGpsError('Unable to read device GPS.');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 5000,
      },
    );
  };

  const stop = () => {
    cancelled = true;
    inFlight = false;
    if (watchId !== null && geolocation && typeof geolocation.clearWatch === 'function') {
      geolocation.clearWatch(watchId);
    }
    watchId = null;
  };

  return { start, stop };
}

/**
 * Watches real device GPS while a rider has an active delivery (or is online)
 * and posts updates to POST /api/rider/location with timestamps and accuracy.
 * Stops automatically when inactive, offline, delivered, or unmounted.
 */
export default function useRiderGpsTracker({
  enabled = false,
  deliveryId = null,
} = {}) {
  const [location, setLocation] = useState(null);
  const [gpsError, setGpsError] = useState('');
  const [syncError, setSyncError] = useState('');
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [permissionState, setPermissionState] = useState('prompt'); // prompt | granted | denied | unsupported
  const controllerRef = useRef(null);

  useEffect(() => {
    if (!enabled) {
      if (controllerRef.current) {
        controllerRef.current.stop();
        controllerRef.current = null;
      }
      return undefined;
    }

    const controller = createRiderGpsController({
      onLocation: setLocation,
      onSynced: setLastSyncedAt,
      onGpsError: setGpsError,
      onSyncError: setSyncError,
      onPermissionChange: setPermissionState,
    });
    controllerRef.current = controller;
    controller.start({ deliveryId });

    return () => {
      controller.stop();
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
    };
  }, [enabled, deliveryId]);

  return {
    location,
    gpsError,
    syncError,
    lastSyncedAt,
    permissionState,
  };
}
