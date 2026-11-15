export const WORKSPACE_CATALOG = {
  customer: {
    id: 'customer',
    authRole: 'customer',
    label: 'Customer',
    description: 'Order food, book tables, and manage deliveries',
    homeHref: '/customer',
    badgeTone: 'orange',
  },
  restaurant: {
    id: 'restaurant',
    authRole: 'owner',
    label: 'Restaurant',
    description: 'Manage menu, orders, tables, and staff',
    homeHref: '/owner',
    badgeTone: 'gold',
  },
  rider: {
    id: 'rider',
    authRole: 'rider',
    label: 'Rider',
    description: 'Accept delivery offers, track routes, and view earnings',
    homeHref: '/rider',
    badgeTone: 'green',
  },
  admin: {
    id: 'admin',
    authRole: 'admin',
    label: 'Admin',
    description: 'Platform oversight, approvals, and system configuration',
    homeHref: '/admin',
    badgeTone: 'brown',
  },
};

export const APPLICATION_STATUS_META = {
  submitted: { label: 'Submitted', tone: 'info' },
  pending_review: { label: 'Pending Review', tone: 'info' },
  under_review: { label: 'Under Review', tone: 'warning' },
  additional_documents_required: { label: 'Additional Documents Required', tone: 'warning' },
  needs_correction: { label: 'Needs Correction', tone: 'warning' },
  resubmitted: { label: 'Resubmitted', tone: 'info' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' },
};

export function normalizeWorkspaceId(role) {
  const key = String(role || 'customer').toLowerCase();
  if (key === 'owner' || key === 'staff' || key === 'restaurant' || key === 'restaurant_owner') {
    return 'restaurant';
  }
  return WORKSPACE_CATALOG[key] ? key : 'customer';
}

export function resolveUserWorkspaces(currentRole, roles = []) {
  const normalizedCurrent = normalizeWorkspaceId(currentRole);
  const rawRoles = Array.isArray(roles) && roles.length > 0 ? roles : [currentRole || 'customer'];

  const seen = new Set();
  const workspaces = [];

  for (const rawRole of rawRoles) {
    const workspaceId = normalizeWorkspaceId(rawRole);
    if (seen.has(workspaceId) || !WORKSPACE_CATALOG[workspaceId]) {
      continue;
    }
    seen.add(workspaceId);

    const authRole = rawRole === 'staff' || rawRole === 'owner' ? rawRole : WORKSPACE_CATALOG[workspaceId].authRole;
    workspaces.push({
      ...WORKSPACE_CATALOG[workspaceId],
      authRole,
      isCurrent: workspaceId === normalizedCurrent,
    });
  }

  return workspaces;
}
