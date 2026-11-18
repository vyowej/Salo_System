import { createContext, useState, useEffect, useMemo, useCallback } from 'react';
import customerService from '../services/customerService';
import addressService, { ADDRESSES_CHANGED_EVENT } from '../services/addressService';
import { findAddressBySelectionId } from '../features/customer/utils/checkoutAddressValidation';

const CartContext = createContext(null);
const CART_STORAGE_KEY = 'salo_multi_cart';
const FULFILLMENT_STORAGE_KEY = 'salo_cart_fulfillment';
const ADDRESSES_STORAGE_KEY = 'salo_cart_addresses';
const MODES_STORAGE_KEY = 'salo_cart_address_modes';
const ITEM_ADDRESSES_STORAGE_KEY = 'salo_cart_item_addresses';


export function CartProvider({ children }) {
  const [items, setItems] = useState(() => {
    try {
      const stored = localStorage.getItem(CART_STORAGE_KEY);
      if (!stored) return [];
      const parsed = JSON.parse(stored);
      return parsed.map((item, idx) => ({
        ...item,
        cartItemId: item.cartItemId || `${item.id || 'item'}-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 4)}`,
      }));
    } catch {
      return [];
    }
  });



  // Per-restaurant fulfillment configuration { [restaurantId]: 'delivery' | 'pickup' }
  const [restaurantFulfillment, setRestaurantFulfillmentState] = useState(() => {
    try {
      const stored = localStorage.getItem(FULFILLMENT_STORAGE_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  // Per-restaurant delivery address configuration { [restaurantId]: addressObject }
  const [restaurantAddresses, setRestaurantAddressesState] = useState(() => {
    try {
      const stored = localStorage.getItem(ADDRESSES_STORAGE_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  // Per-restaurant address mode: 'single' (one address for all items) | 'multiple' (different addresses per item)
  const [restaurantAddressModes, setRestaurantAddressModesState] = useState(() => {
    try {
      const stored = localStorage.getItem(MODES_STORAGE_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  // Per-item delivery address configuration { [cartItemId]: addressObject }
  const [itemAddresses, setItemAddressesState] = useState(() => {
    try {
      const stored = localStorage.getItem(ITEM_ADDRESSES_STORAGE_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  // Sync items with localStorage
  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    } catch {
      // storage unavailable
    }
  }, [items]);

  // Sync fulfillment with localStorage
  useEffect(() => {
    try {
      localStorage.setItem(FULFILLMENT_STORAGE_KEY, JSON.stringify(restaurantFulfillment));
    } catch {
      // storage unavailable
    }
  }, [restaurantFulfillment]);

  // Sync restaurantAddresses with localStorage
  useEffect(() => {
    try {
      localStorage.setItem(ADDRESSES_STORAGE_KEY, JSON.stringify(restaurantAddresses));
    } catch {
      // storage unavailable
    }
  }, [restaurantAddresses]);

  // Sync restaurantAddressModes with localStorage
  useEffect(() => {
    try {
      localStorage.setItem(MODES_STORAGE_KEY, JSON.stringify(restaurantAddressModes));
    } catch {
      // storage unavailable
    }
  }, [restaurantAddressModes]);

  // Sync itemAddresses with localStorage
  useEffect(() => {
    try {
      localStorage.setItem(ITEM_ADDRESSES_STORAGE_KEY, JSON.stringify(itemAddresses));
    } catch {
      // storage unavailable
    }
  }, [itemAddresses]);

  // Track reactive saved addresses from addressService
  const [savedAddresses, setSavedAddresses] = useState(() => addressService.getAddresses());
  const [defaultAddress, setDefaultAddress] = useState(() => addressService.getDefaultAddress());
  const [addressesLoaded, setAddressesLoaded] = useState(() => addressService.isLoaded());

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const syncAddresses = () => {
      setSavedAddresses(addressService.getAddresses());
      setDefaultAddress(addressService.getDefaultAddress());
      setAddressesLoaded(addressService.isLoaded());
    };
    window.addEventListener(ADDRESSES_CHANGED_EVENT, syncAddresses);
    return () => window.removeEventListener(ADDRESSES_CHANGED_EVENT, syncAddresses);
  }, []);

  // Ensure default address is assigned into state for any new restaurant sub-order & line item,
  // and reconcile stored selections when saved addresses load or change.
  useEffect(() => {
    if (items.length === 0) return;

    setRestaurantAddressesState((prev) => {
      let changed = false;
      const next = { ...prev };
      items.forEach((item) => {
        const rId = item.restaurantId || 'unknown-restaurant';
        if (!(rId in next) || next[rId] === undefined) {
          if (defaultAddress) {
            next[rId] = defaultAddress;
            changed = true;
          }
          return;
        }
        if (next[rId] && addressesLoaded) {
          const matched = findAddressBySelectionId(savedAddresses, next[rId].id);
          if (!matched) {
            next[rId] = null;
            changed = true;
          } else if (matched !== next[rId]) {
            next[rId] = matched;
            changed = true;
          }
        }
      });
      return changed ? next : prev;
    });

    setItemAddressesState((prev) => {
      let changed = false;
      const next = { ...prev };
      const currentItemIds = new Set(items.map((i) => i.cartItemId));

      items.forEach((item) => {
        const rId = item.restaurantId || 'unknown-restaurant';
        if (!(item.cartItemId in next)) {
          const fallback = restaurantAddresses[rId] || defaultAddress;
          if (fallback) {
            next[item.cartItemId] = fallback;
            changed = true;
          }
        } else if (next[item.cartItemId] && addressesLoaded) {
          const matched = findAddressBySelectionId(savedAddresses, next[item.cartItemId].id);
          if (!matched) {
            next[item.cartItemId] = null;
            changed = true;
          } else if (matched !== next[item.cartItemId]) {
            next[item.cartItemId] = matched;
            changed = true;
          }
        }
      });

      Object.keys(next).forEach((cId) => {
        if (!currentItemIds.has(cId)) {
          delete next[cId];
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, [items, restaurantAddresses, savedAddresses, defaultAddress, addressesLoaded]);

  const addItem = useCallback((item) => {
    // item: { id, name, price, quantity, restaurantId, restaurantName, image, selectedAddOns: [] }
    const newCartItemId = `${item.id}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    const rId = item.restaurantId || 'unknown-restaurant';
    const defaultAddr = customerService.getDefaultAddress();

    setItems((prev) => {
      // Check if same item with same add-ons already exists
      const addOnsKey = JSON.stringify(item.selectedAddOns || []);
      const existingIdx = prev.findIndex(
        (i) => i.id === item.id && JSON.stringify(i.selectedAddOns || []) === addOnsKey
      );

      if (existingIdx > -1) {
        const copy = [...prev];
        copy[existingIdx].quantity += item.quantity || 1;
        return copy;
      }

      return [
        ...prev,
        {
          ...item,
          cartItemId: newCartItemId,
          quantity: item.quantity || 1,
        },
      ];
    });

    // Ensure restaurant and item have assigned addresses when a default exists
    setRestaurantAddressesState((prev) => {
      if (prev[rId] || !defaultAddr) return prev;
      return { ...prev, [rId]: defaultAddr };
    });

    setItemAddressesState((prev) => {
      const parentAddress = restaurantAddresses[rId] || defaultAddr;
      if (!parentAddress) return prev;
      return { ...prev, [newCartItemId]: parentAddress };
    });
  }, [restaurantAddresses]);

  const removeItem = useCallback((cartItemId) => {
    setItems((prev) => prev.filter((i) => i.cartItemId !== cartItemId));
    setItemAddressesState((prev) => {
      if (!prev[cartItemId]) return prev;
      const copy = { ...prev };
      delete copy[cartItemId];
      return copy;
    });
  }, []);

  const updateQuantity = useCallback((cartItemId, newQty) => {
    if (newQty <= 0) {
      removeItem(cartItemId);
      return;
    }
    setItems((prev) =>
      prev.map((item) => (item.cartItemId === cartItemId ? { ...item, quantity: newQty } : item))
    );
  }, [removeItem]);

  const clearCart = useCallback(() => {
    setItems([]);
    setItemAddressesState({});
  }, []);

  const setRestaurantFulfillment = useCallback((restaurantId, method) => {
    setRestaurantFulfillmentState((prev) => ({
      ...prev,
      [restaurantId]: method,
    }));
  }, []);

  const setRestaurantAddress = useCallback((restaurantId, address) => {
    setRestaurantAddressesState((prev) => ({
      ...prev,
      [restaurantId]: address,
    }));

    // In single mode or as primary address, sync all items of this restaurant
    setItemAddressesState((prev) => {
      let changed = false;
      const next = { ...prev };
      items.forEach((item) => {
        if (item.restaurantId === restaurantId) {
          next[item.cartItemId] = address;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [items]);

  const setRestaurantAddressMode = useCallback((restaurantId, mode) => {
    setRestaurantAddressModesState((prev) => ({
      ...prev,
      [restaurantId]: mode,
    }));

    // If reverting to 'single', sync all items of this restaurant to the restaurant's address
    if (mode === 'single') {
      const targetAddress = restaurantAddresses[restaurantId] || customerService.getDefaultAddress();
      if (targetAddress) {
        setItemAddressesState((prev) => {
          let changed = false;
          const next = { ...prev };
          items.forEach((item) => {
            if (item.restaurantId === restaurantId) {
              next[item.cartItemId] = targetAddress;
              changed = true;
            }
          });
          return changed ? next : prev;
        });
      }
    }
  }, [items, restaurantAddresses]);

  const setItemAddress = useCallback((cartItemId, address) => {
    setItemAddressesState((prev) => ({
      ...prev,
      [cartItemId]: address,
    }));
  }, []);

  const setAllRestaurantsAddress = useCallback((address) => {
    if (!address) return;

    setRestaurantAddressesState((prev) => {
      const next = { ...prev };
      items.forEach((item) => {
        const rId = item.restaurantId || 'unknown-restaurant';
        next[rId] = address;
      });
      return next;
    });

    setRestaurantAddressModesState((prev) => {
      const next = { ...prev };
      items.forEach((item) => {
        const rId = item.restaurantId || 'unknown-restaurant';
        next[rId] = 'single';
      });
      return next;
    });

    setItemAddressesState((prev) => {
      const next = { ...prev };
      items.forEach((item) => {
        next[item.cartItemId] = address;
      });
      return next;
    });
  }, [items]);

  // Multi-restaurant group computation
  const restaurantGroups = useMemo(() => {
    const groupsMap = {};

    items.forEach((item) => {
      const rId = item.restaurantId || 'unknown-restaurant';
      if (!groupsMap[rId]) {
        const mode = restaurantAddressModes[rId] || 'single';
        const baseDeliveryFee = item.deliveryFee ?? 49;
        const groupAddress = rId in restaurantAddresses
          ? (restaurantAddresses[rId] ?? null)
          : (defaultAddress || null);

        groupsMap[rId] = {
          restaurantId: rId,
          restaurantName: item.restaurantName || 'Restaurant',
          items: [],
          subtotal: 0,
          baseDeliveryFee,
          deliveryFee: baseDeliveryFee,
          fulfillment: restaurantFulfillment[rId] || 'delivery',
          deliveryAddress: groupAddress,
          addressMode: mode,
          addressGroups: [],
        };
      }

      // Calculate add-on cost
      const addOnCost = (item.selectedAddOns || []).reduce((acc, a) => acc + (a.price || 0), 0);
      const itemTotal = (item.price + addOnCost) * item.quantity;
      // If item address is explicitly tracked (including unassigned null), respect it without silently falling back
      const assignedAddress = item.cartItemId in itemAddresses
        ? itemAddresses[item.cartItemId]
        : (groupsMap[rId].deliveryAddress || null);

      groupsMap[rId].items.push({
        ...item,
        unitTotal: item.price + addOnCost,
        itemTotal,
        deliveryAddress: assignedAddress,
      });

      groupsMap[rId].subtotal += itemTotal;
    });

    // Organize destination address groups and compute delivery fee per sub-order
    Object.values(groupsMap).forEach((group) => {
      if (group.fulfillment === 'pickup') {
        group.deliveryFee = 0;
        group.addressGroups = [];
        return;
      }

      if (group.addressMode === 'multiple') {
        const addrMap = {};
        group.items.forEach((item) => {
          const addr = item.deliveryAddress;
          const addrId = addr?.id || 'unassigned';
          if (!addrMap[addrId]) {
            addrMap[addrId] = {
              addressId: addrId,
              address: addr,
              items: [],
              subtotal: 0,
              deliveryFee: group.baseDeliveryFee,
            };
          }
          addrMap[addrId].items.push(item);
          addrMap[addrId].subtotal += item.itemTotal;
        });

        const addressGroups = Object.values(addrMap);
        group.addressGroups = addressGroups;
        group.deliveryFee = addressGroups.length * group.baseDeliveryFee;
      } else {
        group.deliveryFee = group.baseDeliveryFee;
        group.addressGroups = [
          {
            addressId: group.deliveryAddress?.id || 'unassigned',
            address: group.deliveryAddress,
            items: group.items,
            subtotal: group.subtotal,
            deliveryFee: group.baseDeliveryFee,
          },
        ];
      }
    });

    return Object.values(groupsMap);
  }, [items, restaurantFulfillment, restaurantAddresses, restaurantAddressModes, itemAddresses, defaultAddress]);

  // Overall totals
  const totalItemCount = useMemo(() => {
    return items.reduce((acc, item) => acc + item.quantity, 0);
  }, [items]);

  const itemsSubtotal = useMemo(() => {
    return restaurantGroups.reduce((acc, g) => acc + g.subtotal, 0);
  }, [restaurantGroups]);

  const totalDeliveryFees = useMemo(() => {
    return restaurantGroups.reduce((acc, g) => {
      return g.fulfillment === 'delivery' ? acc + g.deliveryFee : acc;
    }, 0);
  }, [restaurantGroups]);

  const grandTotal = useMemo(() => {
    return itemsSubtotal + totalDeliveryFees;
  }, [itemsSubtotal, totalDeliveryFees]);

  const value = {
    items,
    restaurantGroups,
    totalItemCount,
    itemsSubtotal,
    totalDeliveryFees,
    grandTotal,
    restaurantFulfillment,
    restaurantAddresses,
    restaurantAddressModes,
    itemAddresses,
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
    setRestaurantFulfillment,
    setRestaurantAddress,
    setRestaurantAddressMode,
    setItemAddress,
    setAllRestaurantsAddress,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export default CartContext;
