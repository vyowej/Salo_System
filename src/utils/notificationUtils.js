/**
 * Shared notification normalization, category mapping, and workspace deep-link helpers.
 * Preserves original backend fields while providing consistent frontend properties.
 */

export const NOTIFICATION_WORKSPACES = ['customer', 'restaurant', 'rider', 'admin'];

const WORKSPACE_FALLBACK_ROUTES = {
  customer: '/customer',
  restaurant: '/owner',
  rider: '/rider',
  admin: '/admin',
};

const CATEGORY_LABELS = {
  order: 'Order update',
  reservation: 'Reservation update',
  delivery: 'Delivery',
  invitation: 'Team invitation',
  application: 'Application',
  branch_permit: 'Branch permit',
  rider: 'Rider account',
  system: 'Update',
};

const NOTIFICATION_TYPE_TITLES = {
  branch_permit_submitted: 'Branch permit submitted for review',
  branch_permit_approved: 'Branch permit approved',
  branch_permit_rejected: 'Branch permit rejected',
  branch_permit_info_requested: 'Branch permit needs more information',
  branch_permit_waived: 'Branch permit requirement waived',
  branch_permit_reopened: 'Branch permit reopened for review',
};

export function isValidWorkspace(workspace) {
  return NOTIFICATION_WORKSPACES.includes(workspace);
}

export function assertValidWorkspace(workspace) {
  if (!isValidWorkspace(workspace)) {
    throw new Error(`Invalid notification workspace "${workspace}". Expected one of: ${NOTIFICATION_WORKSPACES.join(', ')}.`);
  }
  return workspace;
}

export function getNotificationCategory(type) {
  const code = String(type || '').toLowerCase();
  if (code.startsWith('order_')) return 'order';
  if (code.startsWith('reservation_')) return 'reservation';
  if (code.startsWith('delivery_')) return 'delivery';
  if (code.startsWith('staff_invitation_')) return 'invitation';
  if (code.startsWith('branch_permit_')) return 'branch_permit';
  if (code.includes('_application_')) return 'application';
  if (code.startsWith('rider_')) return 'rider';
  return 'system';
}

export function getNotificationTitle(notificationOrType) {
  if (notificationOrType && typeof notificationOrType === 'object') {
    const rawTitle = String(notificationOrType.title || '').trim();
    if (rawTitle) return rawTitle;
    const code = String(notificationOrType.type || '').toLowerCase();
    return NOTIFICATION_TYPE_TITLES[code] || 'Notification';
  }
  const code = String(notificationOrType || '').toLowerCase();
  return NOTIFICATION_TYPE_TITLES[code] || 'Notification';
}

export function getNotificationCategoryLabel(type) {
  const category = getNotificationCategory(type);
  return CATEGORY_LABELS[category] || CATEGORY_LABELS.system;
}

/**
 * Resolve a safe in-app route based on workspace, notification type, and related entity.
 * Uses only routes registered in src/App.jsx.
 */
export function getNotificationRoute(notification) {
  const workspace = isValidWorkspace(notification?.workspace) ? notification.workspace : 'customer';
  const type = String(notification?.type || '').toLowerCase();
  const entityType = String(notification?.related_entity_type || '').toLowerCase();
  const entityId = notification?.related_entity_id != null ? Number(notification.related_entity_id) : null;
  const hasValidEntityId = Number.isInteger(entityId) && entityId > 0;

  if (workspace === 'customer') {
    if (entityType === 'order' || type.startsWith('order_')) {
      return hasValidEntityId ? `/customer/orders/${entityId}` : '/customer/orders';
    }
    if (entityType === 'reservation' || entityType === 'reservations' || type.startsWith('reservation_')) {
      return '/customer/reservations';
    }
    if (entityType === 'staff_invitation' || type.startsWith('staff_invitation_')) {
      return '/customer/invitations';
    }
    if (entityType === 'restaurant_applications' || type.startsWith('restaurant_application_')) {
      return '/business-application/status';
    }
    if (entityType === 'branch_permits' || type.startsWith('branch_permit_')) {
      return '/business-application/status';
    }
    if (entityType === 'rider_applications' || type.startsWith('rider_application_')) {
      return '/rider-application/status';
    }
    return WORKSPACE_FALLBACK_ROUTES.customer;
  }

  if (workspace === 'restaurant') {
    if (entityType === 'order' || type.startsWith('order_')) {
      return '/owner/orders';
    }
    if (entityType === 'reservation' || entityType === 'reservations' || type.startsWith('reservation_')) {
      return '/owner/reservations';
    }
    if (entityType === 'staff_invitation' || type.startsWith('staff_invitation_')) {
      return '/owner/team';
    }
    if (entityType === 'restaurant_applications' || type.startsWith('restaurant_application_')) {
      return '/owner';
    }
    if (entityType === 'branch_permits' || type.startsWith('branch_permit_')) {
      return '/owner/profile#branch-permit';
    }
    return WORKSPACE_FALLBACK_ROUTES.restaurant;
  }

  if (workspace === 'rider') {
    if (type === 'rider_application_approved' || entityType === 'rider_applications') {
      return '/rider/application/status';
    }
    if (entityType === 'order' || entityType === 'delivery' || type.startsWith('delivery_')) {
      return '/rider/deliveries';
    }
    if (type === 'rider_activated' || entityType === 'rider') {
      return '/rider';
    }
    return WORKSPACE_FALLBACK_ROUTES.rider;
  }

  if (workspace === 'admin') {
    if (
      entityType === 'branch_permits'
      || type.startsWith('branch_permit_')
    ) {
      return '/admin/branch-permits';
    }
    if (
      entityType === 'restaurant_applications'
      || entityType === 'rider_applications'
      || type.includes('_application_')
    ) {
      return '/admin/applications';
    }
    if (entityType === 'order') {
      return hasValidEntityId ? `/admin/orders/${entityId}` : '/admin/orders';
    }
    if (entityType === 'reservation' || entityType === 'reservations' || type.startsWith('reservation_')) {
      return hasValidEntityId ? `/admin/reservations/${entityId}` : '/admin/reservations';
    }
    if (entityType === 'rider') {
      return hasValidEntityId ? `/admin/riders/${entityId}` : '/admin/riders';
    }
    return WORKSPACE_FALLBACK_ROUTES.admin;
  }

  return '/customer';
}

export function resolveNotificationRestaurantId(notification, accessibleRestaurants = []) {
  const candidate = notification?.restaurant_id ?? notification?.meta?.restaurant_id ?? null;
  if (candidate == null) return null;
  const targetId = String(candidate);
  if (accessibleRestaurants.length > 0 && !accessibleRestaurants.some((r) => String(r.id) === targetId)) {
    return null;
  }
  return targetId;
}

/**
 * Normalize a backend notification record into a consistent frontend shape
 * without discarding any original backend fields.
 */
export function normalizeNotification(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const notificationId = Number(raw.notification_id ?? raw.id ?? 0);
  const userId = raw.user_id != null ? Number(raw.user_id) : null;
  const workspace = isValidWorkspace(raw.workspace) ? raw.workspace : 'customer';
  const type = String(raw.type || 'unknown');
  const isRead = Boolean(raw.is_read ?? (raw.read_at != null));
  const relatedEntityId = raw.related_entity_id != null ? Number(raw.related_entity_id) : null;

  return {
    // Original backend fields
    notification_id: notificationId,
    user_id: userId,
    workspace,
    type,
    title: String(raw.title || ''),
    body: String(raw.body ?? raw.description ?? ''),
    related_entity_type: raw.related_entity_type ?? null,
    related_entity_id: relatedEntityId,
    is_read: isRead,
    read_at: raw.read_at ?? null,
    created_at: raw.created_at ?? null,

    // Frontend convenience fields
    id: notificationId,
    read: isRead,
    description: String(raw.body ?? raw.description ?? ''),
    category: getNotificationCategory(type),
    categoryLabel: getNotificationCategoryLabel(type),
    href: getNotificationRoute({
      workspace,
      type,
      related_entity_type: raw.related_entity_type ?? null,
      related_entity_id: relatedEntityId,
    }),
  };
}

export function normalizeUnreadCounts(raw) {
  const byWorkspace = raw?.by_workspace || {};
  const counts = {
    customer: Number(byWorkspace.customer || 0),
    restaurant: Number(byWorkspace.restaurant || 0),
    rider: Number(byWorkspace.rider || 0),
    admin: Number(byWorkspace.admin || 0),
  };

  const computedTotal = counts.customer + counts.restaurant + counts.rider + counts.admin;

  return {
    total: raw?.total != null ? Number(raw.total) : computedTotal,
    by_workspace: counts,
  };
}

export function getNotificationDateBucketManila(createdAt) {
  if (!createdAt) return 'Earlier';
  const dt = new Date(createdAt);
  if (Number.isNaN(dt.getTime())) return 'Earlier';

  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' });
  const todayKey = fmt.format(new Date());
  const yestKey = fmt.format(new Date(Date.now() - 86400000));
  const itemKey = fmt.format(dt);

  if (itemKey === todayKey) return 'Today';
  if (itemKey === yestKey) return 'Yesterday';
  return 'Earlier';
}

export function groupNotificationsByDateManila(notifications) {
  const buckets = { Today: [], Yesterday: [], Earlier: [] };
  (Array.isArray(notifications) ? notifications : []).forEach((item) => {
    buckets[getNotificationDateBucketManila(item?.created_at)].push(item);
  });

  return ['Today', 'Yesterday', 'Earlier']
    .filter((key) => buckets[key].length > 0)
    .map((key) => ({ label: key, items: buckets[key] }));
}
