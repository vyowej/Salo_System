import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import restaurantService from '../../../services/restaurantService';
import { buildRestaurantAccess, canAccessNavigationItem } from './permissionMap';

import RestaurantAccessContext from './restaurantAccessContext';

export function RestaurantAccessProvider({ children }) {
  const { user } = useAuth();
  const [selectedRestaurantId, setSelectedRestaurantId] = useState(() => restaurantService.getSelectedRestaurantId());
  const [, setStoreVersion] = useState(0);

  useEffect(() => {
    const refresh = () => setStoreVersion((version) => version + 1);
    window.addEventListener('salo:demoStoreUpdated', refresh);
    return () => window.removeEventListener('salo:demoStoreUpdated', refresh);
  }, []);

  const access = buildRestaurantAccess(
    user,
    restaurantService.getMemberships(user),
    restaurantService.getRestaurants(),
    selectedRestaurantId,
  );

  const selectRestaurant = useCallback((restaurantId) => {
    if (!access.restaurants.some((restaurant) => restaurant.id === restaurantId)) {
      throw new Error('You do not have access to that restaurant.');
    }
    restaurantService.setSelectedRestaurant(restaurantId);
    setSelectedRestaurantId(restaurantId);
    window.dispatchEvent(new CustomEvent('salo:restaurantChanged', { detail: { restaurantId } }));
  }, [access.restaurants]);

  const value = useMemo(() => ({
    ...access,
    selectRestaurant,
    canAccessNavigationItem: (itemId) => canAccessNavigationItem(access, itemId),
  }), [access, selectRestaurant]);

  return (
    <RestaurantAccessContext.Provider value={value}>
      {children}
    </RestaurantAccessContext.Provider>
  );
}

export default RestaurantAccessContext;
