/**
 * Shared API service for SALO in-app notifications.
 * Connects to /api/notifications* using cookie-session auth via apiClient.
 */

import apiClient from './apiClient.js';
import {
  assertValidWorkspace,
  normalizeNotification,
  normalizeUnreadCounts,
} from '../utils/notificationUtils.js';

const inFlightLists = new Map();
let inFlightUnreadCount = null;
const inFlightMarkRead = new Map();

export const NOTIFICATION_UPDATED_EVENT = 'salo:notificationsUpdated';

function emitNotificationsUpdated(detail = {}) {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent(NOTIFICATION_UPDATED_EVENT, { detail }));
  }
}

/**
 * Fetch paginated notifications strictly scoped to a single workspace.
 * Deduplicates identical concurrent GET requests and propagates API errors.
 */
export async function fetchNotifications({
  workspace,
  unreadOnly = false,
  page = 1,
  perPage = 20,
} = {}) {
  assertValidWorkspace(workspace);

  const params = new URLSearchParams();
  params.set('workspace', workspace);
  if (unreadOnly) {
    params.set('unread_only', '1');
  }
  params.set('page', String(Math.max(1, Number(page) || 1)));
  params.set('per_page', String(Math.max(1, Math.min(100, Number(perPage) || 20))));

  const endpoint = `/notifications?${params.toString()}`;

  if (inFlightLists.has(endpoint)) {
    return inFlightLists.get(endpoint);
  }

  const requestPromise = (async () => {
    const response = await apiClient.get(endpoint);
    const data = response?.data || {};
    const rawItems = Array.isArray(data.items) ? data.items : [];
    const items = rawItems
      .map(normalizeNotification)
      .filter((item) => item !== null && item.workspace === workspace);

    return {
      items,
      pagination: {
        current_page: Number(data.pagination?.current_page || 1),
        per_page: Number(data.pagination?.per_page || perPage),
        total: Number(data.pagination?.total || items.length),
        last_page: Number(data.pagination?.last_page || 1),
      },
    };
  })();

  inFlightLists.set(endpoint, requestPromise);

  try {
    return await requestPromise;
  } finally {
    inFlightLists.delete(endpoint);
  }
}

/**
 * Fetch total and per-workspace unread notification counts.
 */
export async function fetchUnreadCounts() {
  if (inFlightUnreadCount) {
    return inFlightUnreadCount;
  }

  inFlightUnreadCount = (async () => {
    const response = await apiClient.get('/notifications/unread-count');
    return normalizeUnreadCounts(response?.data);
  })();

  try {
    return await inFlightUnreadCount;
  } finally {
    inFlightUnreadCount = null;
  }
}

/**
 * Mark a single notification as read (owned by authenticated user).
 */
export async function markNotificationRead(notificationId) {
  const id = Number(notificationId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('A valid notification ID is required.');
  }

  if (inFlightMarkRead.has(id)) {
    return inFlightMarkRead.get(id);
  }

  const requestPromise = (async () => {
    const response = await apiClient.post(`/notifications/${id}/read`, {});
    const normalized = normalizeNotification(response?.data);
    emitNotificationsUpdated({ action: 'read', notificationId: id, workspace: normalized?.workspace });
    return normalized;
  })();

  inFlightMarkRead.set(id, requestPromise);

  try {
    return await requestPromise;
  } finally {
    inFlightMarkRead.delete(id);
  }
}

/**
 * Mark all unread notifications as read, optionally scoped to one workspace.
 */
export async function markAllNotificationsRead({ workspace = null } = {}) {
  const payload = {};
  if (workspace !== null && workspace !== undefined && workspace !== '') {
    assertValidWorkspace(workspace);
    payload.workspace = workspace;
  }

  const response = await apiClient.post('/notifications/read-all', payload);
  const updatedCount = Number(response?.data?.updated_count || 0);
  emitNotificationsUpdated({ action: 'read_all', workspace: payload.workspace || null, updatedCount });

  return {
    updated_count: updatedCount,
  };
}

export const notificationService = {
  fetchNotifications,
  fetchUnreadCounts,
  markNotificationRead,
  markAllNotificationsRead,
};

export default notificationService;
