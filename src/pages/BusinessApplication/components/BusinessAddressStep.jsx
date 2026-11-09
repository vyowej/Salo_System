import { useState } from 'react';
import { Input, Select, Textarea, FormGroup, Label, HelperText } from '../../../components/forms';
import Button from '../../../components/common/Button';
import LocationPickerModal from './LocationPickerModal';
import { PHILIPPINE_LOCATIONS } from '../constants/applicationDefaults';

export default function BusinessAddressStep({
  data,
  onChange,
  errors = {},
}) {
  const [mapModalOpen, setMapModalOpen] = useState(false);

  const regionOptions = Object.keys(PHILIPPINE_LOCATIONS);
  const currentRegion = data.region || regionOptions[0];

  const provinceOptions = Object.keys(PHILIPPINE_LOCATIONS[currentRegion] || {});
  const currentProvince = data.province || provinceOptions[0];

  const cityOptions = Object.keys(PHILIPPINE_LOCATIONS[currentRegion]?.[currentProvince] || {});
  const currentCity = data.city || cityOptions[0];

  const barangayOptions = PHILIPPINE_LOCATIONS[currentRegion]?.[currentProvince]?.[currentCity] || [];

  const handleRegionChange = (newRegion) => {
    const provs = Object.keys(PHILIPPINE_LOCATIONS[newRegion] || {});
    const firstProv = provs[0] || '';
    const cities = Object.keys(PHILIPPINE_LOCATIONS[newRegion]?.[firstProv] || {});
    const firstCity = cities[0] || '';
    const brgys = PHILIPPINE_LOCATIONS[newRegion]?.[firstProv]?.[firstCity] || [];
    const firstBrgy = brgys[0] || '';

    onChange?.({
      ...data,
      region: newRegion,
      province: firstProv,
      city: firstCity,
      barangay: firstBrgy,
    });
  };

  const handleProvinceChange = (newProvince) => {
    const cities = Object.keys(PHILIPPINE_LOCATIONS[currentRegion]?.[newProvince] || {});
    const firstCity = cities[0] || '';
    const brgys = PHILIPPINE_LOCATIONS[currentRegion]?.[newProvince]?.[firstCity] || [];
    const firstBrgy = brgys[0] || '';

    onChange?.({
      ...data,
      province: newProvince,
      city: firstCity,
      barangay: firstBrgy,
    });
  };

  const handleCityChange = (newCity) => {
    const brgys = PHILIPPINE_LOCATIONS[currentRegion]?.[currentProvince]?.[newCity] || [];
    const firstBrgy = brgys[0] || '';

    onChange?.({
      ...data,
      city: newCity,
      barangay: firstBrgy,
    });
  };

  const handleFieldChange = (field, value) => {
    onChange?.({
      ...data,
      [field]: value,
    });
  };

  const handleConfirmCoordinates = (coords) => {
    onChange?.({
      ...data,
      coordinates: coords,
      mapPinned: true,
    });
  };

  const addressSummary = [
    data.street,
    data.barangay ? `Brgy. ${data.barangay}` : null,
    data.city,
    data.province,
    data.postalCode,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="wizard-step-container">
      <div className="wizard-step-header">
        <h2 className="wizard-step-heading">Business Address & Physical Location</h2>
        <p className="wizard-step-subheading">
          Enter the exact physical location where your kitchen prepares food and where riders will arrive for order dispatch.
        </p>
      </div>

      <div className="wizard-form-grid">
        <div className="grid-cols-2">
          <Select
            id="addr-region"
            label="Administrative Region"
            value={currentRegion}
            onChange={(e) => handleRegionChange(e.target.value)}
            required
          >
            {regionOptions.map((reg) => (
              <option key={reg} value={reg}>
                {reg}
              </option>
            ))}
          </Select>

          <Select
            id="addr-province"
            label="Province / District"
            value={currentProvince}
            onChange={(e) => handleProvinceChange(e.target.value)}
            required
          >
            {provinceOptions.map((prov) => (
              <option key={prov} value={prov}>
                {prov}
              </option>
            ))}
          </Select>
        </div>

        <div className="grid-cols-2">
          <Select
            id="addr-city"
            label="City / Municipality"
            value={currentCity}
            onChange={(e) => handleCityChange(e.target.value)}
            required
          >
            {cityOptions.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </Select>

          {barangayOptions.length > 0 ? (
            <Select
              id="addr-barangay-select"
              label="Barangay"
              value={data.barangay || barangayOptions[0]}
              onChange={(e) => handleFieldChange('barangay', e.target.value)}
              required
            >
              {barangayOptions.map((brgy) => (
                <option key={brgy} value={brgy}>
                  {brgy}
                </option>
              ))}
            </Select>
          ) : (
            <Input
              id="addr-barangay-input"
              label="Barangay"
              placeholder="e.g. Barangay San Antonio"
              value={data.barangay || ''}
              onChange={(e) => handleFieldChange('barangay', e.target.value)}
              required
              error={errors.barangay}
            />
          )}
        </div>

        <div className="grid-cols-3-1">
          <Input
            id="addr-street"
            label="Street / Building / Unit / House Number"
            placeholder="e.g. Unit 4B, 15 Scout Rallos St., cor. Tomas Morato"
            value={data.street || ''}
            onChange={(e) => handleFieldChange('street', e.target.value)}
            error={errors.street}
            required
            helper="Include building name and floor number if located in a commercial complex."
          />

          <Input
            id="addr-postal"
            label="Postal Code"
            placeholder="e.g. 1103"
            value={data.postalCode || ''}
            onChange={(e) => handleFieldChange('postalCode', e.target.value.replace(/\D/g, '').slice(0, 4))}
            error={errors.postalCode}
            required
          />
        </div>

        <FormGroup>
          <Label htmlFor="addr-additional">Nearby Landmarks & Dispatch Instructions (Optional)</Label>
          <Textarea
            id="addr-additional"
            rows={2}
            placeholder="e.g. Beside Shell Gas Station, pick up orders at side dispatch window facing 11th Avenue."
            value={data.additionalDetails || ''}
            onChange={(e) => handleFieldChange('additionalDetails', e.target.value)}
          />
          <HelperText>
            Specific pickup guidelines shared with delivery couriers upon order readiness.
          </HelperText>
        </FormGroup>

        {/* Location Pin & Map Representation */}
        <div className="wizard-address-pin-card">
          <div className="pin-card-meta">
            <div className="pin-icon-wrap" aria-hidden="true">📍</div>
            <div className="pin-copy">
              <h4 className="pin-title">Map Pin & Rider Dispatch Coordinates</h4>
              <p className="pin-desc">
                {data.mapPinned && data.coordinates
                  ? `Pin set at ${data.coordinates.lat.toFixed(6)}° N, ${data.coordinates.lng.toFixed(6)}° E`
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
