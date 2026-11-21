import { useCallback, useMemo, useState } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import {
  buildRestaurantAccess,
  canAccessNavigationItem,
  canStaffPositionHandleOrders,
  canStaffPositionPublishMenu,
  MENU_PUBLISHER_PERMISSIONS,
  ORDER_HANDLER_PERMISSIONS,
} from './permissionMap';
import RestaurantAccessContext from './restaurantAccessContext';

export function resolveBackendAccessData(user) {
  const ownershipRows = Array.isArray(user?.restaurant_ownerships) ? user.restaurant_ownerships : [];
  const staffRows = Array.isArray(user?.restaurant_staff_assignments) ? user.restaurant_staff_assignments : [];

  const restaurantMap = new Map();

  const ownershipMemberships = ownershipRows.map((own, idx) => {
    const restId = String(own.restaurant_id);
    const status = String(own.restaurant_status || '').toLowerCase();
    const isApproved = status === 'approved' || status === 'active';

    if (own.restaurant_id && !restaurantMap.has(restId)) {
      restaurantMap.set(restId, {
        id: restId,
        restaurant_id: own.restaurant_id,
        name: own.restaurant_name || `Restaurant #${own.restaurant_id}`,
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
    };
  });

  const orderHandlerPositions = Array.isArray(user?.order_handler_positions)
    ? user.order_handler_positions
    : [];
  const menuPublisherPositions = Array.isArray(user?.menu_publisher_positions)
    ? user.menu_publisher_positions
    : [];

  const staffMemberships = staffRows.map((st, idx) => {
    const restId = String(st.restaurant_id);
    const canHandleOrders = canStaffPositionHandleOrders(
      st.staff_position,
      orderHandlerPositions,
      st.can_handle_orders,
    );
    const canPublishMenu = canStaffPositionPublishMenu(
      st.staff_position,
      menuPublisherPositions,
      st.can_publish_menu,
    );
    const explicitPermissions = Array.isArray(st.permissions) && st.permissions.length > 0
      ? st.permissions
      : [];
    const basePermissions = canHandleOrders
      ? Array.from(new Set([...explicitPermissions, ...ORDER_HANDLER_PERMISSIONS]))
      : explicitPermissions.filter((perm) => !String(perm).startsWith('orders.'));
    const permissions = canPublishMenu
      ? Array.from(new Set([...basePermissions, ...MENU_PUBLISHER_PERMISSIONS]))
      : basePermissions.filter((perm) => perm !== 'menu.publish');

    if (st.restaurant_id && !restaurantMap.has(restId)) {
      restaurantMap.set(restId, {
        id: restId,
        restaurant_id: st.restaurant_id,
        name: st.restaurant_name || `Restaurant #${st.restaurant_id}`,
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
  const [selectedRestaurantId, setSelectedRestaurantId] = useState(null);

  const { restaurants, memberships } = useMemo(
    () => resolveBackendAccessData(user),
    [user],
  );

  const access = useMemo(
    () => buildRestaurantAccess(user, memberships, restaurants, selectedRestaurantId),
    [user, memberships, restaurants, selectedRestaurantId],
  );

  const selectRestaurant = useCallback((restaurantId) => {
    if (!access.restaurants.some((restaurant) => restaurant.id === restaurantId)) {
      throw new Error('You do not have access to that restaurant.');
    }
    setSelectedRestaurantId(restaurantId);
  }, [access.restaurants]);

  const value = useMemo(() => ({
    ...access,
    selectRestaurant,
    canAccessNavigationItem: (itemId) => canAccessNavigationItem(access, itemId),
  }), [access, selectRestaurant]);

  return <RestaurantAccessContext.Provider value={value}>{children}</RestaurantAccessContext.Provider>;
}

export default RestaurantAccessProvider;
