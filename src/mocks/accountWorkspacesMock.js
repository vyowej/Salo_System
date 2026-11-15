/**
 * Mock data for Switch Account workspaces and Partner/Rider application statuses.
 * UI-only preview data; no authentication or backend state is modified.
 */

export const APPLICATION_STATUSES = [
  'Draft',
  'Submitted',
  'Under Review',
  'Additional Information Required',
  'Approved',
  'Rejected',
  'Withdrawn',
];

export const APPLICATION_STATUS_TONE = {
  Draft: 'neutral',
  Submitted: 'info',
  'Under Review': 'warning',
  'Additional Information Required': 'warning',
  Approved: 'success',
  Rejected: 'danger',
  Withdrawn: 'neutral',
};

export const WORKSPACE_CATALOG = {
  customer: {
    id: 'customer',
    label: 'Customer',
    description: 'Order food, book tables, and manage deliveries',
    homeHref: '/customer',
    badgeTone: 'orange',
  },
  restaurant: {
    id: 'restaurant',
    label: 'Restaurant',
    description: 'Manage menu, orders, tables, and staff',
    homeHref: '/owner',
    badgeTone: 'gold',
  },
  rider: {
    id: 'rider',
    label: 'Rider',
    description: 'Accept delivery offers, track routes, and view earnings',
    homeHref: '/rider',
    badgeTone: 'green',
  },
  admin: {
    id: 'admin',
    label: 'Admin',
    description: 'Platform oversight, approvals, and system configuration',
    homeHref: '/admin',
    badgeTone: 'brown',
  },
};

export const MOCK_ACCOUNT_PROFILES = {
  customer: {
    roles: ['customer', 'restaurant'],
    applications: {
      restaurant: null,
      rider: {
        status: 'Under Review',
        submittedAt: '2026-11-10',
        href: '/rider-application/status',
      },
    },
  },
  restaurant: {
    roles: ['customer', 'restaurant'],
    applications: {
      restaurant: {
        status: 'Approved',
        submittedAt: '2026-10-18',
        href: '/business-application/status',
      },
      rider: null,
    },
  },
  rider: {
    roles: ['customer', 'rider'],
    applications: {
      restaurant: {
        status: 'Draft',
        submittedAt: null,
        href: '/become-a-partner',
      },
      rider: {
        status: 'Approved',
        submittedAt: '2026-10-05',
        href: '/rider-application/status',
      },
    },
  },
  admin: {
    roles: ['customer', 'restaurant', 'rider', 'admin'],
    applications: {
      restaurant: null,
      rider: null,
    },
  },
};

const ROLE_ALIASES = {
  owner: 'restaurant',
  restaurant_owner: 'restaurant',
  staff: 'restaurant',
  super_admin: 'admin',
  operations_admin: 'admin',
  finance_admin: 'admin',
  support_admin: 'admin',
};

export function normalizeWorkspaceRole(role) {
  const key = String(role || 'customer').toLowerCase();
  return ROLE_ALIASES[key] || (WORKSPACE_CATALOG[key] ? key : 'customer');
}

function readStoredApplication(storageKey, fallbackHref) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const record = Array.isArray(parsed) ? parsed[0] : (parsed?.restaurant || parsed);
    if (!record || !record.status) return null;
    const normalizedStatus = APPLICATION_STATUSES.includes(record.status)
      ? record.status
      : record.status === 'Pending Review'
        ? 'Under Review'
        : 'Submitted';
    return {
      status: normalizedStatus,
      submittedAt: record.submittedAt || null,
      href: fallbackHref,
    };
  } catch {
    return null;
  }
}

/**
 * Resolves the workspaces held by the current account and any existing partner/rider applications.
 */
export function getAccountWorkspaceState(currentRole, user = null) {
  const normalizedRole = normalizeWorkspaceRole(currentRole);
  const preset = MOCK_ACCOUNT_PROFILES[normalizedRole] || MOCK_ACCOUNT_PROFILES.customer;

  const userRoles = Array.isArray(user?.roles) && user.roles.length > 0
    ? user.roles.map(normalizeWorkspaceRole)
    : preset.roles;

  const uniqueRoles = Array.from(new Set([normalizedRole, ...userRoles]))
    .filter((roleId) => Boolean(WORKSPACE_CATALOG[roleId]));

  // Admin workspace is only shown if the account actually holds it
  const workspaces = uniqueRoles.map((roleId) => ({
    ...WORKSPACE_CATALOG[roleId],
    isCurrent: roleId === normalizedRole,
  }));

  const storedRestaurantApp = readStoredApplication('salo_partner_applications', '/business-application/status');
  const storedRiderApp = readStoredApplication('salo_rider_applications', '/rider-application/status');

  return {
    currentRole: normalizedRole,
    workspaces,
    applications: {
      restaurant: storedRestaurantApp || preset.applications.restaurant,
      rider: storedRiderApp || preset.applications.rider,
    },
  };
}
