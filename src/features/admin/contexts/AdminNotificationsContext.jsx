import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { useWorkspaceNotifications } from '../../../hooks/useWorkspaceNotifications';
import adminApiService from '../../../services/adminApiService';
import { getNotificationRoute } from '../../../utils/notificationUtils';
import AdminNotificationsContext from './adminNotificationsStore';

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
    fetchList: false,
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

  const { isAuthenticated, role, roles, user } = useAuth();
  const isAdmin = isAuthenticated && (role === 'admin' || (Array.isArray(roles) && roles.includes('admin'))) && !user?.must_change_password;
  const [pendingApplicationsCount, setPendingApplicationsCount] = useState(0);
  const [openSupportCount, setOpenSupportCount] = useState(0);

  useEffect(() => {
    if (!isAdmin) {
      setPendingApplicationsCount(0);
      setOpenSupportCount(0);
      return;
    }
    let active = true;
    (async () => {
      try {
        const dash = await adminApiService.getDashboard();
        if (!active) return;
        const pq = dash?.pending_queues ?? {};
        setPendingApplicationsCount(
          Number(pq.restaurant_applications ?? 0) +
          Number(pq.rider_applications ?? 0) +
          Number(pq.branch_permits ?? 0),
        );
        setOpenSupportCount(
          Number(pq.failed_deliveries ?? 0) +
          Number(pq.change_requests ?? 0) +
          Number(pq.lifecycle_requests ?? 0),
        );
      } catch {
        // leave 0 on error
      }
    })();
    return () => { active = false; };
  }, [isAdmin]);

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
