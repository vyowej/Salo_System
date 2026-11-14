import { useState } from 'react';
import './MapSlot.css';

const MIN_ZOOM = 0.8;
const MAX_ZOOM = 1.6;

/**
 * MapSlot
 *
 * Provider-free route map supporting two distinct functional modes:
 * - mode="rider" (default): Turn-by-turn street navigation HUD, directional heading cone,
 *   rider ("YOU") marker, pickup & drop-off waypoints.
 * - mode="customer": Live customer order tracking HUD (estimated arrival window, kitchen
 *   preparation / rider transit status, interactive camera focus pills for Kitchen, Rider,
 *   and Customer Home/Office pin, plus multi-kitchen pin support).
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
  riderLocation: _riderLocation,
  label = 'Map will appear here',
  showLabel = true,
  className = '',
}) {
  const [zoom, setZoom] = useState(1);
  const [focusTarget, setFocusTarget] = useState('overview');
  const isCustomer = mode === 'customer';
  const toDropoff = stage === 'dropoff';

  // Coordinates positioned cleanly in the center of the 800x500 canvas so all points are clearly visible
  const riderPoint = toDropoff ? { x: 470, y: 200 } : { x: 240, y: 270 };
  const pickupPoint = { x: 350, y: 200 };
  const secondaryPickupPoint = { x: 260, y: 340 };
  const dropoffPoint = { x: 640, y: 150 };

  const legPath = toDropoff
    ? 'M350 200 L530 200 L530 150 L640 150'
    : 'M240 270 L260 270 L260 200 L350 200';
  const nextLegPath = toDropoff
    ? ''
    : 'M350 200 L530 200 L530 150 L640 150';
  const secondaryLegPath = secondaryPickup
    ? 'M260 340 L350 340 L350 200'
    : '';

  const pickupTitle = pickup?.title || 'Restaurant';
  const secondaryPickupTitle = secondaryPickup?.title || 'Kitchen 2';
  const dropoffTitle = dropoff?.title || (isCustomer ? 'Your Address' : 'Drop-off');
  const nextTurnText = toDropoff
    ? `Turn left onto Aurora Blvd toward ${dropoffTitle}`
    : `Turn right onto Sampaguita St toward ${pickupTitle}`;
  const nextTurnDist = toDropoff ? '320 m' : '180 m';

  // Compute transform origin based on customer focus target
  const originMap = {
    overview: '50% 50%',
    kitchen: '42% 42%',
    rider: toDropoff ? '58% 40%' : '32% 54%',
    home: '78% 30%',
  };
  const transformOrigin = isCustomer ? originMap[focusTarget] || '50% 50%' : '50% 50%';

  function handleCustomerFocus(target) {
    setFocusTarget(target);
    if (target === 'overview') {
      setZoom(1);
    } else {
      setZoom(1.25);
    }
  }

  return (
    <div className={`map-slot ${isCustomer ? 'map-slot--customer' : ''} ${className}`.trim()} role="img" aria-label="Delivery route map">
      <div className="map-slot-surface">
        <svg
          className="map-slot-svg"
          viewBox="0 0 800 500"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden="true"
          style={{ transform: `scale(${zoom})`, transformOrigin }}
        >
          <defs>
            <filter id="map-pin-shadow" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#1f2937" floodOpacity="0.28" />
            </filter>
            <linearGradient id="rider-cone" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#2563eb" stopOpacity="0.38" />
              <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Base Land */}
          <rect width="800" height="500" className="map-land" />

          {/* Urban City Blocks for realistic map depth */}
          <g className="map-blocks">
            <rect x="20" y="20" width="125" height="60" rx="6" />
            <rect x="175" y="20" width="70" height="60" rx="6" />
            <rect x="275" y="20" width="60" height="60" rx="6" />
            <rect x="365" y="20" width="50" height="60" rx="6" />
            <rect x="445" y="20" width="70" height="115" rx="6" />
            <rect x="545" y="20" width="80" height="115" rx="6" />
            <rect x="655" y="20" width="125" height="115" rx="6" />

            <rect x="175" y="100" width="70" height="85" rx="6" />
            <rect x="275" y="100" width="60" height="85" rx="6" />
            <rect x="365" y="100" width="50" height="85" rx="6" />

            <rect x="20" y="215" width="125" height="40" rx="6" />
            <rect x="175" y="215" width="70" height="40" rx="6" />
            <rect x="275" y="215" width="60" height="40" rx="6" />
            <rect x="365" y="215" width="50" height="40" rx="6" />
            <rect x="445" y="165" width="70" height="90" rx="6" />
            <rect x="545" y="165" width="80" height="90" rx="6" />
            <rect x="655" y="165" width="125" height="90" rx="6" />

            <rect x="20" y="285" width="125" height="45" rx="6" />
            <rect x="175" y="285" width="70" height="45" rx="6" />
            <rect x="275" y="285" width="140" height="95" rx="6" />
            <rect x="445" y="285" width="70" height="95" rx="6" />

            <rect x="20" y="355" width="225" height="65" rx="6" />
          </g>

          {/* Parks & Green Zones */}
          <rect x="20" y="100" width="125" height="85" rx="10" className="map-park" />
          <rect x="545" y="285" width="235" height="95" rx="10" className="map-park" />

          {/* Waterway */}
          <path
            d="M0 445 C180 415 340 465 540 425 S730 410 800 430 L800 500 L0 500Z"
            className="map-water"
          />
          <path
            d="M0 445 C180 415 340 465 540 425 S730 410 800 430"
            className="map-water-edge"
          />

          {/* Minor Streets (Casing + Fill) */}
          <g className="map-streets-minor-casing">
            {[90, 150, 340, 395].map((y) => (
              <line key={`mc-h${y}`} x1="0" y1={y} x2="800" y2={y} />
            ))}
            {[85, 260, 350, 430, 640, 730].map((x) => (
              <line key={`mc-v${x}`} x1={x} y1="0" x2={x} y2="450" />
            ))}
          </g>
          <g className="map-streets-minor">
            {[90, 150, 340, 395].map((y) => (
              <line key={`m-h${y}`} x1="0" y1={y} x2="800" y2={y} />
            ))}
            {[85, 260, 350, 430, 640, 730].map((x) => (
              <line key={`m-v${x}`} x1={x} y1="0" x2={x} y2="450" />
            ))}
          </g>

          {/* Major Arterial Roads (Casing + Fill + Centerline) */}
          <g className="map-streets-major-casing">
            <line x1="0" y1="200" x2="800" y2="200" />
            <line x1="0" y1="270" x2="800" y2="270" />
            <line x1="160" y1="0" x2="160" y2="450" />
            <line x1="530" y1="0" x2="530" y2="450" />
          </g>
          <g className="map-streets-major">
            <line x1="0" y1="200" x2="800" y2="200" />
            <line x1="0" y1="270" x2="800" y2="270" />
            <line x1="160" y1="0" x2="160" y2="450" />
            <line x1="530" y1="0" x2="530" y2="450" />
          </g>
          <g className="map-streets-centerline">
            <line x1="0" y1="200" x2="800" y2="200" />
            <line x1="0" y1="270" x2="800" y2="270" />
            <line x1="160" y1="0" x2="160" y2="450" />
            <line x1="530" y1="0" x2="530" y2="450" />
          </g>

          {/* Map Street & Area Labels */}
          <g className="map-labels">
            <text x="82" y="146" className="map-label-park">CENTRAL PARK</text>
            <text x="662" y="335" className="map-label-park">GREENBELT ZONE</text>
            <text x="680" y="468" className="map-label-water">METRO RIVER</text>

            <text x="235" y="194" className="map-label-street">SAMPAGUITA ST</text>
            <text x="415" y="264" className="map-label-street">EMERALD AVE</text>
            <text x="585" y="144" className="map-label-street">AURORA BLVD</text>
            <text x="70" y="334" className="map-label-street">SCOUT GANDIA ST</text>
            <text x="152" y="72" transform="rotate(-90 152 72)" className="map-label-street">EDSA CORRIDOR</text>
            <text x="522" y="82" transform="rotate(-90 522 82)" className="map-label-street">BGC / PASIG LINK</text>
          </g>

          {hasRoute && (
            <>
              {/* Secondary Kitchen Route (for multi-restaurant simultaneous orders) */}
              {secondaryLegPath && (
                <>
                  <path d={secondaryLegPath} className="map-route map-route--upcoming-casing" />
                  <path d={secondaryLegPath} className="map-route map-route--upcoming" />
                </>
              )}

              {/* Upcoming Leg (Dashed Green) */}
              {nextLegPath && (
                <>
                  <path d={nextLegPath} className="map-route map-route--upcoming-casing" />
                  <path d={nextLegPath} className="map-route map-route--upcoming" />
                </>
              )}

              {/* Active Leg (Solid Terracotta with White Casing & Direction Dots) */}
              <path d={legPath} className="map-route map-route--casing" />
              <path d={legPath} className="map-route map-route--active" />
              <path d={legPath} className="map-route map-route--flow" />

              {/* Secondary Kitchen Pin (when customer ordered from multiple kitchens at once) */}
              {secondaryPickup && (
                <g
                  className="map-pin map-pin--pickup"
                  transform={`translate(${secondaryPickupPoint.x} ${secondaryPickupPoint.y})`}
                >
                  <circle r="6" className="map-pin-anchor" />
                  <g filter="url(#map-pin-shadow)">
                    <path d="M0 -4 C-14 -4 -15 -30 0 -38 C15 -30 14 -4 0 -4Z" className="map-pin-body" />
                    <circle cy="-24" r="5" className="map-pin-dot" />
                  </g>
                  <g transform="translate(0, -45)" className="map-pin-badge">
                    <rect x="-74" y="-22" width="148" height="22" rx="11" className="map-pin-badge-bg map-pin-badge-bg--pickup" />
                    <text x="0" y="-7" textAnchor="middle" className="map-pin-badge-text">
                      2 · {secondaryPickupTitle.slice(0, 17)}
                    </text>
                  </g>
                </g>
              )}

              {/* Primary Pickup / Kitchen Pin */}
              <g
                className={`map-pin map-pin--pickup${!toDropoff ? ' is-current' : ''}`}
                transform={`translate(${pickupPoint.x} ${pickupPoint.y})`}
              >
                <circle r="24" className="map-pin-pulse" />
                <circle r="6" className="map-pin-anchor" />
                <g filter="url(#map-pin-shadow)">
                  <path d="M0 -4 C-15 -4 -16 -32 0 -40 C16 -32 15 -4 0 -4Z" className="map-pin-body" />
                  <circle cy="-25" r="5.5" className="map-pin-dot" />
                </g>
                <g transform="translate(0, -48)" className="map-pin-badge">
                  <rect x="-76" y="-24" width="152" height="24" rx="12" className="map-pin-badge-bg map-pin-badge-bg--pickup" />
                  <text x="0" y="-8" textAnchor="middle" className="map-pin-badge-text">
                    {isCustomer ? `🍽️ ${pickupTitle.slice(0, 17)}` : `1 · ${pickupTitle.slice(0, 18)}`}
                  </text>
                </g>
              </g>

              {/* Drop-off / Customer Home Pin */}
              <g
                className={`map-pin map-pin--dropoff${toDropoff ? ' is-current' : ''}`}
                transform={`translate(${dropoffPoint.x} ${dropoffPoint.y})`}
              >
                <circle r="24" className="map-pin-pulse" />
                <circle r="6" className="map-pin-anchor" />
                <g filter="url(#map-pin-shadow)">
                  <path d="M0 -4 C-15 -4 -16 -32 0 -40 C16 -32 15 -4 0 -4Z" className="map-pin-body" />
                  <circle cy="-25" r="5.5" className="map-pin-dot" />
                </g>
                <g transform="translate(0, -48)" className="map-pin-badge">
                  <rect x="-74" y="-24" width="148" height="24" rx="12" className="map-pin-badge-bg map-pin-badge-bg--dropoff" />
                  <text x="0" y="-8" textAnchor="middle" className="map-pin-badge-text">
                    {isCustomer ? `🏠 ${dropoffTitle.slice(0, 16)}` : `2 · ${dropoffTitle.slice(0, 18)}`}
                  </text>
                </g>
              </g>

              {/* Rider Position Marker */}
              <g transform={`translate(${riderPoint.x} ${riderPoint.y})`} className="map-rider">
                <path d="M0 0 L-26 -48 L26 -48 Z" fill="url(#rider-cone)" />
                <circle r="24" className="map-rider-halo" />
                <circle r="11" className="map-rider-core" filter="url(#map-pin-shadow)" />
                <circle r="4" className="map-rider-center" />
                <g transform="translate(0, 26)">
                  <rect
                    x={isCustomer ? '-46' : '-32'}
                    y="-12"
                    width={isCustomer ? '92' : '64'}
                    height="20"
                    rx="10"
                    className="map-rider-tag"
                  />
                  <text x="0" y="2" textAnchor="middle" className="map-rider-tag-text">
                    {isCustomer ? (riderName ? riderName.split(' ')[0].toUpperCase() : '🛵 RIDER') : 'YOU'}
                  </text>
                </g>
              </g>
            </>
          )}
        </svg>

        {hasRoute && (
          <>
            {/* Top HUD: Different Function for Customer vs Rider */}
            {isCustomer ? (
              <div className="map-nav-hud map-nav-hud--customer">
                <div className="map-nav-maneuver">
                  <span className="map-nav-turn-icon map-nav-turn-icon--customer" aria-hidden="true">
                    {toDropoff ? '🛵' : '🍳'}
                  </span>
                  <div className="map-nav-turn-copy">
                    <strong>
                      {customerStatusText ||
                        (toDropoff ? 'Rider is on the way to your address' : 'Kitchen is preparing your order')}
                    </strong>
                    <span>
                      {secondaryPickup
                        ? `Multi-kitchen order · ${pickupTitle} + ${secondaryPickupTitle}`
                        : `${pickupTitle} → ${dropoffTitle}`}
                    </span>
                  </div>
                </div>
                <div className="map-slot-chips">
                  {metrics?.eta && <span className="map-chip map-chip--eta">🕒 Est. {metrics.eta}</span>}
                  {metrics?.distance && <span className="map-chip">{metrics.distance}</span>}
                </div>
              </div>
            ) : (
              <div className="map-nav-hud">
                <div className="map-nav-maneuver">
                  <span className="map-nav-turn-icon" aria-hidden="true">↱</span>
                  <div className="map-nav-turn-copy">
                    <strong>{nextTurnDist} · {toDropoff ? 'Heading to Drop-off' : 'Heading to Pickup'}</strong>
                    <span>{nextTurnText}</span>
                  </div>
                </div>
                <div className="map-slot-chips">
                  {metrics?.eta && <span className="map-chip map-chip--eta">⏱ ETA {metrics.eta}</span>}
                  {metrics?.distance && <span className="map-chip">{metrics.distance}</span>}
                </div>
              </div>
            )}

            {/* Subbar: Customer Camera Focus Controls OR Rider Legend */}
            <div className="map-top-subbar">
              {isCustomer ? (
                <div className="map-customer-focus-bar" role="group" aria-label="Map camera focus">
                  <button
                    type="button"
                    className={`map-focus-btn ${focusTarget === 'overview' ? 'is-active' : ''}`}
                    onClick={() => handleCustomerFocus('overview')}
                  >
                    🗺️ Full Route
                  </button>
                  <button
                    type="button"
                    className={`map-focus-btn ${focusTarget === 'kitchen' ? 'is-active' : ''}`}
                    onClick={() => handleCustomerFocus('kitchen')}
                  >
                    🍽️ Kitchen
                  </button>
                  <button
                    type="button"
                    className={`map-focus-btn ${focusTarget === 'rider' ? 'is-active' : ''}`}
                    onClick={() => handleCustomerFocus('rider')}
                  >
                    🛵 Rider
                  </button>
                  <button
                    type="button"
                    className={`map-focus-btn ${focusTarget === 'home' ? 'is-active' : ''}`}
                    onClick={() => handleCustomerFocus('home')}
                  >
                    🏠 My Address
                  </button>
                </div>
              ) : (
                <>
                  <ul className="map-slot-legend" aria-label="Map legend">
                    <li><span className="map-legend-dot map-legend-dot--rider" />You</li>
                    <li><span className="map-legend-dot map-legend-dot--pickup" />Pickup</li>
                    <li><span className="map-legend-dot map-legend-dot--dropoff" />Drop-off</li>
                  </ul>
                  <span className="map-gps-pill">
                    <span className="map-gps-dot" aria-hidden="true" />
                    GPS Preview Active
                  </span>
                </>
              )}
            </div>

            {/* Right-hand Zoom & Recenter Controls */}
            <div className="map-slot-controls" role="group" aria-label="Map controls">
              <button
                type="button"
                aria-label="Zoom in"
                title="Zoom in"
                onClick={() => setZoom((z) => Math.min(MAX_ZOOM, +(z + 0.2).toFixed(1)))}
                disabled={zoom >= MAX_ZOOM}
              >
                +
              </button>
              <button
                type="button"
                aria-label="Zoom out"
                title="Zoom out"
                onClick={() => setZoom((z) => Math.max(MIN_ZOOM, +(z - 0.2).toFixed(1)))}
                disabled={zoom <= MIN_ZOOM}
              >
                −
              </button>
              <button
                type="button"
                aria-label="Recenter map"
                title="Reset view"
                onClick={() => {
                  setFocusTarget('overview');
                  setZoom(1);
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
                </svg>
              </button>
            </div>
          </>
        )}

        {showLabel && !hasRoute && <span className="map-slot-label">{label}</span>}
      </div>
    </div>
  );
}
