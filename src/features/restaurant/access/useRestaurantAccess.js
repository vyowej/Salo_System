import { useContext } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { buildRestaurantAccess, canAccessNavigationItem } from './permissionMap';
import RestaurantAccessContext from './RestaurantAccessContext.jsx';
import { resolveBackendAccessData } from './resolveBackendAccessData.js';
import RestaurantAccessStore from './restaurantAccessContext';

export function useRestaurantAccess() {
  const { user } = useAuth();
  const context = useContext(RestaurantAccessStore);
  if (context) return context;

  const { restaurants, memberships } = resolveBackendAccessData(user);
  const access = buildRestaurantAccess(
    user,
    memberships,
    restaurants,
    restaurants[0]?.id ?? null,
  );
  return {
    ...access,
    canAccessNavigationItem: (itemId) => canAccessNavigationItem(access, itemId),
  };
}

export { RestaurantAccessContext };
export default useRestaurantAccess;
