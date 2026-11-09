import './MapPanel.css';

export default function MapPanel({
  stale = false,
  pickupLabel = 'Pickup',
  riderLabel = 'You',
  dropoffLabel = 'Drop-off',
  statusText = 'Location outdated',
}) {
  return (
    <div className="rider-map-panel" aria-label="Delivery route map panel">
      <div className={`rider-map-surface ${stale ? 'is-stale' : ''}`}>
        <div className="rider-map-route" aria-hidden="true" />
        <span className="rider-map-marker rider-marker">{riderLabel}</span>
        <span className="rider-map-marker pickup-marker">{pickupLabel}</span>
        <span className="rider-map-marker dropoff-marker">{dropoffLabel}</span>
        {stale && <span className="rider-map-status">{statusText}</span>}
      </div>
    </div>
  );
}
