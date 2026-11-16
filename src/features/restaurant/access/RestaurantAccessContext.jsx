import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import restaurantService from '../../../services/restaurantService';
import { buildRestaurantAccess, canAccessNavigationItem } from './permissionMap';

import RestaurantAccessContext from './restaurantAccessContext';

function resolveEffectiveMemberships(user, baseMemberships, restaurants) {
  const hasBackendArrays =
    Array.isArray(user?.restaurant_ownerships) ||
    Array.isArray(user?.restaurant_staff_assignments);

  if (!hasBackendArrays) {
    return baseMemberships;
  }

  const fallbackRestId = restaurants[0]?.id || 'dalisay-heritage';
  const email = user?.email?.toLowerCase();

  const backendOwners = (user.restaurant_ownerships || []).map((own, idx) => {
    const status = String(own.restaurant_status || '').toLowerCase();
    const isApproved = status === 'approved' || status === 'active';
    const matched = restaurants.find(
      (r) => String(r.id) === String(own.restaurant_id) || r.name?.toLowerCase() === own.restaurant_name?.toLowerCase(),
    );
    return {
      id: `backend-own-${own.restaurant_id ?? idx}`,
      userId: user.user_id ?? user.id,
      userEmail: user.email,
      restaurantId: matched?.id || fallbackRestId,
      backendRestaurantId: own.restaurant_id,
      status: isApproved ? 'approved' : status || 'pending',
      joinedAt: own.joined_at || null,
      actorType: 'owner',
    };
  });

  const backendStaff = (user.restaurant_staff_assignments || []).map((st, idx) => {
    const matched = restaurants.find(
      (r) => String(r.id) === String(st.restaurant_id) || r.name?.toLowerCase() === st.restaurant_name?.toLowerCase(),
    );
    return {
      id: `backend-staff-${st.staff_id ?? idx}`,
      userId: user.user_id ?? user.id,
      userEmail: user.email,
      restaurantId: matched?.id || fallbackRestId,
      backendRestaurantId: st.restaurant_id,
      status: st.staff_status || 'active',
      joinedAt: st.joined_at || null,
      position: st.staff_position || 'Staff',
      permissions: Array.isArray(st.permissions) && st.permissions.length > 0
        ? st.permissions
        : ['orders.view', 'reservations.view', 'menu.view'],
    };
  });

  const emailMatchedOwners = email
    ? (baseMemberships?.ownershipMemberships || []).filter((m) => m.userEmail?.toLowerCase() === email)
    : [];
  const emailMatchedStaff = email
    ? (baseMemberships?.staffMemberships || []).filter((m) => m.userEmail?.toLowerCase() === email)
    : [];

  return {
    ownershipMemberships: backendOwners.length > 0 ? backendOwners : emailMatchedOwners,
    staffMemberships: backendStaff.length > 0 ? backendStaff : emailMatchedStaff,
  };
}

export function RestaurantAccessProvider({ children }) {
  const { user } = useAuth();
  const [selectedRestaurantId, setSelectedRestaurantId] = useState(() => restaurantService.getSelectedRestaurantId());
  const [, setStoreVersion] = useState(0);

  useEffect(() => {
    const refresh = () => setStoreVersion((version) => version + 1);
    window.addEventListener('salo:demoStoreUpdated', refresh);
    return () => window.removeEventListener('salo:demoStoreUpdated', refresh);
  }, []);

  const restaurants = restaurantService.getRestaurants();
  const memberships = resolveEffectiveMemberships(
    user,
    restaurantService.getMemberships(user),
    restaurants,
  );

  const access = buildRestaurantAccess(
    user,
    memberships,
    restaurants,
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
