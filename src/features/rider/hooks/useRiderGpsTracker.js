import { useEffect, useRef, useState } from 'react';
import locationApiService from '../../../services/locationApiService';

const MIN_SEND_INTERVAL_MS = 8000;

/**
 * Watches real device GPS while a rider has an active delivery (or is online)
 * and posts updates to POST /api/rider/location with timestamps and accuracy.
 * Stops automatically when inactive, delivered, or cancelled.
 */
export default function useRiderGpsTracker({
  enabled = false,
  deliveryId = null,
}) {
  const [location, setLocation] = useState(null); // { lat, lng, accuracy, recordedAt }
  const [gpsError, setGpsError] = useState('');
  const [permissionState, setPermissionState] = useState('prompt'); // prompt | granted | denied | unsupported
  const lastSentAtRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setPermissionState('unsupported');
      setGpsError('Device GPS is not supported in this browser.');
      return undefined;
    }

    let cancelled = false;
    const watchId = navigator.geolocation.watchPosition(
      async (position) => {
        if (cancelled) return;
        setPermissionState('granted');
        setGpsError('');

        const next = {
          lat: Number(position.coords.latitude.toFixed(6)),
          lng: Number(position.coords.longitude.toFixed(6)),
          accuracy: Number.isFinite(position.coords.accuracy) ? Math.round(position.coords.accuracy) : null,
          heading: Number.isFinite(position.coords.heading) ? position.coords.heading : null,
          speed: Number.isFinite(position.coords.speed) ? position.coords.speed : null,
          recordedAt: new Date(position.timestamp || Date.now()).toISOString(),
        };
        setLocation(next);

        const now = Date.now();
        if (now - lastSentAtRef.current >= MIN_SEND_INTERVAL_MS) {
          lastSentAtRef.current = now;
          try {
            await locationApiService.postRiderLocation({
              delivery_id: Number.isFinite(Number(deliveryId)) && Number(deliveryId) > 0 ? Number(deliveryId) : null,
              latitude: next.lat,
              longitude: next.lng,
              accuracy_meters: next.accuracy,
              heading: next.heading,
              speed_mps: next.speed,
              recorded_at: next.recordedAt,
            });
          } catch {
            // Temporary connectivity issue; keep local GPS marker active and retry on next tick
          }
        }
      },
      (err) => {
        if (cancelled) return;
        if (err.code === 1) {
          setPermissionState('denied');
          setGpsError('Location permission denied. Enable GPS to share live delivery progress.');
        } else if (err.code === 2) {
          setGpsError('GPS signal temporarily unavailable.');
        } else if (err.code === 3) {
          setGpsError('GPS update timed out; retrying…');
        } else {
          setGpsError('Unable to read device GPS.');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 5000,
      },
    );

    return () => {
      cancelled = true;
      navigator.geolocation.clearWatch(watchId);
    };
  }, [enabled, deliveryId]);

  return {
    location,
    gpsError,
    permissionState,
  };
}
