import { hasAdminPermission } from './permissions';

export const ADMIN_COLLAPSED_IMPORTANT_IDS = new Set([
  'dashboard',
  'accounts',
  'restaurants',
  'riders',
  'applications',
  'orders',
  'finance',
  'support',
  'settings',
]);

export const ADMIN_NAV_ITEMS = [
  { id: 'dashboard', section: 'OVERVIEW', label: 'Dashboard', href: '/admin', module: 'dashboard', requiredPermission: { module: 'dashboard', action: 'view' } },
  { id: 'accounts', section: 'PEOPLE', label: 'Accounts', href: '/admin/accounts', module: 'accounts', requiredPermission: { module: 'accounts', action: 'view' } },
  { id: 'administrators', section: 'PEOPLE', label: 'Administrators', href: '/admin/administrators', module: 'administrators', requiredPermission: { module: 'administrators', action: 'view' } },
  { id: 'restaurants', section: 'PEOPLE', label: 'Restaurants', href: '/admin/restaurants', module: 'restaurants', requiredPermission: { module: 'restaurants', action: 'view' } },
  { id: 'riders', section: 'PEOPLE', label: 'Riders', href: '/admin/riders', module: 'riders', requiredPermission: { module: 'riders', action: 'view' } },
  { id: 'applications', section: 'PEOPLE', label: 'Applications', href: '/admin/applications', module: 'applications', requiredPermission: { module: 'applications', action: 'view' } },
  { id: 'orders', section: 'OPERATIONS', label: 'Orders', href: '/admin/orders', module: 'orders', requiredPermission: { module: 'orders', action: 'view' } },
  { id: 'reservations', section: 'OPERATIONS', label: 'Reservations', href: '/admin/reservations', module: 'reservations', requiredPermission: { module: 'reservations', action: 'view' } },
  { id: 'serviceAreas', section: 'OPERATIONS', label: 'Service Areas', href: '/admin/service-areas', module: 'serviceAreas', requiredPermission: { module: 'serviceAreas', action: 'view' } },
  { id: 'support', section: 'OPERATIONS', label: 'Support and Complaints', href: '/admin/support', module: 'support', requiredPermission: { module: 'support', action: 'view' } },
  { id: 'finance', section: 'FINANCE', label: 'Finance', href: '/admin/finance', module: 'finance', requiredPermission: { module: 'finance', action: 'view' } },
  { id: 'fees', section: 'FINANCE', label: 'Fees and Commissions', href: '/admin/fees', module: 'fees', requiredPermission: { module: 'fees', action: 'view' } },
  { id: 'discounts', section: 'FINANCE', label: 'Discounts and Promotions', href: '/admin/discounts', module: 'discounts', requiredPermission: { module: 'discounts', action: 'view' } },
  { id: 'reports', section: 'INSIGHTS', label: 'Reports and Analytics', href: '/admin/reports', module: 'reports', requiredPermission: { module: 'reports', action: 'view' } },
  { id: 'activity', section: 'INSIGHTS', label: 'Activity Logs', href: '/admin/activity', module: 'activity', requiredPermission: { module: 'activity', action: 'view' } },
  { id: 'content', section: 'SYSTEM', label: 'Content Management', href: '/admin/content', module: 'content', requiredPermission: { module: 'content', action: 'view' } },
  { id: 'settings', section: 'SYSTEM', label: 'Settings', href: '/admin/settings', module: 'settings', requiredPermission: { module: 'settings', action: 'view' } },
];

export function getAdminNavItems(role) {
  return ADMIN_NAV_ITEMS.filter((item) => hasAdminPermission(role, item.module, 'view'));
}
