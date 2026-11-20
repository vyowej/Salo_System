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
  fetchList = true,
} = {}) {
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({
    current_page: 1,
    per_page: perPage,
    total: 0,
    last_page: 1,
  });
  const [unreadCounts, setUnreadCounts] = useState(EMPTY_COUNTS);
  const [loading, setLoading] = useState(Boolean(enabled && fetchList));
  const [error, setError] = useState(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [markingIds, setMarkingIds] = useState(() => new Set());
  const mountedRef = useRef(true);
  const hasLoadedListRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async ({ forceList = false } = {}) => {
    if (!enabled || !isValidWorkspace(workspace)) {
      if (mountedRef.current) {
        setItems([]);
        setLoading(false);
      }
      return;
    }

    const shouldLoadList = Boolean(fetchList || forceList || hasLoadedListRef.current);

    if (mountedRef.current) {
      if (shouldLoadList) {
        setLoading(true);
      }
      setError(null);
    }

    try {
      if (shouldLoadList) {
        const [listResult, countsResult] = await Promise.all([
          fetchNotifications({ workspace, unreadOnly, page, perPage }),
          fetchUnreadCounts(),
        ]);

        if (!mountedRef.current) return;
        hasLoadedListRef.current = true;
        setItems(listResult.items);
        setPagination(listResult.pagination);
        setUnreadCounts(countsResult);
      } else {
        const countsResult = await fetchUnreadCounts();
        if (!mountedRef.current) return;
        setUnreadCounts(countsResult);
      }
    } catch (err) {
      if (!mountedRef.current) return;
      if (shouldLoadList) {
        setError(err instanceof Error ? err : new Error('Unable to load notifications.'));
      }
    } finally {
      if (mountedRef.current && shouldLoadList) {
        setLoading(false);
      }
    }
  }, [enabled, fetchList, workspace, unreadOnly, page, perPage]);

  useEffect(() => {
    hasLoadedListRef.current = false;
    setItems([]);
    setError(null);
  }, [workspace, unreadOnly, page, perPage]);

  useEffect(() => {
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

  const refresh = useCallback(() => load({ forceList: true }), [load]);

  return {
    items,
    pagination,
    unreadCounts,
    workspaceUnreadCount,
    loading,
    error,
    markingAll,
    markingIds,
    refresh,
    markAsRead,
    markAllAsRead,
  };
}

export default useWorkspaceNotifications;
