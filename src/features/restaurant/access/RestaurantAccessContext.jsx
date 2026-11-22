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

export function resolveBackendAccessData(user) {
  const ownershipRows = Array.isArray(user?.restaurant_ownerships) ? user.restaurant_ownerships : [];
  const staffRows = Array.isArray(user?.restaurant_staff_assignments) ? user.restaurant_staff_assignments : [];

  const restaurantMap = new Map();

  const ownershipMemberships = ownershipRows.map((own, idx) => {
    const restId = String(own.restaurant_id);
    const status = String(own.restaurant_status || '').toLowerCase();
    const isApproved = status === 'approved' || status === 'active';
    const isMainBranch = own.is_main_branch !== undefined
      ? Boolean(own.is_main_branch)
      : (own.parent_restaurant_id === null || own.parent_restaurant_id === undefined);

    if (own.restaurant_id && !restaurantMap.has(restId)) {
      restaurantMap.set(restId, {
        id: restId,
        restaurant_id: own.restaurant_id,
        parent_restaurant_id: own.parent_restaurant_id ?? null,
        brand_restaurant_id: own.brand_restaurant_id ?? own.restaurant_id,
        name: own.restaurant_name || `Restaurant #${own.restaurant_id}`,
        branchName: own.branch_name || null,
        displayName: own.display_name || (own.branch_name ? `${own.restaurant_name} — ${own.branch_name}` : (own.restaurant_name || `Restaurant #${own.restaurant_id}`)),
        isMainBranch,
        shortAddress: own.short_address || null,
        status: own.restaurant_status || 'active',
      });
    }

    return {
      id: `backend-own-${own.restaurant_id ?? idx}`,
      userId: user?.user_id ?? user?.id,
      userEmail: user?.email,
      restaurantId: restId,
      backendRestaurantId: own.restaurant_id,
      status: isApproved ? 'approved' : status || 'pending',
      joinedAt: own.joined_at || null,
      actorType: 'owner',
      permissions: Array.isArray(own.permissions) ? own.permissions : null,
    };
  });

  const staffMemberships = staffRows.map((st, idx) => {
    const restId = String(st.restaurant_id);
    // Consume canonical server-provided permissions from /api/auth/me (CLEAN-1(d)).
    const permissions = Array.isArray(st.permissions) ? st.permissions : [];

    const isMainBranch = st.is_main_branch !== undefined
      ? Boolean(st.is_main_branch)
      : (st.parent_restaurant_id === null || st.parent_restaurant_id === undefined);

    if (st.restaurant_id && !restaurantMap.has(restId)) {
      restaurantMap.set(restId, {
        id: restId,
        restaurant_id: st.restaurant_id,
        parent_restaurant_id: st.parent_restaurant_id ?? null,
        brand_restaurant_id: st.brand_restaurant_id ?? st.restaurant_id,
        name: st.restaurant_name || `Restaurant #${st.restaurant_id}`,
        branchName: st.branch_name || null,
        displayName: st.display_name || (st.branch_name ? `${st.restaurant_name} — ${st.branch_name}` : (st.restaurant_name || `Restaurant #${st.restaurant_id}`)),
        isMainBranch,
        shortAddress: st.short_address || null,
        status: st.restaurant_status || 'active',
      });
    }

    return {
      id: `backend-staff-${st.staff_id ?? idx}`,
      userId: user?.user_id ?? user?.id,
      userEmail: user?.email,
      restaurantId: restId,
      backendRestaurantId: st.restaurant_id,
      status: st.staff_status || 'active',
      joinedAt: st.joined_at || null,
      position: st.staff_position || 'Staff',
      permissions,
    };
  });

  return {
    restaurants: Array.from(restaurantMap.values()),
    memberships: {
      ownershipMemberships,
      staffMemberships,
    },
  };
}

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
