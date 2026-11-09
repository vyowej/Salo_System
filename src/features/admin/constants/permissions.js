export const ADMIN_PERMISSION_ACTIONS = [
  'view',
  'create',
  'edit',
  'approve',
  'reject',
  'activate',
  'deactivate',
  'delete',
  'export',
  'manage_permissions',
];

// These checks only shape the client experience; enforce every permission again in the backend.

export const ADMIN_MODULES = [
  'dashboard',
  'accounts',
  'administrators',
  'restaurants',
  'riders',
  'orders',
  'reservations',
  'finance',
  'fees',
  'discounts',
  'serviceAreas',
  'reports',
  'support',
  'content',
  'activity',
  'settings',
];

const allActions = ADMIN_PERMISSION_ACTIONS;
const viewOnly = ['view'];

export const ADMIN_PERMISSION_MATRIX = {
  'Super Admin': Object.fromEntries(ADMIN_MODULES.map((module) => [module, allActions])),
  'Platform Operations': {
    dashboard: viewOnly, accounts: viewOnly, restaurants: viewOnly, riders: viewOnly,
    orders: viewOnly, reservations: viewOnly, serviceAreas: viewOnly, reports: viewOnly,
    support: viewOnly, activity: viewOnly,
  },
  'Restaurant Management': {
    dashboard: viewOnly, accounts: viewOnly, restaurants: ['view', 'edit', 'approve', 'reject', 'activate', 'deactivate'],
    orders: viewOnly, reservations: viewOnly, support: viewOnly, reports: viewOnly,
  },
  'Rider Management': {
    dashboard: viewOnly, riders: ['view', 'edit', 'approve', 'reject', 'activate', 'deactivate'],
    orders: viewOnly, serviceAreas: viewOnly, support: viewOnly, activity: viewOnly,
  },
  Finance: {
    dashboard: viewOnly, orders: viewOnly, reservations: viewOnly, finance: ['view', 'approve', 'export'],
    fees: viewOnly, reports: ['view', 'export'], activity: viewOnly,
  },
  'Customer Support': {
    dashboard: viewOnly, accounts: viewOnly, orders: viewOnly, reservations: viewOnly,
    support: ['view', 'create', 'edit', 'approve', 'reject'], activity: viewOnly,
  },
  Marketing: {
    dashboard: viewOnly, discounts: ['view', 'create', 'edit', 'activate', 'deactivate'],
    reports: ['view', 'export'], content: ['view', 'create', 'edit', 'activate', 'deactivate'],
  },
};

export function hasAdminPermission(role, module, action = 'view') {
  return ADMIN_PERMISSION_MATRIX[role]?.[module]?.includes(action) ?? false;
}
