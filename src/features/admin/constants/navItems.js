import { hasAdminPermission } from './permissions';

export const ADMIN_NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', href: '/admin', module: 'dashboard', requiredPermission: { module: 'dashboard', action: 'view' } },
  { id: 'accounts', label: 'Accounts', href: '/admin/accounts', module: 'accounts', requiredPermission: { module: 'accounts', action: 'view' } },
  { id: 'administrators', label: 'Administrators', href: '/admin/administrators', module: 'administrators', requiredPermission: { module: 'administrators', action: 'view' } },
  { id: 'restaurants', label: 'Restaurants', href: '/admin/restaurants', module: 'restaurants', requiredPermission: { module: 'restaurants', action: 'view' } },
  { id: 'riders', label: 'Riders', href: '/admin/riders', module: 'riders', requiredPermission: { module: 'riders', action: 'view' } },
  { id: 'orders', label: 'Orders', href: '/admin/orders', module: 'orders', requiredPermission: { module: 'orders', action: 'view' } },
  { id: 'reservations', label: 'Reservations', href: '/admin/reservations', module: 'reservations', requiredPermission: { module: 'reservations', action: 'view' } },
  { id: 'finance', label: 'Finance', href: '/admin/finance', module: 'finance', requiredPermission: { module: 'finance', action: 'view' } },
  { id: 'fees', label: 'Fees and Commissions', href: '/admin/fees', module: 'fees', requiredPermission: { module: 'fees', action: 'view' } },
  { id: 'discounts', label: 'Discounts and Promotions', href: '/admin/discounts', module: 'discounts', requiredPermission: { module: 'discounts', action: 'view' } },
  { id: 'serviceAreas', label: 'Service Areas', href: '/admin/service-areas', module: 'serviceAreas', requiredPermission: { module: 'serviceAreas', action: 'view' } },
  { id: 'reports', label: 'Reports and Analytics', href: '/admin/reports', module: 'reports', requiredPermission: { module: 'reports', action: 'view' } },
  { id: 'support', label: 'Support and Complaints', href: '/admin/support', module: 'support', requiredPermission: { module: 'support', action: 'view' } },
  { id: 'content', label: 'Content Management', href: '/admin/content', module: 'content', requiredPermission: { module: 'content', action: 'view' } },
  { id: 'activity', label: 'Activity Logs', href: '/admin/activity', module: 'activity', requiredPermission: { module: 'activity', action: 'view' } },
  { id: 'settings', label: 'Settings', href: '/admin/settings', module: 'settings', requiredPermission: { module: 'settings', action: 'view' } },
];

export function getAdminNavItems(role) {
  return ADMIN_NAV_ITEMS.filter((item) => hasAdminPermission(role, item.module, 'view'));
}
