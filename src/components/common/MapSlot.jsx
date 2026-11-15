import { useCallback, useMemo, useState } from 'react';
import SharedMap from '../location/SharedMap';
import './MapSlot.css';

function toLatLng(point) {
  if (!point) return null;
  const lat = Number(point.lat ?? point.latitude);
  const lng = Number(point.lng ?? point.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function formatAge(isoTimestamp) {
  if (!isoTimestamp) return '';
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/**
 * MapSlot — Real OpenStreetMap & Leaflet route & live tracking HUD.
 * Supports:
 * - mode="rider": Rider's actual GPS location, pickup & dropoff waypoints, route, external navigation.
 * - mode="customer": Live customer order tracker with restaurant pickup, customer destination,
 *   and assigned rider's latest GPS coordinates (no simulated movement).
 */
export default function MapSlot({
  pickup,
  secondaryPickup,
  dropoff,
  stage = 'pickup',
  hasRoute = true,
  metrics,
  mode = 'rider',
  customerStatusText,
  riderName,
  riderLocation = null,
  lastUpdatedAt = null,
  isStale = false,
  gpsError = '',
  label = 'Map coordinates will appear when available',
  showLabel = true,
  className = '',
}) {
  const [focusTarget, setFocusTarget] = useState('overview');
  const [routeMetrics, setRouteMetrics] = useState(null);

  const isCustomer = mode === 'customer';
  const toDropoff = stage === 'dropoff';

  const pickupCoords = useMemo(() => toLatLng(pickup), [pickup]);
  const secondaryCoords = useMemo(() => toLatLng(secondaryPickup), [secondaryPickup]);
  const dropoffCoords = useMemo(() => toLatLng(dropoff), [dropoff]);
  const riderCoords = useMemo(() => toLatLng(riderLocation), [riderLocation]);

  const pickupTitle = pickup?.title || 'Restaurant';
  const secondaryPickupTitle = secondaryPickup?.title || 'Kitchen 2';
  const dropoffTitle = dropoff?.title || (isCustomer ? 'Your Address' : 'Drop-off');

  const markers = useMemo(() => {
    const list = [];
    if (pickupCoords) {
      list.push({
        id: 'pickup',
        ...pickupCoords,
        title: `Pickup · ${pickupTitle}`,
        subtitle: pickup?.address || '',
        type: 'pickup',
      });
    }
    if (secondaryCoords) {
      list.push({
        id: 'secondary-pickup',
        ...secondaryCoords,
        title: `Pickup 2 · ${secondaryPickupTitle}`,
        subtitle: secondaryPickup?.address || '',
        type: 'restaurant',
      });
    }
    if (dropoffCoords) {
      list.push({
        id: 'dropoff',
        ...dropoffCoords,
        title: `Drop-off · ${dropoffTitle}`,
        subtitle: dropoff?.address || '',
        type: 'dropoff',
      });
    }
    if (riderCoords) {
      list.push({
        id: 'rider',
        ...riderCoords,
        title: isCustomer ? (riderName ? `Rider · ${riderName}` : 'Assigned Rider') : 'You (Rider GPS)',
        subtitle: lastUpdatedAt ? `Last updated: ${formatAge(lastUpdatedAt)}` : 'Live GPS',
        type: 'rider',
      });
    }
    return list;
  }, [
    pickupCoords,
    secondaryCoords,
    dropoffCoords,
    riderCoords,
    pickupTitle,
    secondaryPickupTitle,
    dropoffTitle,
    pickup?.address,
    secondaryPickup?.address,
    dropoff?.address,
    isCustomer,
    riderName,
    lastUpdatedAt,
  ]);

  const activeRoute = useMemo(() => {
    if (!hasRoute) return null;
    if (toDropoff && pickupCoords && dropoffCoords) {
      return {
        origin: riderCoords || pickupCoords,
        destination: dropoffCoords,
      };
    }
    if (!toDropoff && riderCoords && pickupCoords) {
      return {
        origin: riderCoords,
        destination: pickupCoords,
        waypoints: dropoffCoords ? [dropoffCoords] : [],
      };
    }
    if (pickupCoords && dropoffCoords) {
      return {
        origin: pickupCoords,
        destination: dropoffCoords,
      };
    }
    return null;
  }, [hasRoute, toDropoff, riderCoords, pickupCoords, dropoffCoords]);

  const mapCenter = useMemo(() => {
    if (focusTarget === 'kitchen' && pickupCoords) return pickupCoords;
    if (focusTarget === 'rider' && riderCoords) return riderCoords;
    if (focusTarget === 'home' && dropoffCoords) return dropoffCoords;
    return riderCoords || pickupCoords || dropoffCoords || { lat: 14.5995, lng: 120.9842 };
  }, [focusTarget, pickupCoords, riderCoords, dropoffCoords]);

  const handleRouteCalculated = useCallback((info) => {
    setRouteMetrics(info);
  }, []);

  const displayEta = routeMetrics?.durationText || metrics?.eta || '';
  const displayDistance = routeMetrics?.distanceText || metrics?.distance || '';

  const externalTarget = toDropoff ? dropoffCoords : pickupCoords;
  const externalNavUrl = externalTarget
    ? `https://www.openstreetmap.org/?mlat=${externalTarget.lat}&mlon=${externalTarget.lng}#map=16/${externalTarget.lat}/${externalTarget.lng}`
    : null;

  const hasAnyCoords = Boolean(pickupCoords || dropoffCoords || riderCoords);

  return (
    <div className={`map-slot ${isCustomer ? 'map-slot--customer' : ''} ${className}`.trim()} role="region" aria-label="Delivery route map">
      <div className="map-slot-surface" style={{ position: 'relative' }}>
        {hasAnyCoords ? (
          <SharedMap
            center={mapCenter}
            zoom={focusTarget === 'overview' ? 14 : 16}
            height={360}
            markers={markers}
            route={activeRoute}
            onRouteCalculated={handleRouteCalculated}
            interactive
            showCoordsChip={false}
          />
        ) : (
          <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            {showLabel && <span className="map-slot-label">{label}</span>}
          </div>
        )}

        {/* Top HUD */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 14px',
            background: 'var(--bg-surface, #fff)',
            borderTop: '1px solid var(--border-subtle, rgba(0,0,0,0.08))',
            fontSize: '0.8125rem',
          }}
        >
          <div>
            <strong>
              {isCustomer
                ? (customerStatusText || (riderCoords ? 'Live tracking active' : 'Awaiting rider GPS / assignment'))
                : (toDropoff ? `Heading to Drop-off · ${dropoffTitle}` : `Heading to Pickup · ${pickupTitle}`)}
            </strong>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
              {displayDistance && <span>{displayDistance}</span>}
              {displayDistance && displayEta && <span> · </span>}
              {displayEta && <span>Est. {displayEta}</span>}
              {lastUpdatedAt && (
                <span>
                  {(displayDistance || displayEta) ? ' · ' : ''}
                  {isStale ? '⚠ Stale GPS · ' : 'GPS updated '}
                  {formatAge(lastUpdatedAt)}
                </span>
              )}
              {gpsError && <span style={{ color: '#dc2626' }}> · {gpsError}</span>}
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
            {isCustomer ? (
              <>
                <button
                  type="button"
                  className={`map-focus-btn ${focusTarget === 'overview' ? 'is-active' : ''}`}
                  onClick={() => setFocusTarget('overview')}
                >
                  🗺️ Full Route
                </button>
                {pickupCoords && (
                  <button
                    type="button"
                    className={`map-focus-btn ${focusTarget === 'kitchen' ? 'is-active' : ''}`}
                    onClick={() => setFocusTarget('kitchen')}
                  >
                    🍽️ Kitchen
                  </button>
                )}
                {riderCoords && (
                  <button
                    type="button"
                    className={`map-focus-btn ${focusTarget === 'rider' ? 'is-active' : ''}`}
                    onClick={() => setFocusTarget('rider')}
                  >
                    🛵 Rider
                  </button>
                )}
                {dropoffCoords && (
                  <button
                    type="button"
                    className={`map-focus-btn ${focusTarget === 'home' ? 'is-active' : ''}`}
                    onClick={() => setFocusTarget('home')}
                  >
                    🏠 Destination
                  </button>
                )}
              </>
            ) : (
              externalNavUrl && (
                <a
                  href={externalNavUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="map-focus-btn"
                  style={{ textDecoration: 'none' }}
                >
                  🧭 Open in OpenStreetMap
                </a>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
