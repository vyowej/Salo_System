import { useState, useEffect, useCallback } from 'react';
import addressService, { ADDRESSES_CHANGED_EVENT } from '../services/addressService';
import { useAuth } from './useAuth';

/**
 * Shared hook for accessing and mutating customer delivery addresses
 * backed by /api/customer/addresses.
 */
export function useAddresses() {
  const { user } = useAuth();
  const [addresses, setAddresses] = useState(() => addressService.getAddresses());
  const [defaultAddress, setDefaultAddressState] = useState(() => addressService.getDefaultAddress());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const syncFromCache = useCallback(() => {
    setAddresses(addressService.getAddresses());
    setDefaultAddressState(addressService.getDefaultAddress());
  }, []);

  const refreshAddresses = useCallback(async () => {
    if (!user) {
      addressService.clearCache();
      return [];
    }
    setLoading(true);
    setError(null);
    try {
      const list = await addressService.fetchAddresses();
      return list;
    } catch (err) {
      setError(err?.message || 'Unable to load saved addresses.');
      return [];
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refreshAddresses();
  }, [refreshAddresses]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    window.addEventListener(ADDRESSES_CHANGED_EVENT, syncFromCache);
    return () => window.removeEventListener(ADDRESSES_CHANGED_EVENT, syncFromCache);
  }, [syncFromCache]);

  const addAddress = useCallback(async (data) => {
    return addressService.addAddress(data);
  }, []);

  const updateAddress = useCallback(async (id, data) => {
    return addressService.updateAddress(id, data);
  }, []);

  const deleteAddress = useCallback(async (id) => {
    return addressService.deleteAddress(id);
  }, []);

  const setDefaultAddress = useCallback(async (id) => {
    return addressService.setDefaultAddress(id);
  }, []);

  const checkDuplicate = useCallback((data, excludeId) => {
    return addressService.checkDuplicate(data, excludeId);
  }, []);

  return {
    addresses,
    defaultAddress,
    loading,
    error,
    refreshAddresses,
    addAddress,
    updateAddress,
    deleteAddress,
    setDefaultAddress,
    checkDuplicate,
  };
}

export default useAddresses;
