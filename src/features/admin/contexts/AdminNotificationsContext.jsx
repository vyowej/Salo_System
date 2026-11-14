import { useCallback, useEffect, useMemo, useState } from 'react';
import { hasAdminPermission } from '../constants';
import useAdminSession from './useAdminSession';
import AdminNotificationsContext from './adminNotificationsStore';
import {
  getAdminNotifications,
  getOpenSupportCount,
  getPendingApplicationsCount,
} from '../services/notificationsService';

export function AdminNotificationsProvider({ children }) {
  const { currentAdmin } = useAdminSession();
  const [readIds, setReadIds] = useState(() => new Set());
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    function handleUpdate() {
      setRevision((value) => value + 1);
    }
    window.addEventListener('salo-admin-data-updated', handleUpdate);
    return () => window.removeEventListener('salo-admin-data-updated', handleUpdate);
  }, []);

  const allNotifications = useMemo(() => {
    void revision;
    const raw = getAdminNotifications();
    return raw
      .filter((item) => hasAdminPermission(currentAdmin.role, item.module, 'view'))
      .map((item) => ({
        ...item,
        read: readIds.has(item.id),
      }));
  }, [currentAdmin.role, readIds, revision]);

  const unreadCount = useMemo(
    () => allNotifications.filter((item) => !item.read).length,
    [allNotifications],
  );

  const pendingApplicationsCount = useMemo(() => { void revision; return getPendingApplicationsCount(); }, [revision]);
  const openSupportCount = useMemo(() => { void revision; return getOpenSupportCount(); }, [revision]);

  const markAsRead = useCallback((id) => {
    setReadIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const markAllAsRead = useCallback(() => {
    setReadIds(new Set(allNotifications.map((item) => item.id)));
  }, [allNotifications]);

  const value = useMemo(() => ({
    notifications: allNotifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    pendingApplicationsCount,
    openSupportCount,
  }), [allNotifications, unreadCount, markAsRead, markAllAsRead, pendingApplicationsCount, openSupportCount]);

  return (
    <AdminNotificationsContext.Provider value={value}>
      {children}
    </AdminNotificationsContext.Provider>
  );
}
