/**
 * Shared navigation, topbar, and profile dropdown configuration across all four roles.
 */

const MENU_ICON_PROPS = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': 'true',
};

const SIDEBAR_ICON_PROPS = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': 'true',
};

export function SettingsGearIcon({ size = 'sidebar' }) {
  const props = size === 'menu' ? MENU_ICON_PROPS : SIDEBAR_ICON_PROPS;
  return (
    <svg {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9c.26.604.852.997 1.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  );
}

const mkMenuIcon = (path) => (
  <svg {...MENU_ICON_PROPS}>
    <path d={path} />
  </svg>
);

export const ROLE_META = {
  customer: {
    label: 'Customer',
    tone: 'orange',
    homeHref: '/customer',
    profileHref: '/customer/profile',
    settingsHref: '/customer/settings',
  },
  restaurant: {
    label: 'Restaurant',
    tone: 'gold',
    homeHref: '/owner',
    profileHref: '/owner/profile',
    settingsHref: '/owner/settings',
  },
  rider: {
    label: 'Rider',
    tone: 'green',
    homeHref: '/rider',
    profileHref: '/rider/profile',
    settingsHref: '/rider/settings',
  },
  admin: {
    label: 'Admin',
    tone: 'brown',
    homeHref: '/admin',
    profileHref: '/admin/settings',
    settingsHref: '/admin/settings',
  },
};

export const TOPBAR_PAGE_TITLES = {
  '/customer': 'Explore & Feed',
  '/customer/restaurants': 'All Restaurants',
  '/customer/cart': 'Multi-Cart',
  '/customer/checkout': 'Checkout',
  '/customer/orders': 'My Orders',
  '/customer/favorites': 'Favorites',
  '/customer/notifications': 'Notifications',
  '/customer/reservations': 'Table Bookings',
  '/customer/invitations': 'Invitations',
  '/customer/addresses': 'Saved Addresses',
  '/customer/partner': 'Become a Partner',
  '/customer/profile': 'My Profile',
  '/customer/settings': 'Settings',
  '/owner': 'Overview',
  '/owner/profile': 'Business Profile',
  '/owner/menu': 'Menu Management',
  '/owner/orders': 'Orders',
  '/owner/reservations': 'Reservations',
  '/owner/tables': 'Tables',
  '/owner/inventory': 'Inventory',
  '/owner/promotions': 'Promotions',
  '/owner/team': 'Team and Staff',
  '/owner/reports': 'Reports and Statistics',
  '/owner/earnings': 'Reports and Statistics',
  '/owner/activity': 'Activity Logs',
  '/owner/settings': 'Settings',
  '/rider': 'Dashboard',
  '/rider/deliveries': 'Deliveries',
  '/rider/deliveries/active': 'Active Delivery',
  '/rider/active': 'Active Delivery',
  '/rider/jobs': 'Deliveries',
  '/rider/map': 'Map / Tracking',
  '/rider/schedule': 'Schedule',
  '/rider/earnings': 'Earnings',
  '/rider/history': 'Delivery History',
  '/rider/notifications': 'Notifications',
  '/rider/support': 'Support',
  '/rider/profile': 'Rider Profile',
  '/rider/settings': 'Settings',
  '/rider/safety': 'Safety',
  '/admin': 'Dashboard',
  '/admin/applications': 'Applications',
  '/admin/accounts': 'Accounts',
  '/admin/users': 'Accounts',
  '/admin/administrators': 'Administrators',
  '/admin/restaurants': 'Restaurants',
  '/admin/riders': 'Riders',
  '/admin/orders': 'Orders',
  '/admin/reservations': 'Reservations',
  '/admin/service-areas': 'Service Areas',
  '/admin/support': 'Support and Complaints',
  '/admin/finance': 'Finance',
  '/admin/fees': 'Fees and Commissions',
  '/admin/discounts': 'Discounts and Promotions',
  '/admin/reports': 'Reports and Analytics',
  '/admin/activity': 'Activity Logs',
  '/admin/content': 'Content Management',
  '/admin/settings': 'Settings',
  '/admin/settings/security': 'Security and Sessions',
};

export function resolveTopbarTitle(pathname) {
  if (TOPBAR_PAGE_TITLES[pathname]) return TOPBAR_PAGE_TITLES[pathname];
  if (pathname.startsWith('/customer/restaurants/')) return 'Restaurant Details';
  if (pathname.startsWith('/customer/orders/')) return 'Order Details';
  if (pathname.startsWith('/admin/orders/disputes')) return 'Disputes';
  if (pathname.startsWith('/admin/orders/')) return 'Order Details';
  if (pathname.startsWith('/admin/reservations/')) return 'Reservation Details';
  if (pathname.startsWith('/admin/accounts/')) return 'Account Details';
  if (pathname.startsWith('/admin/administrators/')) return 'Administrator Details';
  if (pathname.startsWith('/admin/restaurants/')) return 'Restaurant Details';
  if (pathname.startsWith('/admin/riders/')) return 'Rider Details';
  return '';
}

/**
 * Builds the unified profile dropdown menu items for any of the four roles.
 * Structure is identical across Customer, Restaurant, Rider, and Admin:
 * My Profile, Settings, Switch Account, Log out.
 */
export function buildProfileMenuItems({
  profileHref,
  settingsHref,
  canViewSettings = true,
  onSwitchAccount,
  onLogout,
}) {
  const items = [
    {
      id: 'profile',
      type: 'link',
      label: 'My Profile',
      href: profileHref,
      icon: mkMenuIcon('M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2 M12 3a4 4 0 100 8 4 4 0 000-8z'),
    },
  ];

  if (canViewSettings) {
    items.push({
      id: 'settings',
      type: 'link',
      label: 'Settings',
      href: settingsHref,
      icon: <SettingsGearIcon size="menu" />,
    });
  }

  items.push(
    {
      id: 'switch-account',
      label: 'Switch Account',
      icon: mkMenuIcon('M16 3h5v5 M4 20L21 3 M21 16v5h-5 M15 15l6 6 M4 4l5 5'),
      onClick: onSwitchAccount,
    },
    {
      id: 'logout',
      label: 'Log out',
      icon: mkMenuIcon('M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4 M16 17l5-5-5-5 M21 12H9'),
      onClick: onLogout,
      danger: true,
    }
  );

  return items;
}

export const PARTNER_PROMO_CARDS = {
  restaurant: {
    id: 'restaurant',
    title: 'Become a Partner of SALO',
    description: 'List your restaurant on SALO to accept online orders and table reservations.',
    ctaLabel: 'Apply as a Restaurant Partner',
    applyHref: '/become-a-partner',
    statusHref: '/business-application/status',
    approvedCtaLabel: 'Open Restaurant Workspace',
    approvedHref: '/owner',
  },
  rider: {
    id: 'rider',
    title: 'Become a Rider',
    description: 'Deliver orders on your schedule and track earnings directly in the Rider workspace.',
    ctaLabel: 'Apply as a Rider',
    applyHref: '/become-a-rider',
    statusHref: '/rider-application/status',
    approvedCtaLabel: 'Open Rider Workspace',
    approvedHref: '/rider',
  },
};

export const SWITCH_ACCOUNT_COPY = {
  title: 'Switch Account',
  subtitle: 'Move between your SALO workspaces or sign in with a different account.',
  workspacesHeading: 'Your workspaces',
  otherHeading: 'Other accounts',
  useDifferentLabel: 'Use a different account',
  useDifferentHint: 'Sign out of this session and return to the login page.',
  currentBadge: 'Current',
};
