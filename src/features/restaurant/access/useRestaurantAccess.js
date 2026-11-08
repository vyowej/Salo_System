import { useContext } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import restaurantService from '../../../services/restaurantService';
import { buildRestaurantAccess, canAccessNavigationItem } from './permissionMap';
import RestaurantAccessContext from './restaurantAccessContext';

export function useRestaurantAccess() {
  const { user } = useAuth();
  const context = useContext(RestaurantAccessContext);
  if (context) return context;

  const access = buildRestaurantAccess(
    user,
    restaurantService.getMemberships(user),
    restaurantService.getRestaurants(),
    restaurantService.getSelectedRestaurantId(),
  );
  return {
    ...access,
    canAccessNavigationItem: (itemId) => canAccessNavigationItem(access, itemId),
  };
}

export default useRestaurantAccess;
