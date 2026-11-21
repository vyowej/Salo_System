/**
 * SALO — Contact Number Service
 * Backed by /api/account/contact-numbers via accountService.
 * Maintains an in-memory cache scoped to the authenticated user ID (no localStorage).
 */

import accountService from './accountService.js';

export const CONTACT_NUMBERS_CHANGED_EVENT = 'salo_contact_numbers_changed';
export const MAX_SAVED_CONTACT_NUMBERS = 10;

let cachedContacts = [];
let hasLoadedContacts = false;
let loadedForUserId = null;
let inFlightFetchPromise = null;
let inFlightUserId = null;

function notifySubscribers() {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try {
      window.dispatchEvent(new CustomEvent(CONTACT_NUMBERS_CHANGED_EVENT));
    } catch {
      // Ignore if event dispatch fails in restricted environments
    }
  }
}

export function mapBackendContact(raw) {
  if (!raw) return null;
  const id = raw.id ?? raw.contact_id;
  return {
    id,
    contactId: raw.contact_id ?? raw.id,
    label: raw.label || 'Personal',
    phoneNumber: raw.phone_number ?? raw.phoneNumber ?? '',
    isDefault: Boolean(raw.is_default ?? raw.isDefault),
    createdAt: raw.created_at ?? raw.createdAt ?? null,
  };
}

function setCachedContacts(list, userId) {
  cachedContacts = Array.isArray(list) ? list.map(mapBackendContact).filter(Boolean) : [];
  hasLoadedContacts = true;
  loadedForUserId = userId ?? loadedForUserId;
  notifySubscribers();
  return cachedContacts;
}

export const contactNumberService = {
  isLoadedFor(userId) {
    return hasLoadedContacts && userId != null && String(loadedForUserId) === String(userId);
  },

  getContactNumbers() {
    return cachedContacts;
  },

  getDefaultContactNumber() {
    if (cachedContacts.length === 0) return null;
    return cachedContacts.find((c) => c.isDefault) || cachedContacts[0] || null;
  },

  clearCache() {
    cachedContacts = [];
    hasLoadedContacts = false;
    loadedForUserId = null;
    inFlightFetchPromise = null;
    inFlightUserId = null;
    notifySubscribers();
  },

  async fetchContactNumbers(userId) {
    if (userId == null) {
      this.clearCache();
      return [];
    }

    if (inFlightFetchPromise && String(inFlightUserId) === String(userId)) {
      return inFlightFetchPromise;
    }

    if (loadedForUserId !== null && String(loadedForUserId) !== String(userId)) {
      cachedContacts = [];
      hasLoadedContacts = false;
      notifySubscribers();
    }

    inFlightUserId = userId;
    inFlightFetchPromise = (async () => {
      try {
        const rows = await accountService.getContactNumbers();
        return setCachedContacts(rows, userId);
      } finally {
        inFlightFetchPromise = null;
        inFlightUserId = null;
      }
    })();

    return inFlightFetchPromise;
  },

  async addContactNumber({ label, phoneNumber, isDefault = false }, userId = loadedForUserId) {
    const created = await accountService.createContactNumber({
      label: String(label || 'Personal').trim() || 'Personal',
      phone_number: phoneNumber,
      is_default: Boolean(isDefault),
    });
    const rows = await accountService.getContactNumbers();
    setCachedContacts(rows, userId);
    return mapBackendContact(created);
  },

  async updateContactNumber(id, { label, phoneNumber, isDefault }, userId = loadedForUserId) {
    const payload = {};
    if (label !== undefined) payload.label = String(label || 'Personal').trim() || 'Personal';
    if (phoneNumber !== undefined) payload.phone_number = phoneNumber;
    if (isDefault !== undefined) payload.is_default = Boolean(isDefault);

    const updated = await accountService.updateContactNumber(id, payload);
    const rows = await accountService.getContactNumbers();
    setCachedContacts(rows, userId);
    return mapBackendContact(updated);
  },

  async setDefaultContactNumber(id, userId = loadedForUserId) {
    const updated = await accountService.setDefaultContactNumber(id);
    const rows = await accountService.getContactNumbers();
    setCachedContacts(rows, userId);
    return mapBackendContact(updated);
  },

  async deleteContactNumber(id, userId = loadedForUserId) {
    await accountService.deleteContactNumber(id);
    const rows = await accountService.getContactNumbers();
    setCachedContacts(rows, userId);
  },
};

export default contactNumberService;
