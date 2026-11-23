import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import {
  buildRestaurantAccess,
  canAccessNavigationItem,
} from './permissionMap';
import {
  readStoredSelectedRestaurantId,
  setActiveRestaurantIdHeader,
  writeStoredSelectedRestaurantId,
} from './branchContextStorage';
import RestaurantAccessContext from './restaurantAccessContext';
import { resolveBackendAccessData } from './resolveBackendAccessData';

export function RestaurantAccessProvider({ children }) {
  const { user } = useAuth();
  const userId = user?.user_id ?? user?.id ?? null;
  const [selectedByUser, setSelectedByUser] = useState(() => ({
    userId,
    restaurantId: readStoredSelectedRestaurantId(user),
  }));

  const requestedRestaurantId = selectedByUser.userId === userId
    ? selectedByUser.restaurantId
    : readStoredSelectedRestaurantId(user);

  const { restaurants, memberships } = useMemo(
    () => resolveBackendAccessData(user),
    [user],
  );

  const access = useMemo(
    () => buildRestaurantAccess(user, memberships, restaurants, requestedRestaurantId),
    [user, memberships, restaurants, requestedRestaurantId],
  );

  // Keep apiClient's active X-Restaurant-Id header and user-scoped localStorage in sync.
  setActiveRestaurantIdHeader(access.selectedRestaurantId);

  useEffect(() => {
    setActiveRestaurantIdHeader(access.selectedRestaurantId);
    if (user && access.selectedRestaurantId) {
      writeStoredSelectedRestaurantId(user, access.selectedRestaurantId);
    }
  }, [user, access.selectedRestaurantId]);

  const selectRestaurant = useCallback((restaurantId) => {
    const nextId = String(restaurantId);
    if (!access.restaurants.some((restaurant) => restaurant.id === nextId)) {
      throw new Error('You do not have access to that restaurant.');
    }
    setActiveRestaurantIdHeader(nextId);
    if (user) {
      writeStoredSelectedRestaurantId(user, nextId);
    }
    setSelectedByUser({ userId, restaurantId: nextId });
  }, [access.restaurants, user, userId]);

  const value = useMemo(() => ({
    ...access,
    hasMultipleBranches: access.restaurants.length > 1,
    selectRestaurant,
    canAccessNavigationItem: (itemId) => canAccessNavigationItem(access, itemId),
  }), [access, selectRestaurant]);

  return <RestaurantAccessContext.Provider value={value}>{children}</RestaurantAccessContext.Provider>;
}

export default RestaurantAccessProvider;
