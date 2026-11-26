/**
 * SALO — Address Service
 * Backed by /api/customer/addresses via locationApiService.
 * Maintains an in-memory cache for synchronous reads across components after fetch.
 */

import locationApiService from './locationApiService.js';
import { mergeLegacyStreetLine } from '../utils/addressFormatter.js';

export const ADDRESSES_CHANGED_EVENT = 'salo_addresses_changed';

let cachedAddresses = [];
let hasLoadedAddresses = false;
let inFlightFetchAddressesPromise = null;

function notifySubscribers() {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try {
      window.dispatchEvent(new CustomEvent(ADDRESSES_CHANGED_EVENT));
    } catch {
      // Ignore if event dispatch fails in restricted environments
    }
  }
}

export function mapBackendAddress(raw) {
  if (!raw) return null;
  return {
    id: raw.id,
    addressId: raw.address_id ?? raw.addressId ?? null,
    country: raw.country || 'Philippines',
    label: raw.label || 'Home',
    isDefault: Boolean(raw.is_default ?? raw.isDefault),
    province: raw.province || '',
    city: raw.city || '',
    barangay: raw.barangay || '',
    street: raw.street || '',
    houseNumber: raw.house_number ?? raw.houseNumber ?? '',
    buildingName: raw.building_name ?? raw.buildingName ?? '',
    notes: raw.landmark ?? raw.notes ?? '',
    landmark: raw.landmark ?? raw.notes ?? '',
    postalCode: raw.postal_code ?? raw.postalCode ?? '',
    lat: raw.latitude !== undefined ? raw.latitude : (raw.lat ?? null),
    lng: raw.longitude !== undefined ? raw.longitude : (raw.lng ?? null),
    gpsAccuracy: raw.gps_accuracy ?? raw.gpsAccuracy ?? null,
    isServiceAreaSupported: raw.is_service_area_supported ?? raw.isServiceAreaSupported ?? true,
    serviceAreaMessage: raw.service_area_message ?? raw.serviceAreaMessage ?? null,
  };
}

export function toBackendAddressPayload(data = {}) {
  const streetLine = mergeLegacyStreetLine(data);
  return {
    label: (data.label || 'Home').trim(),
    province: (data.province || '').trim(),
    city: (data.city || '').trim(),
    barangay: (data.barangay || '').trim(),
    street: streetLine,
    house_number: null,
    building_name: null,
    landmark: (data.notes || data.landmark || '').slice(0, 500).trim() || null,
    postal_code: data.postalCode ? String(data.postalCode).trim() : null,
    latitude: typeof data.lat === 'number' ? data.lat : null,
    longitude: typeof data.lng === 'number' ? data.lng : null,
    gps_accuracy: typeof data.gpsAccuracy === 'number' ? data.gpsAccuracy : null,
    is_default: Boolean(data.isDefault),
  };
}

function setCachedAddresses(list) {
  cachedAddresses = Array.isArray(list) ? list.map(mapBackendAddress).filter(Boolean) : [];
  hasLoadedAddresses = true;
  notifySubscribers();
  return cachedAddresses;
}

export const addressService = {
  isLoaded() {
    return hasLoadedAddresses;
  },

  getAddresses() {
    return cachedAddresses;
  },

  getDefaultAddress() {
    if (cachedAddresses.length === 0) return null;
    return cachedAddresses.find((a) => a.isDefault) || cachedAddresses[0] || null;
  },

  clearCache() {
    cachedAddresses = [];
    hasLoadedAddresses = false;
    notifySubscribers();
  },

  async fetchAddresses() {
    if (inFlightFetchAddressesPromise) {
      return inFlightFetchAddressesPromise;
    }

    inFlightFetchAddressesPromise = (async () => {
      try {
        const rows = await locationApiService.getCustomerAddresses();
        return setCachedAddresses(rows);
      } finally {
        inFlightFetchAddressesPromise = null;
      }
    })();

    return inFlightFetchAddressesPromise;
  },

  async loadAddresses() {
    if (hasLoadedAddresses) {
      return cachedAddresses;
    }
    return this.fetchAddresses();
  },

  async addAddress(rawAddress) {
    const created = await locationApiService.createCustomerAddress(toBackendAddressPayload(rawAddress));
    const mapped = mapBackendAddress(created);
    await this.fetchAddresses();
    return mapped;
  },

  async updateAddress(id, rawData) {
    const updated = await locationApiService.updateCustomerAddress(id, toBackendAddressPayload(rawData));
    const mapped = mapBackendAddress(updated);
    await this.fetchAddresses();
    return mapped;
  },

  async deleteAddress(id) {
    const rows = await locationApiService.deleteCustomerAddress(id);
    return setCachedAddresses(rows);
  },

  async setDefaultAddress(id) {
    const rows = await locationApiService.setDefaultCustomerAddress(id);
    return setCachedAddresses(rows);
  },

  checkDuplicate(addressData, excludeId = null) {
    const targetStreet = (addressData.street || '').trim().toLowerCase();
    const targetBarangay = (addressData.barangay || '').trim().toLowerCase();
    const targetCity = (addressData.city || '').trim().toLowerCase();

    if (!targetStreet || !targetCity) return false;

    return cachedAddresses.some((item) => {
      if (excludeId && item.id === excludeId) return false;
      const s = (item.street || '').trim().toLowerCase();
      const b = (item.barangay || '').trim().toLowerCase();
      const c = (item.city || '').trim().toLowerCase();

      return s === targetStreet && b === targetBarangay && c === targetCity;
    });
  },
};

export default addressService;
