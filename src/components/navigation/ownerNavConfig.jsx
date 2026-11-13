/**
 * Shared owner navigation configuration (max 9 items, ordered).
 * Restaurant Profile, Activity Log, and Settings live in the avatar dropdown.
 */

const iconProps = {
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

export const OWNER_SIDEBAR_COLLAPSED_KEY = 'salo_owner_sidebar_collapsed';

export const OWNER_NAV_CONFIG = [
  {
    id: 'overview',
    label: 'Overview',
    href: '/owner',
    end: true,
    icon: (
      <svg {...iconProps}>
        <path d="M3 10.5L12 3l9 7.5V20a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 20v-9.5z" />
        <path d="M9.5 21.5V14h5v7.5" />
      </svg>
    ),
  },
  {
    id: 'orders',
    label: 'Orders',
    href: '/owner/orders',
    icon: (
      <svg {...iconProps}>
        <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
        <rect x="9" y="3" width="6" height="4" rx="1" />
        <path d="M9 12h6M9 16h4" />
      </svg>
    ),
  },
  {
    id: 'reservations',
    label: 'Reservations',
    href: '/owner/reservations',
    icon: (
      <svg {...iconProps}>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
    ),
  },
  {
    id: 'menu',
    label: 'Menu',
    href: '/owner/menu',
    icon: (
      <svg {...iconProps}>
        <path d="M4 6h16M4 12h16M4 18h10" />
      </svg>
    ),
  },
  {
    id: 'inventory',
    label: 'Inventory',
    href: '/owner/inventory',
    icon: (
      <svg {...iconProps}>
        <path d="M21 8l-9-5-9 5v8l9 5 9-5V8z" />
        <path d="M3.3 7L12 12l8.7-5M12 22V12" />
      </svg>
    ),
  },
  {
    id: 'tables',
    label: 'Tables',
    href: '/owner/tables',
    icon: (
      <svg {...iconProps}>
        <path d="M3 10h18M5 10V5h14v5M7 10v10M17 10v10" />
      </svg>
    ),
  },
  {
    id: 'promotions',
    label: 'Promotions',
    href: '/owner/promotions',
    icon: (
      <svg {...iconProps}>
        <path d="M20.59 13.41L11 3.83V3H4v7h.83l9.58 9.59a2 2 0 002.83 0l3.35-3.35a2 2 0 000-2.83z" />
        <circle cx="7.5" cy="7.5" r="0.8" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    id: 'team',
    label: 'Staff',
    href: '/owner/team',
    icon: (
      <svg {...iconProps}>
        <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
      </svg>
    ),
  },
  {
    id: 'reports',
    label: 'Reports',
    href: '/owner/reports',
    icon: (
      <svg {...iconProps}>
        <path d="M4 19V5M4 19h16M8 15v-4M13 15V8M18 15v-6" />
      </svg>
    ),
  },
];
