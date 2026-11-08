// DESIGN SAMPLE DATA - not connected to anything.
export const TEAM_PREVIEW_STATES = ['Sample data', 'Loading', 'Empty', 'Error'];

export const POSITION_OPTIONS = [
  'Manager',
  'Order Handler',
  'Reservation Handler',
  'Inventory Manager',
  'Menu Manager',
  'Custom',
];

export const PERMISSION_GROUPS = [
  {
    name: 'Business Profile',
    permissions: [
      ['business.profile.view', 'View Business Profile'],
      ['business.profile.edit', 'Edit Business Profile'],
      ['business.photos.manage', 'Manage Restaurant Photos'],
      ['business.location.manage', 'Manage Location and Delivery Coverage'],
      ['business.hours.manage', 'Manage Operating Hours'],
    ],
  },
  {
    name: 'Menu Management',
    permissions: [
      ['menu.view', 'View Menu'],
      ['menu.items.create', 'Create Menu Items'],
      ['menu.items.edit', 'Edit Menu Items'],
      ['menu.items.delete', 'Delete or Archive Menu Items'],
      ['menu.photos.manage', 'Manage Menu Photos'],
      ['menu.availability.manage', 'Manage Menu Availability'],
      ['menu.pricing.manage', 'Manage Pricing'],
      ['menu.addons.manage', 'Manage Add-ons'],
    ],
  },
  {
    name: 'Orders',
    permissions: [
      ['orders.view', 'View Orders'],
      ['orders.accept', 'Accept Orders'],
      ['orders.reject', 'Reject Orders'],
      ['orders.preparation.update', 'Update Preparation Status'],
      ['orders.pickup.manage', 'Manage Pickup Progress'],
      ['orders.customer.view', 'View Customer Order Information'],
    ],
  },
  {
    name: 'Reservations',
    permissions: [
      ['reservations.view', 'View Reservations'],
      ['reservations.approve', 'Approve Reservations'],
      ['reservations.reject', 'Reject Reservations'],
      ['reservations.assignTables', 'Assign Tables'],
      ['reservations.updateStatus', 'Update Reservation Status'],
      ['reservations.manageArrival', 'Manage Customer Arrival'],
    ],
  },
  {
    name: 'Tables',
    permissions: [
      ['tables.view', 'View Tables'],
      ['tables.add', 'Add Tables'],
      ['tables.edit', 'Edit Tables'],
      ['tables.manageAvailability', 'Manage Table Availability'],
    ],
  },
  {
    name: 'Inventory',
    permissions: [
      ['inventory.view', 'View Inventory'],
      ['inventory.addStock', 'Add Stock'],
      ['inventory.deductStock', 'Deduct Stock'],
      ['inventory.adjustStock', 'Adjust Stock'],
      ['inventory.viewHistory', 'View Stock History'],
    ],
  },
  {
    name: 'Promotions',
    permissions: [
      ['promotions.view', 'View Promotions'],
      ['promotions.create', 'Create Promotions'],
      ['promotions.edit', 'Edit Promotions'],
      ['promotions.status.manage', 'Activate or Deactivate Promotions'],
    ],
  },
  {
    name: 'Reports',
    permissions: [
      ['reports.sales.view', 'View Sales Reports'],
      ['reports.orders.view', 'View Order Reports'],
      ['reports.reservations.view', 'View Reservation Reports'],
      ['reports.inventory.view', 'View Inventory Reports'],
    ],
  },
  {
    name: 'Team Management',
    permissions: [
      ['team.view', 'View Team Members'],
      ['team.invite', 'Invite Staff'],
      ['team.permissions.manage', 'Manage Staff Permissions'],
    ],
  },
];

export const STAFF_SAMPLES = [
  {
    id: 'staff-ana',
    name: 'Ana Reyes',
    username: '@anareyes',
    email: 'ana.reyes@salo.ph',
    initials: 'AR',
    color: 'coral',
    position: 'Manager',
    responsibilities: ['Orders', 'Reservations', 'Team'],
    status: 'Active',
    joined: 'Mar 12, 2025',
    permissions: [
      'orders.view', 'orders.accept', 'orders.reject', 'orders.preparation.update',
      'reservations.view', 'reservations.approve', 'reservations.reject',
      'reservations.assignTables', 'reservations.updateStatus', 'reservations.manageArrival',
      'tables.view', 'tables.edit', 'inventory.view', 'reports.sales.view', 'team.view',
    ],
  },
  {
    id: 'staff-miguel',
    name: 'Miguel Santos',
    username: '@miguels',
    email: 'miguel.santos@salo.ph',
    initials: 'MS',
    color: 'sage',
    position: 'Order Handler',
    responsibilities: ['Orders', 'Pickup'],
    status: 'Active',
    joined: 'Jun 04, 2025',
    permissions: ['orders.view', 'orders.accept', 'orders.reject', 'orders.preparation.update', 'orders.pickup.manage'],
  },
  {
    id: 'staff-liza',
    name: 'Liza Cruz',
    username: '@lizac',
    email: 'liza.cruz@salo.ph',
    initials: 'LC',
    color: 'lavender',
    position: 'Inventory Manager',
    responsibilities: ['Inventory', 'Stock history'],
    status: 'Suspended',
    joined: 'Sep 21, 2025',
    permissions: ['inventory.view', 'inventory.addStock', 'inventory.deductStock', 'inventory.adjustStock', 'inventory.viewHistory'],
  },
];

export const STAFF_INVITATIONS = [
  { id: 'invite-ana', restaurant: 'Salo Kitchen — Uptown', user: 'Paolo Lim', email: 'paolo.lim@salo.ph', position: 'Order Handler', date: 'Nov 06, 2026', status: 'Pending', responsibilities: ['View Orders', 'Accept Orders', 'Update Preparation Status'] },
  { id: 'invite-mia', restaurant: 'Salo Kitchen — Uptown', user: 'Mia Tan', email: 'mia.tan@salo.ph', position: 'Menu Manager', date: 'Nov 03, 2026', status: 'Accepted', responsibilities: ['View Menu', 'Edit Menu Items', 'Manage Menu Photos'] },
  { id: 'invite-jo', restaurant: 'Salo Kitchen — Uptown', user: 'Jo Garcia', email: 'jo.garcia@salo.ph', position: 'Reservation Handler', date: 'Oct 29, 2026', status: 'Declined', responsibilities: ['View Reservations', 'Assign Tables'] },
  { id: 'invite-kai', restaurant: 'Salo Kitchen — Uptown', user: 'Kai Dela Cruz', email: 'kai.dc@salo.ph', position: 'Inventory Manager', date: 'Oct 02, 2026', status: 'Expired', responsibilities: ['View Inventory', 'Add Stock'] },
];

export const OWNERSHIP_INVITATIONS = [
  { id: 'owner-invite', restaurant: 'Salo Kitchen — Uptown', user: 'Bea Navarro', email: 'bea.navarro@salo.ph', date: 'Nov 05, 2026', status: 'Pending', approval: 'Awaiting invitee response' },
];

export const OWNER_MEMBERSHIPS = {
  approved: [
    { id: 'owner-elena', name: 'Elena Dela Cruz', username: '@elenadc', email: 'elena@salo.ph', initials: 'ED', joined: 'Jan 18, 2024', note: 'Founding owner · Original approval' },
    { id: 'owner-ruben', name: 'Ruben Dela Cruz', username: '@rubendc', email: 'ruben@salo.ph', initials: 'RD', joined: 'Aug 09, 2025', note: 'Co-owner · Invitation accepted' },
  ],
  inactive: [
    { id: 'owner-inactive', name: 'Tomas Dela Cruz', username: '@tomasdc', email: 'tomas@salo.ph', initials: 'TD', joined: 'Feb 16, 2024', note: 'Membership inactive · Historical record retained' },
  ],
  history: [
    { id: 'history-1', date: 'Aug 09, 2025', title: 'Co-owner membership approved', detail: 'Ruben Dela Cruz accepted an ownership invitation.' },
    { id: 'history-2', date: 'Aug 08, 2025', title: 'Ownership invitation sent', detail: 'Invited by Elena Dela Cruz.' },
    { id: 'history-3', date: 'Jan 18, 2024', title: 'Restaurant ownership established', detail: 'Elena Dela Cruz approved as founding owner.' },
  ],
};

export const STAFF_SEARCH_SAMPLES = [
  { id: 'candidate-paolo', name: 'Paolo Lim', username: '@paololim', email: 'paolo.lim@salo.ph', initials: 'PL', color: 'blue' },
  { id: 'candidate-bea', name: 'Bea Navarro', username: '@beanav', email: 'bea.navarro@salo.ph', initials: 'BN', color: 'gold' },
];

export const CUSTOMER_INVITATION_COUNT = 2;

export const CUSTOMER_INVITATION_SAMPLES = [
  {
    id: 'customer-staff-invite',
    type: 'staff',
    restaurant: 'Salo Kitchen — Uptown',
    invitingOwner: 'Elena Dela Cruz',
    position: 'Order Handler',
    details: ['View Orders', 'Accept Orders', 'Update Preparation Status'],
    date: 'Nov 06, 2026',
  },
  {
    id: 'customer-owner-invite',
    type: 'ownership',
    restaurant: 'Salo Kitchen — Uptown',
    invitingOwner: 'Elena Dela Cruz',
    position: 'Co-owner invitation',
    details: ['Full owner-level access to this restaurant'],
    date: 'Nov 05, 2026',
  },
];
