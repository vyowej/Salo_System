import './MapSlot.css';

export default function MapSlot({
  pickup: _pickup,
  dropoff: _dropoff,
  riderLocation: _riderLocation,
  label = 'Map will appear here',
  showLabel = true,
  className = '',
}) {
  return (
    <div className={`map-slot ${className}`.trim()} aria-label="Map placeholder">
      <div className="map-slot-surface" aria-hidden="true">
        <div className="map-slot-outline" />
        {showLabel && <span className="map-slot-label">{label}</span>}
      </div>
    </div>
  );
}
