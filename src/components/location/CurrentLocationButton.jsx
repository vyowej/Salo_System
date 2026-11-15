import { useState } from 'react';
import Button from '../common/Button';

/**
 * Reusable "Use My Current Location" GPS button with clear error & permission handling.
 */
export default function CurrentLocationButton({
  onLocated,
  onError,
  disabled = false,
  variant = 'outline',
  size = 'sm',
  label = 'Use My Current Location',
  className = '',
}) {
  const [locating, setLocating] = useState(false);

  const handleLocate = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      onError?.('Geolocation is not supported by your browser. Search or tap the map to place a pin.');
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        onLocated?.({
          lat: Number(position.coords.latitude.toFixed(6)),
          lng: Number(position.coords.longitude.toFixed(6)),
          accuracy: Number.isFinite(position.coords.accuracy) ? Math.round(position.coords.accuracy) : null,
        });
      },
      (err) => {
        setLocating(false);
        let message = 'Unable to detect your GPS location. You can search or click the map to pin manually.';
        if (err.code === 1) {
          message = 'Location permission was denied. Enable browser location access or click the map to place a pin.';
        } else if (err.code === 2) {
          message = 'GPS signal is unavailable right now. Please search or tap the map to pin your location.';
        } else if (err.code === 3) {
          message = 'Location request timed out. Try again or tap the map to place your pin.';
        }
        onError?.(message);
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0,
      },
    );
  };

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      disabled={disabled || locating}
      onClick={handleLocate}
      className={className}
    >
      {locating ? 'Detecting GPS…' : `📍 ${label}`}
    </Button>
  );
}
