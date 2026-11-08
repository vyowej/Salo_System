import { createContext, useState, useEffect, useMemo, useCallback } from 'react';

const CartContext = createContext(null);
const CART_STORAGE_KEY = 'salo_multi_cart';

export function CartProvider({ children }) {
  const [items, setItems] = useState(() => {
    try {
      const stored = localStorage.getItem(CART_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Per-restaurant fulfillment configuration { [restaurantId]: 'delivery' | 'pickup' }
  const [restaurantFulfillment, setRestaurantFulfillmentState] = useState({});

  // Per-restaurant delivery address configuration { [restaurantId]: addressObject }
  const [restaurantAddresses, setRestaurantAddressesState] = useState({});

  // Sync with localStorage
  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    } catch {
      // storage unavailable
    }
  }, [items]);

  const addItem = useCallback((item) => {
    // item: { id, name, price, quantity, restaurantId, restaurantName, image, selectedAddOns: [] }
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
          cartItemId: `${item.id}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          quantity: item.quantity || 1,
        },
      ];
    });
  }, []);

  const removeItem = useCallback((cartItemId) => {
    setItems((prev) => prev.filter((i) => i.cartItemId !== cartItemId));
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
  }, []);

  // Multi-restaurant group computation
  const restaurantGroups = useMemo(() => {
    const groupsMap = {};

    items.forEach((item) => {
      const rId = item.restaurantId || 'unknown-restaurant';
      if (!groupsMap[rId]) {
        groupsMap[rId] = {
          restaurantId: rId,
          restaurantName: item.restaurantName || 'Restaurant',
          items: [],
          subtotal: 0,
          deliveryFee: item.deliveryFee ?? 49,
          fulfillment: restaurantFulfillment[rId] || 'delivery',
          deliveryAddress: restaurantAddresses[rId] || null,
        };
      }

      // Calculate add-on cost
      const addOnCost = (item.selectedAddOns || []).reduce((acc, a) => acc + (a.price || 0), 0);
      const itemTotal = (item.price + addOnCost) * item.quantity;

      groupsMap[rId].items.push({
        ...item,
        unitTotal: item.price + addOnCost,
        itemTotal,
      });

      groupsMap[rId].subtotal += itemTotal;
    });

    return Object.values(groupsMap);
  }, [items, restaurantFulfillment, restaurantAddresses]);

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
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
    setRestaurantFulfillment,
    setRestaurantAddress,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export default CartContext;
