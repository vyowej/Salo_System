import { useState } from 'react';
import Modal from '../../../components/common/Modal';
import Button from '../../../components/common/Button';
import './LocationPickerModal.css';

const PRESET_PINS = [
  { label: 'Scout Rallos / Tomas Morato, Quezon City', lat: 14.6369, lng: 121.0362 },
  { label: 'BGC High Street, Taguig City', lat: 14.5507, lng: 121.0509 },
  { label: 'Poblacion Heritage District, Makati City', lat: 14.5652, lng: 121.0315 },
  { label: 'Kapitolyo Gastronomy Hub, Pasig City', lat: 14.5768, lng: 121.0601 },
  { label: 'Cebu IT Park, Cebu City', lat: 10.3297, lng: 123.9065 },
];

export default function LocationPickerModal({
  open,
  onClose,
  initialCoordinates = { lat: 14.6369, lng: 121.0362 },
  addressSummary = '',
  onConfirmCoordinates,
}) {
  const [coordinates, setCoordinates] = useState(initialCoordinates);
  const [pinOffset, setPinOffset] = useState({ x: 50, y: 50 }); // percentage on map surface

  const handleMapClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(10, Math.min(90, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(10, Math.min(90, ((e.clientY - rect.top) / rect.height) * 100));
    setPinOffset({ x, y });

    // Slightly adjust coordinates around base
    const baseLat = 14.6369 + (50 - y) * 0.0015;
    const baseLng = 121.0362 + (x - 50) * 0.0015;
    setCoordinates({
      lat: parseFloat(baseLat.toFixed(6)),
      lng: parseFloat(baseLng.toFixed(6)),
    });
  };

  const handlePresetSelect = (preset) => {
    setCoordinates({ lat: preset.lat, lng: preset.lng });
    setPinOffset({ x: 50, y: 50 });
  };

  const handleConfirm = () => {
    onConfirmCoordinates?.(coordinates);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Set Restaurant Map Pin"
      size="lg"
    >
      <div className="loc-picker-container">
        <p className="loc-picker-instructions">
          Drop a pin at the entrance or kitchen dispatch gate of your food establishment.
          Customers and riders will use this location for dispatch calculation and directions.
        </p>

        {/* Map Placeholder Surface */}
        <div
          className="loc-picker-map-surface"
          onClick={handleMapClick}
          role="button"
          tabIndex={0}
          aria-label="Click to place map pin"
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleMapClick(e);
          }}
        >
          {/* Stylized Map Vector Grid Background */}
          <div className="loc-map-roads" aria-hidden="true">
            <div className="loc-road road-h-1" />
            <div className="loc-road road-h-2" />
            <div className="loc-road road-v-1" />
            <div className="loc-road road-v-2" />
            <div className="loc-block block-1" />
            <div className="loc-block block-2" />
            <div className="loc-block block-3" />
          </div>

          {/* Interactive Dropped Pin */}
          <div
            className="loc-pin-marker"
            style={{ left: `${pinOffset.x}%`, top: `${pinOffset.y}%` }}
            aria-hidden="true"
          >
            <div className="loc-pin-glow" />
            <div className="loc-pin-icon">📍</div>
            <span className="loc-pin-bubble">Kitchen Entrance</span>
          </div>

          <div className="loc-map-click-hint">Click anywhere on the map grid to adjust pin</div>
        </div>

        {/* Coordinates readout & presets */}
        <div className="loc-picker-meta-bar">
          <div className="loc-coords-badge">
            <span className="loc-coords-label">Coordinates:</span>
            <span className="loc-coords-val">
              {coordinates.lat.toFixed(6)}° N, {coordinates.lng.toFixed(6)}° E
            </span>
          </div>
          {addressSummary && (
            <div className="loc-address-preview" title={addressSummary}>
              <strong>Address:</strong> {addressSummary}
            </div>
          )}
        </div>

        <div className="loc-presets-section">
          <span className="loc-presets-title">Quick Metropolitan Presets:</span>
          <div className="loc-presets-pills">
            {PRESET_PINS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                className="loc-preset-btn"
                onClick={() => handlePresetSelect(preset)}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div className="loc-picker-disclaimer">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <span>
            Frontend demonstration map. During live onboarding, this connects to SALO’s geocoding & mapping services.
          </span>
        </div>

        <div className="loc-picker-actions">
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="button" onClick={handleConfirm}>
            Confirm Location Pin
          </Button>
        </div>
      </div>
    </Modal>
  );
}
