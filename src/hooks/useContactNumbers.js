import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';
import accountService from '../services/accountService';
import {
  isValidPhilippineMobile,
  normalizePhilippineMobile,
} from '../features/customer/utils/checkoutAddressValidation';

export const CONTACT_NUMBERS_CHANGED_EVENT = 'salo:contact-numbers-changed';
export const MAX_SAVED_CONTACT_NUMBERS = 10;

const STORAGE_PREFIX = 'salo_customer_contact_numbers_';

function getStorageKey(user) {
  const userKey = user?.id ?? user?.user_id ?? user?.email ?? user?.username ?? 'guest';
  return `${STORAGE_PREFIX}${String(userKey)}`;
}

function createContactId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `contact-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readStoredContacts(storageKey, seedPhone) {
  if (typeof window === 'undefined' || !window.localStorage) {
    return seedPhone
      ? [
          {
            id: 'default-seed',
            label: 'Personal',
            phoneNumber: seedPhone,
            isDefault: true,
            createdAt: new Date().toISOString(),
          },
        ]
      : [];
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch {
    // Ignore malformed storage and fall back to seed
  }

  if (seedPhone) {
    const initial = [
      {
        id: createContactId(),
        label: 'Personal',
        phoneNumber: seedPhone,
        isDefault: true,
        createdAt: new Date().toISOString(),
      },
    ];
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(initial));
    } catch {
      // Ignore storage quota errors
    }
    return initial;
  }

  return [];
}

function writeStoredContacts(storageKey, list) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(list));
  } catch {
    // Ignore storage quota errors
  }
  window.dispatchEvent(new CustomEvent(CONTACT_NUMBERS_CHANGED_EVENT, { detail: { storageKey } }));
}

function ensureSingleDefault(list) {
  if (!Array.isArray(list) || list.length === 0) return [];
  const hasDefault = list.some((item) => Boolean(item.isDefault));
  if (hasDefault) {
    let seen = false;
    return list.map((item) => {
      if (item.isDefault && !seen) {
        seen = true;
        return { ...item, isDefault: true };
      }
      return { ...item, isDefault: false };
    });
  }
  return list.map((item, idx) => ({ ...item, isDefault: idx === 0 }));
}

/**
 * UI-first hook for managing a customer's multiple saved contact numbers.
 * Persists per-user in localStorage and broadcasts changes across components.
 */
export function useContactNumbers() {
  const { user } = useAuth();
  const isAuthenticated = Boolean(user?.user_id ?? user?.id);
  const storageKey = getStorageKey(user);
  const rawSeedPhone = user?.phone_number ?? user?.phone ?? '';
  const normalizedSeed = normalizePhilippineMobile(rawSeedPhone);
  const seedPhone = isValidPhilippineMobile(normalizedSeed) ? normalizedSeed : '';

  const [contactNumbers, setContactNumbers] = useState(() =>
    ensureSingleDefault(readStoredContacts(storageKey, seedPhone))
  );

  const normalizeBackendContact = useCallback((item) => ({
    id: item.contact_id ?? item.id,
    contact_id: item.contact_id ?? item.id,
    label: item.label || 'Personal',
    phoneNumber: item.phone_number ?? item.phoneNumber ?? '',
    isDefault: Boolean(item.is_default ?? item.isDefault),
    createdAt: item.created_at ?? item.createdAt ?? new Date().toISOString(),
  }), []);

  const syncFromStorage = useCallback(() => {
    setContactNumbers(ensureSingleDefault(readStoredContacts(storageKey, seedPhone)));
  }, [storageKey, seedPhone]);

  useEffect(() => {
    if (!isAuthenticated) {
      syncFromStorage();
      return undefined;
    }

    let cancelled = false;
    accountService.getContactNumbers()
      .then((rows) => {
        if (cancelled) return;
        const normalized = ensureSingleDefault((rows || []).map(normalizeBackendContact));
        writeStoredContacts(storageKey, normalized);
        setContactNumbers(normalized);
      })
      .catch(() => {
        if (!cancelled) syncFromStorage();
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, normalizeBackendContact, storageKey, syncFromStorage]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handler = (event) => {
      if (!event?.detail?.storageKey || event.detail.storageKey === storageKey) {
        syncFromStorage();
      }
    };
    window.addEventListener(CONTACT_NUMBERS_CHANGED_EVENT, handler);
    return () => window.removeEventListener(CONTACT_NUMBERS_CHANGED_EVENT, handler);
  }, [storageKey, syncFromStorage]);

  const addContactNumber = useCallback(
    async ({ label, phoneNumber, isDefault = false }) => {
      const normalized = normalizePhilippineMobile(phoneNumber);
      if (!isValidPhilippineMobile(normalized)) {
        throw new Error('Please enter a valid Philippine mobile number (e.g. 09171234567 or +639171234567).');
      }

      const current = ensureSingleDefault(readStoredContacts(storageKey, seedPhone));
      if (current.length >= MAX_SAVED_CONTACT_NUMBERS) {
        throw new Error(`Maximum of ${MAX_SAVED_CONTACT_NUMBERS} saved contact numbers reached.`);
      }

      const duplicate = current.some(
        (item) => normalizePhilippineMobile(item.phoneNumber) === normalized
      );
      if (duplicate) {
        throw new Error('This contact number is already saved.');
      }

      const shouldBeDefault = Boolean(isDefault) || current.length === 0;
      const cleanLabel = String(label || 'Personal').trim() || 'Personal';

      if (isAuthenticated) {
        const created = await accountService.createContactNumber({
          label: cleanLabel,
          phone_number: normalized,
          is_default: shouldBeDefault,
        });
        const refreshed = await accountService.getContactNumbers();
        const normalizedList = ensureSingleDefault((refreshed || []).map(normalizeBackendContact));
        writeStoredContacts(storageKey, normalizedList);
        setContactNumbers(normalizedList);
        return created ? normalizeBackendContact(created) : null;
      }

      const newEntry = {
        id: createContactId(),
        label: cleanLabel,
        phoneNumber: normalized,
        isDefault: shouldBeDefault,
        createdAt: new Date().toISOString(),
      };

      const nextList = shouldBeDefault
        ? [newEntry, ...current.map((item) => ({ ...item, isDefault: false }))]
        : [...current, newEntry];

      const normalizedList = ensureSingleDefault(nextList);
      writeStoredContacts(storageKey, normalizedList);
      setContactNumbers(normalizedList);
      return newEntry;
    },
    [isAuthenticated, normalizeBackendContact, storageKey, seedPhone]
  );

  const updateContactNumber = useCallback(
    async (id, { label, phoneNumber, isDefault }) => {
      const normalized = normalizePhilippineMobile(phoneNumber);
      if (!isValidPhilippineMobile(normalized)) {
        throw new Error('Please enter a valid Philippine mobile number (e.g. 09171234567 or +639171234567).');
      }

      const current = ensureSingleDefault(readStoredContacts(storageKey, seedPhone));
      const duplicate = current.some(
        (item) => item.id !== id && normalizePhilippineMobile(item.phoneNumber) === normalized
      );
      if (duplicate) {
        throw new Error('This contact number is already saved.');
      }

      const target = current.find((item) => item.id === id);
      if (!target) {
        throw new Error('Contact number not found.');
      }

      const cleanLabel = String(label || 'Personal').trim() || 'Personal';
      const makeDefault = isDefault !== undefined ? Boolean(isDefault) : target.isDefault;

      if (isAuthenticated) {
        await accountService.updateContactNumber(id, {
          label: cleanLabel,
          phone_number: normalized,
          is_default: makeDefault,
        });
        const refreshed = await accountService.getContactNumbers();
        const normalizedList = ensureSingleDefault((refreshed || []).map(normalizeBackendContact));
        writeStoredContacts(storageKey, normalizedList);
        setContactNumbers(normalizedList);
        return normalizedList.find((item) => item.id === id) || null;
      }

      const updatedList = current.map((item) => {
        if (item.id === id) {
          return {
            ...item,
            label: cleanLabel,
            phoneNumber: normalized,
            isDefault: makeDefault,
          };
        }
        return makeDefault ? { ...item, isDefault: false } : item;
      });

      const normalizedList = ensureSingleDefault(updatedList);
      writeStoredContacts(storageKey, normalizedList);
      setContactNumbers(normalizedList);
      return normalizedList.find((item) => item.id === id) || null;
    },
    [isAuthenticated, normalizeBackendContact, storageKey, seedPhone]
  );

  const deleteContactNumber = useCallback(
    async (id) => {
      if (isAuthenticated) {
        await accountService.deleteContactNumber(id);
        const refreshed = await accountService.getContactNumbers();
        const normalizedList = ensureSingleDefault((refreshed || []).map(normalizeBackendContact));
        writeStoredContacts(storageKey, normalizedList);
        setContactNumbers(normalizedList);
        return;
      }

      const current = ensureSingleDefault(readStoredContacts(storageKey, seedPhone));
      const filtered = current.filter((item) => item.id !== id);
      const normalizedList = ensureSingleDefault(filtered);
      writeStoredContacts(storageKey, normalizedList);
      setContactNumbers(normalizedList);
    },
    [isAuthenticated, normalizeBackendContact, storageKey, seedPhone]
  );

  const setDefaultContactNumber = useCallback(
    async (id) => {
      if (isAuthenticated) {
        await accountService.setDefaultContactNumber(id);
        const refreshed = await accountService.getContactNumbers();
        const normalizedList = ensureSingleDefault((refreshed || []).map(normalizeBackendContact));
        writeStoredContacts(storageKey, normalizedList);
        setContactNumbers(normalizedList);
        return;
      }

      const current = ensureSingleDefault(readStoredContacts(storageKey, seedPhone));
      const updated = current.map((item) => ({
        ...item,
        isDefault: item.id === id,
      }));
      const normalizedList = ensureSingleDefault(updated);
      writeStoredContacts(storageKey, normalizedList);
      setContactNumbers(normalizedList);
    },
    [isAuthenticated, normalizeBackendContact, storageKey, seedPhone]
  );

  const defaultContactNumber =
    contactNumbers.find((item) => item.isDefault) || contactNumbers[0] || null;

  return {
    contactNumbers,
    defaultContactNumber,
    addContactNumber,
    updateContactNumber,
    deleteContactNumber,
    setDefaultContactNumber,
  };
}

export default useContactNumbers;
