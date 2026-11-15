import { useCallback } from 'react';
import locationApiService from '../../services/locationApiService';
import SearchableLocationInput from './SearchableLocationInput';
import './PhilippineAddressFields.css';

/**
 * Standardized Philippine Address Hierarchy Fields:
 * 1. Country: Philippines (fixed)
 * 2. Province (searchable input)
 * 3. City / Municipality (searchable input, guided by Province)
 * 4. Barangay (searchable input, guided by City / Municipality)
 * 5. Street (manual input)
 * 6. House / Building Number (manual input)
 * 7. Additional Details (unit, floor, landmark, delivery instructions)
 */
export default function PhilippineAddressFields({
  value = {},
  onChange,
  errors = {},
  showStreetAndDetails = true,
  requireBarangay = true,
  requireCity = true,
  disabled = false,
}) {
  const province = value.province || '';
  const city = value.city || '';
  const barangay = value.barangay || '';

  const update = (patch) => {
    onChange?.({
      ...value,
      country: 'Philippines',
      ...patch,
    });
  };

  const fetchProvinces = useCallback(
    (q) => locationApiService.searchProvinces(q),
    [],
  );

  const fetchCities = useCallback(
    (q) => locationApiService.searchCities(province, q),
    [province],
  );

  const fetchBarangays = useCallback(
    (q) => locationApiService.searchBarangays(city, province, q),
    [city, province],
  );

  return (
    <div className="salo-ph-fields">
      <div className="salo-ph-country-bar">
        <span>Country</span>
        <strong>🇵🇭 Philippines (Default)</strong>
      </div>

      <div className="salo-ph-grid">
        <SearchableLocationInput
          label="Province"
          required
          value={province}
          placeholder="Search province (e.g. Metro Manila, Misamis Oriental)"
          disabled={disabled}
          error={errors.province}
          fetchSuggestions={fetchProvinces}
          onChangeText={(text) => update({ province: text })}
          onSelect={(name) => {
            if (name !== province) {
              update({ province: name, city: '', barangay: '' });
            }
          }}
        />

        <SearchableLocationInput
          label="City / Municipality"
          required={requireCity}
          value={city}
          placeholder={province ? `Search city in ${province}` : 'Select or type province first'}
          disabled={disabled}
          error={errors.city}
          fetchSuggestions={fetchCities}
          onChangeText={(text) => update({ city: text })}
          onSelect={(name) => {
            if (name !== city) {
              update({ city: name, barangay: '' });
            }
          }}
        />

        <SearchableLocationInput
          label="Barangay"
          required={requireBarangay}
          value={barangay}
          placeholder={city ? `Search barangay in ${city}` : 'Select or type city first'}
          disabled={disabled}
          error={errors.barangay}
          fetchSuggestions={fetchBarangays}
          onChangeText={(text) => update({ barangay: text })}
          onSelect={(name) => update({ barangay: name })}
        />

        {showStreetAndDetails && (
          <>
            <div className="salo-ph-field">
              <label className="salo-ph-label" htmlFor="salo-ph-postal">
                Postal Code (Optional)
              </label>
              <input
                id="salo-ph-postal"
                type="text"
                inputMode="numeric"
                maxLength={4}
                className={`salo-ph-input ${errors.postalCode ? 'is-error' : ''}`}
                value={value.postalCode || ''}
                placeholder="4-digit ZIP (e.g. 9000)"
                disabled={disabled}
                onChange={(e) => update({ postalCode: e.target.value.replace(/\D/g, '').slice(0, 4) })}
              />
              {errors.postalCode && <span className="salo-ph-error">{errors.postalCode}</span>}
            </div>

            <div className="salo-ph-field">
              <label className="salo-ph-label" htmlFor="salo-ph-street">
                Street <span className="salo-ph-required">*</span>
              </label>
              <input
                id="salo-ph-street"
                type="text"
                className={`salo-ph-input ${errors.street ? 'is-error' : ''}`}
                value={value.street || ''}
                placeholder="Street name, subdivision, or avenue"
                disabled={disabled}
                onChange={(e) => update({ street: e.target.value })}
              />
              {errors.street && <span className="salo-ph-error">{errors.street}</span>}
            </div>

            <div className="salo-ph-field">
              <label className="salo-ph-label" htmlFor="salo-ph-house">
                House / Building Number
              </label>
              <input
                id="salo-ph-house"
                type="text"
                className={`salo-ph-input ${errors.houseNumber ? 'is-error' : ''}`}
                value={value.houseNumber || ''}
                placeholder="House no., block & lot, or bldg no."
                disabled={disabled}
                onChange={(e) => update({ houseNumber: e.target.value })}
              />
              {errors.houseNumber && <span className="salo-ph-error">{errors.houseNumber}</span>}
            </div>

            <div className="salo-ph-field salo-ph-field--full">
              <label className="salo-ph-label" htmlFor="salo-ph-details">
                Additional Details (Unit, Floor, Landmark, Instructions)
              </label>
              <input
                id="salo-ph-details"
                type="text"
                className="salo-ph-input"
                value={value.notes ?? value.landmark ?? ''}
                placeholder="e.g. Unit 4B, 2nd Floor, near red gate / church"
                disabled={disabled}
                onChange={(e) => update({ notes: e.target.value, landmark: e.target.value })}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
