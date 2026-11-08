export const RESTAURANT_PERMISSIONS = Object.freeze({
  'business.profile.view': 'View business profile',
  'business.profile.edit': 'Edit business profile',
  'business.photos.manage': 'Manage restaurant photos',
  'business.location.manage': 'Manage location and delivery coverage',
  'business.hours.manage': 'Manage operating hours',
  'menu.view': 'View menu',
  'menu.categories.manage': 'Manage menu categories',
  'menu.items.create': 'Create menu items',
  'menu.items.edit': 'Edit menu items',
  'menu.items.delete': 'Delete or archive menu items',
  'menu.photos.manage': 'Manage menu photos',
  'menu.availability.manage': 'Manage menu availability',
  'menu.pricing.manage': 'Manage menu pricing',
  'menu.addons.manage': 'Manage add-ons',
  'orders.view': 'View orders',
  'orders.accept': 'Accept orders',
  'orders.reject': 'Reject orders',
  'orders.preparation.update': 'Update order preparation',
  'orders.pickup.manage': 'Manage pickup progress',
  'orders.customer.view': 'View customer order information',
  'reservations.view': 'View reservations',
  'reservations.approve': 'Approve reservations',
  'reservations.reject': 'Reject reservations',
  'reservations.assignTables': 'Assign reservation tables',
  'reservations.updateStatus': 'Update reservation status',
  'reservations.manageArrival': 'Manage customer arrival',
  'tables.view': 'View tables',
  'tables.add': 'Add tables',
  'tables.edit': 'Edit tables',
  'tables.manageAvailability': 'Manage table availability',
  'inventory.view': 'View inventory',
  'inventory.addStock': 'Add stock',
  'inventory.deductStock': 'Deduct stock',
  'inventory.adjustStock': 'Adjust stock',
  'inventory.viewHistory': 'View stock history',
  'promotions.view': 'View promotions',
  'promotions.create': 'Create promotions',
  'promotions.edit': 'Edit promotions',
  'promotions.status.manage': 'Activate or deactivate promotions',
  'reports.sales.view': 'View sales reports',
  'reports.orders.view': 'View order reports',
  'reports.reservations.view': 'View reservation reports',
  'reports.inventory.view': 'View inventory reports',
  'activity.view': 'View activity logs',
  'team.view': 'View team members',
  'team.invite': 'Invite staff',
  'team.permissions.manage': 'Manage staff permissions',
});

export const OWNER_NAV_ITEMS = Object.freeze([
  { id: 'overview', label: 'Overview', href: '/owner', section: 'Workspace', icon: 'dashboard', allOf: ['business.profile.view', 'orders.view', 'reservations.view', 'reports.sales.view', 'menu.view'] },
  { id: 'profile', label: 'Business Profile', href: '/owner/profile', section: 'Workspace', icon: 'profile', anyOf: ['business.profile.view', 'business.profile.edit'] },
  { id: 'menu', label: 'Menu Management', href: '/owner/menu', section: 'Operations', icon: 'menu', anyOf: ['menu.view', 'menu.categories.manage', 'menu.items.create', 'menu.items.edit', 'menu.items.delete', 'menu.photos.manage', 'menu.availability.manage', 'menu.pricing.manage', 'menu.addons.manage'] },
  { id: 'orders', label: 'Orders', href: '/owner/orders', section: 'Operations', icon: 'orders', anyOf: ['orders.view', 'orders.accept', 'orders.reject', 'orders.preparation.update', 'orders.pickup.manage', 'orders.customer.view'] },
  { id: 'reservations', label: 'Reservations', href: '/owner/reservations', section: 'Operations', icon: 'reservation', allOf: ['reservations.view'] },
  { id: 'tables', label: 'Tables', href: '/owner/tables', section: 'Operations', icon: 'tables', allOf: ['tables.view'] },
  { id: 'inventory', label: 'Inventory', href: '/owner/inventory', section: 'Operations', icon: 'inventory', allOf: ['inventory.view'] },
  { id: 'promotions', label: 'Promotions', href: '/owner/promotions', section: 'Growth', icon: 'promotions', anyOf: ['promotions.view', 'promotions.create', 'promotions.edit'] },
  { id: 'team', label: 'Team and Staff', href: '/owner/team', section: 'Management', icon: 'team', anyOf: ['team.view', 'team.invite', 'team.permissions.manage'] },
  { id: 'reports', label: 'Reports and Statistics', href: '/owner/reports', section: 'Management', icon: 'reports', anyOf: ['reports.sales.view', 'reports.orders.view', 'reports.reservations.view', 'reports.inventory.view'] },
  { id: 'activity', label: 'Activity Logs', href: '/owner/activity', section: 'Management', icon: 'activity', anyOf: ['activity.view'] },
  { id: 'settings', label: 'Settings', href: '/owner/settings', section: 'Management', icon: 'settings', anyOf: ['business.profile.edit'] },
]);

export function isOwnerMembership(membership) {
  return membership?.status === 'approved';
}

export function isStaffMembership(membership) {
  return membership?.status === 'active';
}

export function buildRestaurantAccess(user, memberships, restaurants, selectedRestaurantId) {
  const ownershipMemberships = memberships.ownershipMemberships.filter(isOwnerMembership);
  const staffMemberships = memberships.staffMemberships.filter(isStaffMembership);
  const accessibleIds = new Set([
    ...ownershipMemberships.map((membership) => membership.restaurantId),
    ...staffMemberships.map((membership) => membership.restaurantId),
  ]);
  const accessibleRestaurants = restaurants.filter((restaurant) => accessibleIds.has(restaurant.id));
  const selected = accessibleRestaurants.find((restaurant) => restaurant.id === selectedRestaurantId)
    || accessibleRestaurants[0]
    || null;
  const ownershipMembership = ownershipMemberships.find((membership) => membership.restaurantId === selected?.id);
  const staffMembership = staffMemberships.find((membership) => membership.restaurantId === selected?.id);
  const isOwner = Boolean(ownershipMembership);
  const permissions = isOwner ? Object.keys(RESTAURANT_PERMISSIONS) : staffMembership?.permissions || [];
  const permissionSet = new Set(permissions);

  return {
    user,
    ownershipMemberships,
    staffMemberships,
    restaurants: accessibleRestaurants,
    selectedRestaurant: selected,
    selectedRestaurantId: selected?.id || null,
    membership: ownershipMembership || staffMembership || null,
    actorType: ownershipMembership?.actorType || (staffMembership ? 'staff' : null),
    isOwner,
    hasRestaurantAccess: accessibleRestaurants.length > 0,
    permissions,
    canAccess(permissionKeys = [], mode = 'all') {
      if (isOwner) return true;
      if (!permissionKeys.length) return Boolean(staffMembership);
      return mode === 'any'
        ? permissionKeys.some((key) => permissionSet.has(key))
        : permissionKeys.every((key) => permissionSet.has(key));
    },
  };
}

export function canAccessNavigationItem(access, itemId) {
  const item = OWNER_NAV_ITEMS.find((entry) => entry.id === itemId);
  if (!item) return false;
  return item.allOf
    ? access.canAccess(item.allOf, 'all')
    : access.canAccess(item.anyOf, 'any');
}
