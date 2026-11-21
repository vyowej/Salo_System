import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';
import contactNumberService, {
  CONTACT_NUMBERS_CHANGED_EVENT,
  MAX_SAVED_CONTACT_NUMBERS,
} from '../services/contactNumberService';

export { CONTACT_NUMBERS_CHANGED_EVENT, MAX_SAVED_CONTACT_NUMBERS };

/**
 * Shared hook for accessing and mutating customer saved contact numbers
 * backed by /api/account/contact-numbers.
 * Clears state on logout, account switch, or non-customer workspace switch.
 */
export function useContactNumbers() {
  const { user, activeWorkspace } = useAuth();
  const userId = user?.user_id ?? user?.id ?? null;
  const workspace = activeWorkspace ?? user?.role ?? null;
  const isCustomerWorkspace = Boolean(user && userId != null && workspace === 'customer');

  const [contactNumbers, setContactNumbers] = useState(() =>
    isCustomerWorkspace && contactNumberService.isLoadedFor(userId)
      ? contactNumberService.getContactNumbers()
      : []
  );
  const [defaultContactNumber, setDefaultContactNumberState] = useState(() =>
    isCustomerWorkspace && contactNumberService.isLoadedFor(userId)
      ? contactNumberService.getDefaultContactNumber()
      : null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const syncFromCache = useCallback(() => {
    if (!isCustomerWorkspace || !contactNumberService.isLoadedFor(userId)) {
      setContactNumbers([]);
      setDefaultContactNumberState(null);
      return;
    }
    setContactNumbers(contactNumberService.getContactNumbers());
    setDefaultContactNumberState(contactNumberService.getDefaultContactNumber());
  }, [isCustomerWorkspace, userId]);

  const refreshContactNumbers = useCallback(async () => {
    if (!isCustomerWorkspace) {
      contactNumberService.clearCache();
      setContactNumbers([]);
      setDefaultContactNumberState(null);
      setError(null);
      return [];
    }

    setLoading(true);
    setError(null);
    try {
      const list = await contactNumberService.fetchContactNumbers(userId);
      setContactNumbers(list);
      setDefaultContactNumberState(contactNumberService.getDefaultContactNumber());
      return list;
    } catch (err) {
      setError(err?.message || 'Unable to load saved contact numbers.');
      return [];
    } finally {
      setLoading(false);
    }
  }, [isCustomerWorkspace, userId]);

  useEffect(() => {
    if (!isCustomerWorkspace) {
      contactNumberService.clearCache();
      setContactNumbers([]);
      setDefaultContactNumberState(null);
      setError(null);
      return;
    }

    if (contactNumberService.isLoadedFor(userId)) {
      syncFromCache();
      return;
    }

    refreshContactNumbers();
  }, [isCustomerWorkspace, userId, refreshContactNumbers, syncFromCache]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    window.addEventListener(CONTACT_NUMBERS_CHANGED_EVENT, syncFromCache);
    return () => window.removeEventListener(CONTACT_NUMBERS_CHANGED_EVENT, syncFromCache);
  }, [syncFromCache]);

  const addContactNumber = useCallback(
    async (payload) => contactNumberService.addContactNumber(payload, userId),
    [userId]
  );

  const updateContactNumber = useCallback(
    async (id, payload) => contactNumberService.updateContactNumber(id, payload, userId),
    [userId]
  );

  const deleteContactNumber = useCallback(
    async (id) => contactNumberService.deleteContactNumber(id, userId),
    [userId]
  );

  const setDefaultContactNumber = useCallback(
    async (id) => contactNumberService.setDefaultContactNumber(id, userId),
    [userId]
  );

  return {
    contactNumbers,
    defaultContactNumber,
    loading,
    error,
    refreshContactNumbers,
    addContactNumber,
    updateContactNumber,
    deleteContactNumber,
    setDefaultContactNumber,
  };
}

export default useContactNumbers;
