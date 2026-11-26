import { useCallback, useEffect, useRef, useState } from 'react';
import {
  geocodeAddress,
  reverseGeocode,
  searchPhilippinePlaces,
} from '../../services/geocodingService';
import CurrentLocationButton from './CurrentLocationButton';
import PhilippineAddressFields from './PhilippineAddressFields';
import SharedMap from './SharedMap';
import { formatFormalAddress, mergeLegacyStreetLine } from '../../utils/addressFormatter';
import './LocationPicker.css';

const DEFAULT_CENTER = { lat: 14.5995, lng: 120.9842 }; // Manila, Philippines

export default function LocationPicker({
  value = {},
  onChange,
  errors = {},
  mapHeight = 280,
  showAddressFields = true,
  requireBarangay = true,
  serviceAreaStatus = null, // { supported: bool, reason: string } | null
  confirmLabel = 'Selected Location Summary',
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null); // { type, text }
  const [reverseLoading, setReverseLoading] = useState(false);

  const latestValueRef = useRef(value);
  useEffect(() => {
    latestValueRef.current = value;
  }, [value]);

  const lat = Number.isFinite(Number(value.lat ?? value.latitude)) ? Number(value.lat ?? value.latitude) : null;
  const lng = Number.isFinite(Number(value.lng ?? value.longitude)) ? Number(value.lng ?? value.longitude) : null;
  const accuracy = Number.isFinite(Number(value.gpsAccuracy ?? value.gps_accuracy))
    ? Number(value.gpsAccuracy ?? value.gps_accuracy)
    : null;

  const mapCenter = lat !== null && lng !== null ? { lat, lng } : DEFAULT_CENTER;

  // Debounced OpenStreetMap Nominatim place search
  useEffect(() => {
    const clean = searchQuery.trim();
    if (clean.length < 3) {
      setSearchResults([]);
      return undefined;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await searchPhilippinePlaces(clean);
        if (!cancelled) {
          setSearchResults(results);
        }
      } catch {
        if (!cancelled) setSearchResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 1000);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery]);

  const applyReverseGeocoding = useCallback(
    async (nextLat, nextLng, extraPatch = {}) => {
      const base = {
        ...latestValueRef.current,
        ...extraPatch,
        lat: nextLat,
        lng: nextLng,
        latitude: nextLat,
        longitude: nextLng,
      };
      onChange?.(base);

      setReverseLoading(true);
      try {
        const result = await reverseGeocode(nextLat, nextLng);
        const c = result?.components || {};
        const current = latestValueRef.current;

        // Preserve manually entered/verified fields when geocoder result is incomplete
        const merged = {
          ...current,
          ...extraPatch,
          lat: nextLat,
          lng: nextLng,
          latitude: nextLat,
          longitude: nextLng,
          country: 'Philippines',
          province: c.province || current.province || '',
          city: c.city || current.city || '',
          barangay: c.barangay || current.barangay || '',
          street: mergeLegacyStreetLine({
            houseNumber: c.houseNumber || current.houseNumber || '',
            street: c.street || current.street || '',
          }),
          houseNumber: '',
          buildingName: '',
          postalCode: current.postalCode || c.postalCode || '',
        };
        onChange?.(merged);

        if (!c.barangay || !c.street) {
          setStatusMessage({
            type: 'warning',
            text: 'Pin updated, but street or barangay details from the map were incomplete. Please verify and fill in any missing Philippine address fields below.',
          });
        }
      } catch {
        setStatusMessage({
          type: 'warning',
          text: 'Coordinates saved, but reverse geocoding is unavailable right now. Please enter or verify your address fields manually.',
        });
      } finally {
        setReverseLoading(false);
      }
    },
    [onChange],
  );

  const handlePinChange = useCallback(
    ({ lat: nextLat, lng: nextLng }) => {
      setStatusMessage({
        type: 'info',
        text: 'Pin moved. Coordinates updated — please confirm the address details below.',
      });
      applyReverseGeocoding(nextLat, nextLng, { gpsAccuracy: null, gps_accuracy: null });
    },
    [applyReverseGeocoding],
  );

  const handleCurrentLocation = useCallback(
    ({ lat: nextLat, lng: nextLng, accuracy: nextAccuracy }) => {
      const isPoorAccuracy = nextAccuracy !== null && nextAccuracy > 100;
      setStatusMessage({
        type: isPoorAccuracy ? 'warning' : 'success',
        text: isPoorAccuracy
          ? `GPS detected (±${nextAccuracy} m — approximate). Please drag the pin on the map to your exact building or gate.`
          : `GPS location detected${nextAccuracy !== null ? ` (±${nextAccuracy} m accuracy)` : ''}. Verify the pin and address details below.`,
      });
      applyReverseGeocoding(nextLat, nextLng, {
        gpsAccuracy: nextAccuracy,
        gps_accuracy: nextAccuracy,
      });
    },
    [applyReverseGeocoding],
  );

  const handleSelectPlace = async (item) => {
    setSearchResults([]);
    setSearchQuery(item.description || '');
    if (item && Number.isFinite(item.lat) && Number.isFinite(item.lng)) {
      const c = item.components || {};
      const current = latestValueRef.current;
      onChange?.({
        ...current,
        country: 'Philippines',
        lat: Number(item.lat.toFixed(6)),
        lng: Number(item.lng.toFixed(6)),
        latitude: Number(item.lat.toFixed(6)),
        longitude: Number(item.lng.toFixed(6)),
        province: c.province || current.province || '',
        city: c.city || current.city || '',
        barangay: c.barangay || current.barangay || '',
        street: mergeLegacyStreetLine({
          houseNumber: c.houseNumber || current.houseNumber || '',
          street: c.street || current.street || '',
        }),
        houseNumber: '',
        buildingName: '',
        postalCode: current.postalCode || c.postalCode || '',
        gpsAccuracy: null,
        gps_accuracy: null,
      });
      setStatusMessage({
        type: 'success',
        text: 'Location found on map. Drag the pin if you need to adjust the exact entrance.',
      });
    } else {
      setStatusMessage({
        type: 'error',
        text: 'Could not retrieve coordinates for that place. Try clicking directly on the map.',
      });
    }
  };

  const handleManualGeocodeSearch = async () => {
    const clean = searchQuery.trim();
    if (!clean) return;
    setSearching(true);
    try {
      const res = await geocodeAddress(clean);
      if (res) {
        await handleSelectPlace(res);
      } else {
        setStatusMessage({
          type: 'warning',
          text: 'No matching address found on the map. Try a nearby landmark or click the map to pin.',
        });
      }
    } catch {
      setStatusMessage({
        type: 'error',
        text: 'Address search failed. Please try again or enter your address manually.',
      });
    } finally {
      setSearching(false);
    }
  };

  const formattedSummary = formatFormalAddress(value);

  return (
    <div className="salo-loc-picker">
      {/* Search + Use My Current Location */}
      <div className="salo-loc-toolbar">
        <div className="salo-loc-search-wrap">
          <input
            type="text"
            className="salo-loc-search-input"
            value={searchQuery}
            placeholder="Search street, barangay, or nearby landmark in the Philippines…"
            aria-label="Search address or landmark"
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleManualGeocodeSearch();
              }
            }}
          />
          {(searchResults.length > 0 || searching) && (
            <ul className="salo-loc-search-results" role="listbox">
              {searching && (
                <li className="salo-loc-search-item">
                  <span>Searching places…</span>
                </li>
              )}
              {searchResults.map((item, idx) => (
                <li key={item.placeId || idx}>
                  <button
                    type="button"
                    className="salo-loc-search-item"
                    onClick={() => handleSelectPlace(item)}
                  >
                    <strong>{item.mainText || item.description}</strong>
                    {item.secondaryText && <span>{item.secondaryText}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <CurrentLocationButton
          onLocated={handleCurrentLocation}
          onError={(msg) => setStatusMessage({ type: 'error', text: msg })}
        />
      </div>

      {statusMessage && (
        <div className={`salo-loc-status-banner is-${statusMessage.type}`} role="status">
          {statusMessage.text}
          {reverseLoading ? ' Updating address…' : ''}
        </div>
      )}

      {/* Interactive Map */}
      <SharedMap
        center={mapCenter}
        zoom={lat !== null && lng !== null ? 16 : 6}
        height={mapHeight}
        pin={lat !== null && lng !== null ? { lat, lng, draggable: true, title: 'Selected Pin' } : null}
        onPinChange={handlePinChange}
        ariaLabel="Interactive location picker map"
      />

      {errors.coordinates && <span className="salo-ph-error">{errors.coordinates}</span>}

      {/* Address Fields */}
      {showAddressFields && (
        <PhilippineAddressFields
          value={value}
          onChange={onChange}
          errors={errors}
          requireBarangay={requireBarangay}
        />
      )}

      {/* Confirmation Summary */}
      <div className="salo-loc-confirm-box" aria-live="polite">
        <div className="salo-loc-confirm-box__row">
          <strong>{confirmLabel}</strong>
          <span>
            {lat !== null && lng !== null
              ? `Coordinates: ${lat.toFixed(6)}, ${lng.toFixed(6)}${accuracy !== null ? ` (±${accuracy} m)` : ''}`
              : 'No map pin placed yet — click the map or use GPS'}
          </span>
        </div>
        <div>{formattedSummary || 'Enter your Philippine address details above.'}</div>
        {serviceAreaStatus && (
          <div className={`salo-loc-status-banner ${serviceAreaStatus.supported ? 'is-success' : 'is-warning'}`}>
            {serviceAreaStatus.supported ? '✓ ' : '⚠ '}
            {serviceAreaStatus.reason}
          </div>
        )}
      </div>
    </div>
  );
}
