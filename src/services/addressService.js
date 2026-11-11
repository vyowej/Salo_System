/**
 * SALO — Address Service
 * Single source of truth adapter for customer saved delivery addresses.
 * Handles localStorage with graceful in-memory fallbacks and validation.
 */

const STORAGE_KEY = 'salo_customer_addresses';
export const ADDRESSES_CHANGED_EVENT = 'salo_addresses_changed';

// Initial Philippine mock dataset featuring Zamboanga City
export const INITIAL_ADDRESSES = [
  {
    id: 'addr-zamboanga-1',
    label: 'Home',
    recipientName: 'Cassandra Villafuerte',
    mobileNumber: '09171234567',
    phone: '09171234567',
    street: 'Villa Teresa Subd., Lot 14 Block 2',
    barangay: 'Tetuan',
    city: 'Zamboanga City',
    province: 'Zamboanga del Sur',
    postalCode: '7000',
    notes: 'Near San Roque Parish chapel, blue iron gate',
    isDefault: true,
    lat: 6.9214,
    lng: 122.079,
  },
  {
    id: 'addr-davao-2',
    label: 'Work',
    recipientName: 'Cassandra Villafuerte (Office)',
    mobileNumber: '09189876543',
    phone: '09189876543',
    street: '7th Floor, Felcris Centrale, Quimpo Blvd',
    barangay: 'Barangay 40-D',
    city: 'Davao City',
    province: 'Davao del Sur',
    postalCode: '8000',
    notes: 'Leave with 7F concierge reception desk',
    isDefault: false,
    lat: 7.0645,
    lng: 125.602,
  },
  {
    id: 'addr-cebu-3',
    label: 'School',
    recipientName: 'Cassandra Villafuerte',
    mobileNumber: '09223344556',
    phone: '09223344556',
    street: 'USC Talamban Campus, Dormitory Hall 3',
    barangay: 'Nasipit',
    city: 'Cebu City',
    province: 'Cebu',
    postalCode: '6000',
    notes: 'Call on mobile before arriving at dormitory security gate',
    isDefault: false,
    lat: 10.354,
    lng: 123.916,
  },
];

let inMemoryAddresses = [...INITIAL_ADDRESSES];

function generateUniqueId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `addr-${crypto.randomUUID()}`;
  }
  return `addr-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

function notifySubscribers() {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try {
      window.dispatchEvent(new CustomEvent(ADDRESSES_CHANGED_EVENT));
    } catch {
      // Ignore if event dispatch fails in restricted environments
    }
  }
}

function persistAddresses(addresses) {
  inMemoryAddresses = addresses;
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(addresses));
      // Backwards compatibility with existing customerService key
      localStorage.setItem('salo_addresses', JSON.stringify(addresses));
    } catch {
      // localStorage quota exceeded or unavailable; memory fallback remains intact
    }
  }
  notifySubscribers();
  return addresses;
}

export const addressService = {
  /**
   * Retrieves all saved customer addresses
   */
  getAddresses() {
    if (typeof localStorage !== 'undefined') {
      try {
        const stored = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('salo_addresses');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            inMemoryAddresses = parsed;
            return parsed;
          }
        }
      } catch {
        // Parse failure: use inMemory fallback
      }
    }
    return inMemoryAddresses;
  },

  /**
   * Returns the customer's default delivery address
   */
  getDefaultAddress() {
    const list = this.getAddresses();
    if (list.length === 0) return null;
    return list.find((a) => a.isDefault) || list[0] || null;
  },

  /**
   * Adds a new address to the address book
   * Soft limit: 10 addresses
   */
  addAddress(rawAddress) {
    const list = this.getAddresses();
    if (list.length >= 10) {
      throw new Error('Address limit reached (maximum 10 saved addresses). Please edit or delete an existing address.');
    }

    const id = rawAddress.id || generateUniqueId();
    const isFirst = list.length === 0;
    const shouldBeDefault = Boolean(rawAddress.isDefault) || isFirst;

    const newAddress = {
      ...rawAddress,
      id,
      label: rawAddress.label || 'Home',
      customLabel: (rawAddress.customLabel || '').trim(),
      recipientName: (rawAddress.recipientName || '').trim(),
      mobileNumber: (rawAddress.mobileNumber || rawAddress.phone || '').trim(),
      phone: (rawAddress.mobileNumber || rawAddress.phone || '').trim(),
      street: (rawAddress.street || '').trim(),
      barangay: (rawAddress.barangay || '').trim(),
      city: (rawAddress.city || '').trim(),
      province: (rawAddress.province || '').trim(),
      postalCode: (rawAddress.postalCode || '').trim(),
      notes: (rawAddress.notes || '').slice(0, 200).trim(),
      lat: typeof rawAddress.lat === 'number' ? rawAddress.lat : null,
      lng: typeof rawAddress.lng === 'number' ? rawAddress.lng : null,
      isDefault: shouldBeDefault,
    };

    let nextList;
    if (shouldBeDefault) {
      nextList = list.map((a) => ({ ...a, isDefault: false }));
      nextList.push(newAddress);
    } else {
      nextList = [...list, newAddress];
    }

    persistAddresses(nextList);
    return newAddress;
  },

  /**
   * Updates an existing address by id
   */
  updateAddress(id, rawData) {
    const list = this.getAddresses();
    const existingIndex = list.findIndex((a) => a.id === id);
    if (existingIndex === -1) {
      throw new Error('Address not found.');
    }

    const existing = list[existingIndex];
    const shouldBeDefault = Boolean(rawData.isDefault);

    const updated = {
      ...existing,
      ...rawData,
      id,
      label: rawData.label || existing.label || 'Home',
      customLabel: rawData.customLabel != null ? String(rawData.customLabel).trim() : (existing.customLabel || ''),
      recipientName: rawData.recipientName != null ? String(rawData.recipientName).trim() : existing.recipientName,
      mobileNumber: (rawData.mobileNumber || rawData.phone || existing.mobileNumber || existing.phone || '').trim(),
      phone: (rawData.mobileNumber || rawData.phone || existing.mobileNumber || existing.phone || '').trim(),
      street: rawData.street != null ? String(rawData.street).trim() : existing.street,
      barangay: rawData.barangay != null ? String(rawData.barangay).trim() : existing.barangay,
      city: rawData.city != null ? String(rawData.city).trim() : existing.city,
      province: rawData.province != null ? String(rawData.province).trim() : existing.province,
      postalCode: rawData.postalCode != null ? String(rawData.postalCode).trim() : (existing.postalCode || ''),
      notes: rawData.notes != null ? String(rawData.notes).slice(0, 200).trim() : (existing.notes || ''),
      lat: typeof rawData.lat === 'number' ? rawData.lat : existing.lat ?? null,
      lng: typeof rawData.lng === 'number' ? rawData.lng : existing.lng ?? null,
      isDefault: shouldBeDefault || existing.isDefault,
    };

    let nextList;
    if (shouldBeDefault) {
      nextList = list.map((a) => (a.id === id ? { ...updated, isDefault: true } : { ...a, isDefault: false }));
    } else {
      nextList = list.map((a) => (a.id === id ? updated : a));
    }

    persistAddresses(nextList);
    return updated;
  },

  /**
   * Deletes an address by id.
   * If the deleted address was default, the next remaining address becomes default.
   */
  deleteAddress(id) {
    const list = this.getAddresses();
    const target = list.find((a) => a.id === id);
    if (!target) return list;

    const remaining = list.filter((a) => a.id !== id);

    if (remaining.length > 0 && target.isDefault) {
      remaining[0] = { ...remaining[0], isDefault: true };
    }

    persistAddresses(remaining);
    return remaining;
  },

  /**
   * Sets the address with the given ID as the default
   */
  setDefaultAddress(id) {
    const list = this.getAddresses();
    const nextList = list.map((a) => ({
      ...a,
      isDefault: a.id === id,
    }));
    persistAddresses(nextList);
    return nextList;
  },

  /**
   * Non-blocking check for potential duplicate addresses
   */
  checkDuplicate(addressData, excludeId = null) {
    const list = this.getAddresses();
    const targetStreet = (addressData.street || '').trim().toLowerCase();
    const targetBarangay = (addressData.barangay || '').trim().toLowerCase();
    const targetCity = (addressData.city || '').trim().toLowerCase();

    if (!targetStreet || !targetCity) return false;

    return list.some((item) => {
      if (excludeId && item.id === excludeId) return false;
      const s = (item.street || '').trim().toLowerCase();
      const b = (item.barangay || '').trim().toLowerCase();
      const c = (item.city || '').trim().toLowerCase();

      return s === targetStreet && b === targetBarangay && c === targetCity;
    });
  },
};

export default addressService;
