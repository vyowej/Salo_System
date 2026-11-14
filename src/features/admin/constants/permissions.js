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
  'applications',
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

export const ADMIN_PERMISSION_MATRIX = {
  Admin: Object.fromEntries(ADMIN_MODULES.map((module) => [module, allActions])),
};

export function hasAdminPermission(role, module, action = 'view') {
  return (ADMIN_PERMISSION_MATRIX[role] || ADMIN_PERMISSION_MATRIX.Admin)?.[module]?.includes(action) ?? false;
}
