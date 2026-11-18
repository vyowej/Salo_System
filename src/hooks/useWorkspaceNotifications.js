import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchNotifications,
  fetchUnreadCounts,
  markAllNotificationsRead,
  markNotificationRead,
  NOTIFICATION_UPDATED_EVENT,
} from '../services/notificationService';
import { isValidWorkspace } from '../utils/notificationUtils';

const EMPTY_COUNTS = {
  total: 0,
  by_workspace: { customer: 0, restaurant: 0, rider: 0, admin: 0 },
};

/**
 * Reusable React hook for workspace-scoped notification lists, unread counts,
 * loading/error/empty states, retry, and read actions.
 */
export function useWorkspaceNotifications({
  workspace,
  unreadOnly = false,
  page = 1,
  perPage = 20,
  enabled = true,
} = {}) {
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({
    current_page: 1,
    per_page: perPage,
    total: 0,
    last_page: 1,
  });
  const [unreadCounts, setUnreadCounts] = useState(EMPTY_COUNTS);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [markingIds, setMarkingIds] = useState(() => new Set());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!enabled || !isValidWorkspace(workspace)) {
      if (mountedRef.current) {
        setItems([]);
        setLoading(false);
      }
      return;
    }

    if (mountedRef.current) {
      setLoading(true);
      setError(null);
    }

    try {
      const [listResult, countsResult] = await Promise.all([
        fetchNotifications({ workspace, unreadOnly, page, perPage }),
        fetchUnreadCounts(),
      ]);

      if (!mountedRef.current) return;
      setItems(listResult.items);
      setPagination(listResult.pagination);
      setUnreadCounts(countsResult);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err : new Error('Unable to load notifications.'));
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [enabled, workspace, unreadOnly, page, perPage]);

  useEffect(() => {
    setItems([]);
    setError(null);
    load();
  }, [load]);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return undefined;

    const handleSync = () => {
      load();
    };
    window.addEventListener(NOTIFICATION_UPDATED_EVENT, handleSync);
    return () => {
      window.removeEventListener(NOTIFICATION_UPDATED_EVENT, handleSync);
    };
  }, [enabled, load]);

  const markAsRead = useCallback(async (notificationId) => {
    const id = Number(notificationId);
    if (!Number.isInteger(id) || id <= 0) return null;

    setMarkingIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });

    try {
      const updated = await markNotificationRead(id);
      if (mountedRef.current && updated) {
        setItems((prev) => prev.map((item) => (item.id === id ? updated : item)));
      }
      return updated;
    } finally {
      if (mountedRef.current) {
        setMarkingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    if (!isValidWorkspace(workspace) || markingAll) return null;

    setMarkingAll(true);
    try {
      return await markAllNotificationsRead({ workspace });
    } finally {
      if (mountedRef.current) {
        setMarkingAll(false);
      }
    }
  }, [workspace, markingAll]);

  const workspaceUnreadCount = isValidWorkspace(workspace)
    ? unreadCounts.by_workspace[workspace] || 0
    : 0;

  return {
    items,
    pagination,
    unreadCounts,
    workspaceUnreadCount,
    loading,
    error,
    markingAll,
    markingIds,
    refresh: load,
    markAsRead,
    markAllAsRead,
  };
}

export default useWorkspaceNotifications;
