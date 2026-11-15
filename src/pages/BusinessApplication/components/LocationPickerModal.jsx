import { useEffect, useState } from 'react';
import Modal from '../../../components/common/Modal';
import Button from '../../../components/common/Button';
import { LocationPicker } from '../../../components/location';
import './LocationPickerModal.css';

export default function LocationPickerModal({
  open,
  onClose,
  initialCoordinates = { lat: 14.5995, lng: 120.9842 },
  addressSummary = '',
  onConfirmCoordinates,
}) {
  const [locValue, setLocValue] = useState({
    lat: initialCoordinates?.lat ?? 14.5995,
    lng: initialCoordinates?.lng ?? 120.9842,
    gpsAccuracy: null,
  });

  useEffect(() => {
    if (!open) return;
    setLocValue({
      lat: initialCoordinates?.lat ?? 14.5995,
      lng: initialCoordinates?.lng ?? 120.9842,
      gpsAccuracy: null,
    });
  }, [open, initialCoordinates?.lat, initialCoordinates?.lng]);

  const handleConfirm = () => {
    if (Number.isFinite(Number(locValue.lat)) && Number.isFinite(Number(locValue.lng))) {
      onConfirmCoordinates?.({
        lat: Number(locValue.lat),
        lng: Number(locValue.lng),
        gpsAccuracy: locValue.gpsAccuracy ?? null,
      });
    }
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Set Restaurant Map Pin" size="lg">
      <div className="loc-picker-container">
        <p className="loc-picker-instructions">
          Search your restaurant location, use your current GPS position, or drag the pin on the map to your kitchen dispatch entrance.
        </p>

        {addressSummary && (
          <div className="loc-address-preview" title={addressSummary}>
            <strong>Registered Address:</strong> {addressSummary}
          </div>
        )}

        <LocationPicker
          value={locValue}
          onChange={setLocValue}
          showAddressFields={false}
          mapHeight={320}
          confirmLabel="Selected Restaurant Pin"
        />

        <div className="loc-picker-footer">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant="primary" onClick={handleConfirm}>
            Confirm Map Pin
          </Button>
        </div>
      </div>
    </Modal>
  );
}
