import { useState, useEffect, useCallback } from 'react';
import addressService, { ADDRESSES_CHANGED_EVENT } from '../services/addressService';

/**
 * Shared hook for accessing and mutating customer delivery addresses.
 * Automatically synchronizes across all subscribed components and browser tabs.
 */
export function useAddresses() {
  const [addresses, setAddresses] = useState(() => addressService.getAddresses());
  const [defaultAddress, setDefaultAddressState] = useState(() => addressService.getDefaultAddress());

  const syncState = useCallback(() => {
    const list = addressService.getAddresses();
    setAddresses(list);
    setDefaultAddressState(addressService.getDefaultAddress());
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleCustomChange = () => syncState();
    const handleStorageChange = (e) => {
      if (!e.key || e.key === 'salo_customer_addresses' || e.key === 'salo_addresses') {
        syncState();
      }
    };

    window.addEventListener(ADDRESSES_CHANGED_EVENT, handleCustomChange);
    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener(ADDRESSES_CHANGED_EVENT, handleCustomChange);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [syncState]);

  const addAddress = useCallback((data) => {
    const result = addressService.addAddress(data);
    syncState();
    return result;
  }, [syncState]);

  const updateAddress = useCallback((id, data) => {
    const result = addressService.updateAddress(id, data);
    syncState();
    return result;
  }, [syncState]);

  const deleteAddress = useCallback((id) => {
    const result = addressService.deleteAddress(id);
    syncState();
    return result;
  }, [syncState]);

  const setDefaultAddress = useCallback((id) => {
    const result = addressService.setDefaultAddress(id);
    syncState();
    return result;
  }, [syncState]);

  const checkDuplicate = useCallback((data, excludeId) => {
    return addressService.checkDuplicate(data, excludeId);
  }, []);

  return {
    addresses,
    defaultAddress,
    addAddress,
    updateAddress,
    deleteAddress,
    setDefaultAddress,
    checkDuplicate,
  };
}

export default useAddresses;
