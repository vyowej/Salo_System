import { useMemo } from 'react';
import { useWorkspaceNotifications } from '../../../hooks/useWorkspaceNotifications';
import { getNotificationRoute } from '../../../utils/notificationUtils';
import AdminNotificationsContext from './adminNotificationsStore';
import {
  getOpenSupportCount,
  getPendingApplicationsCount,
} from '../services/notificationsService';

function getDateBucketManila(createdAt) {
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

export function AdminNotificationsProvider({ children }) {
  const {
    items,
    workspaceUnreadCount,
    loading,
    error,
    markingAll,
    refresh,
    markAsRead,
    markAllAsRead,
  } = useWorkspaceNotifications({
    workspace: 'admin',
    perPage: 8,
  });

  const notifications = useMemo(
    () => items.map((item) => ({
      ...item,
      text: item.body ? `${item.title}: ${item.body}` : item.title,
      time: item.created_at,
      groupLabel: getDateBucketManila(item.created_at),
      href: getNotificationRoute(item),
    })),
    [items],
  );

  const pendingApplicationsCount = useMemo(() => getPendingApplicationsCount(), []);
  const openSupportCount = useMemo(() => getOpenSupportCount(), []);

  const value = useMemo(() => ({
    notifications,
    unreadCount: workspaceUnreadCount,
    loading,
    error,
    markingAll,
    refresh,
    markAsRead,
    markAllAsRead,
    pendingApplicationsCount,
    openSupportCount,
  }), [
    notifications,
    workspaceUnreadCount,
    loading,
    error,
    markingAll,
    refresh,
    markAsRead,
    markAllAsRead,
    pendingApplicationsCount,
    openSupportCount,
  ]);

  return (
    <AdminNotificationsContext.Provider value={value}>
      {children}
    </AdminNotificationsContext.Provider>
  );
}
