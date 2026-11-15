import { useState } from 'react';
import Button from '../../../components/common/Button';
import { PhilippineAddressFields } from '../../../components/location';
import LocationPickerModal from './LocationPickerModal';

export default function BusinessAddressStep({
  data,
  onChange,
  errors = {},
}) {
  const [mapModalOpen, setMapModalOpen] = useState(false);

  const handleAddressChange = (nextVal) => {
    onChange?.({
      ...data,
      province: nextVal.province ?? data.province,
      city: nextVal.city ?? data.city,
      barangay: nextVal.barangay ?? data.barangay,
      street: nextVal.street ?? data.street,
      houseNumber: nextVal.houseNumber ?? data.houseNumber,
      postalCode: nextVal.postalCode ?? data.postalCode,
      additionalDetails: nextVal.notes ?? nextVal.landmark ?? data.additionalDetails,
    });
  };

  const handleConfirmCoordinates = (coords) => {
    onChange?.({
      ...data,
      coordinates: { lat: coords.lat, lng: coords.lng },
      gpsAccuracy: coords.gpsAccuracy ?? null,
      mapPinned: true,
    });
  };

  const addressSummary = [
    data.houseNumber,
    data.street,
    data.barangay ? `Brgy. ${data.barangay}` : null,
    data.city,
    data.province,
    data.postalCode,
    'Philippines',
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="wizard-step-container">
      <div className="wizard-step-header">
        <h2 className="wizard-step-heading">Business Address & Physical Location</h2>
        <p className="wizard-step-subheading">
          Search your Philippine province, city/municipality, and barangay, enter your street and building number, and pin your exact kitchen location on the map.
        </p>
      </div>

      <div className="wizard-form-grid">
        <PhilippineAddressFields
          value={{
            province: data.province || '',
            city: data.city || '',
            barangay: data.barangay || '',
            street: data.street || '',
            houseNumber: data.houseNumber || '',
            postalCode: data.postalCode || '',
            notes: data.additionalDetails || '',
          }}
          onChange={handleAddressChange}
          errors={errors}
        />

        {/* Location Pin & Map Representation */}
        <div className="wizard-address-pin-card">
          <div className="pin-card-meta">
            <div className="pin-icon-wrap" aria-hidden="true">📍</div>
            <div className="pin-copy">
              <h4 className="pin-title">Map Pin & Rider Dispatch Coordinates</h4>
              <p className="pin-desc">
                {data.mapPinned && data.coordinates
                  ? `Pin set at ${Number(data.coordinates.lat).toFixed(6)}° N, ${Number(data.coordinates.lng).toFixed(6)}° E`
                  : 'Pin location not yet selected. Drop a pin on the map to assist rider navigation.'}
              </p>
              {addressSummary && (
                <span className="pin-address-crumb">
                  <strong>Registered Address:</strong> {addressSummary}
                </span>
              )}
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            size="md"
            onClick={() => setMapModalOpen(true)}
          >
            {data.mapPinned ? 'Adjust Pin on Map' : 'Drop Pin on Map'}
          </Button>
        </div>
      </div>

      <LocationPickerModal
        open={mapModalOpen}
        onClose={() => setMapModalOpen(false)}
        initialCoordinates={data.coordinates}
        addressSummary={addressSummary}
        onConfirmCoordinates={handleConfirmCoordinates}
      />
    </div>
  );
}
