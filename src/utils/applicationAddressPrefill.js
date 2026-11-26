import { mergeLegacyStreetLine } from './addressFormatter.js';

export function hasAddressData(address = {}) {
  if (!address || typeof address !== 'object') return false;
  return Boolean(String(address.street || '').trim());
}

export function mapSavedAddressToForm(savedAddress = null) {
  if (!savedAddress || typeof savedAddress !== 'object') return null;
  return {
    province: savedAddress.province || '',
    city: savedAddress.city || '',
    barangay: savedAddress.barangay || '',
    street: mergeLegacyStreetLine(savedAddress),
    houseNumber: '',
    buildingName: '',
    postalCode: savedAddress.postalCode || '',
    landmark: savedAddress.landmark || savedAddress.notes || '',
    notes: savedAddress.notes || savedAddress.landmark || '',
    lat: savedAddress.lat ?? null,
    lng: savedAddress.lng ?? null,
    latitude: savedAddress.lat ?? null,
    longitude: savedAddress.lng ?? null,
  };
}

export function shouldOfferSaveAddressToAccount(savedAddresses = [], currentAddress = {}) {
  if (Array.isArray(savedAddresses) && savedAddresses.length > 0) {
    return false;
  }
  return Boolean(
    String(currentAddress?.street || '').trim() &&
    String(currentAddress?.barangay || '').trim() &&
    String(currentAddress?.city || '').trim() &&
    String(currentAddress?.province || '').trim()
  );
}

/**
 * Filter municipality/city suggestions to the scope of the given province.
 */
export function filterMunicipalitiesByProvince(cities = [], province = '') {
  const cleanProv = String(province || '').trim().toLowerCase();
  return (Array.isArray(cities) ? cities : [])
    .filter((item) => {
      if (!item) return false;
      const itemProv = String(item.province_name || item.province || '').trim().toLowerCase();
      if (!cleanProv || !itemProv) return true;
      return itemProv === cleanProv;
    })
    .map((item) => (typeof item === 'string' ? item : item.city_name || item.name || ''))
    .filter(Boolean);
}

/**
 * Filter preferred base/barangay hub suggestions to the scope of the selected municipality.
 */
export function filterPreferredBasesByMunicipality(barangays = [], municipality = '') {
  const cleanCity = String(municipality || '').trim().toLowerCase();
  return (Array.isArray(barangays) ? barangays : [])
    .filter((item) => {
      if (!item) return false;
      const itemCity = String(item.city_name || item.city || '').trim().toLowerCase();
      if (!cleanCity || !itemCity) return true;
      return itemCity === cleanCity;
    })
    .map((item) => (typeof item === 'string' ? item : item.barangay_name || item.name || ''))
    .filter(Boolean);
}
