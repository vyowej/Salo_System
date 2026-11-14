import { useContext } from 'react';
import AdminNotificationsContext from './adminNotificationsStore';

export function useAdminNotifications() {
  const ctx = useContext(AdminNotificationsContext);
  if (!ctx) {
    return {
      notifications: [],
      unreadCount: 0,
      markAsRead: () => {},
      markAllAsRead: () => {},
      pendingApplicationsCount: 0,
      openSupportCount: 0,
    };
  }
  return ctx;
}
