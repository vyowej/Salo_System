/**
 * Shared customer navigation configuration.
 * Single source of truth for the customer sidebar items and icons.
 */

import { SettingsGearIcon } from '../../config/SettingsGearIcon';

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

export const CUSTOMER_SIDEBAR_COLLAPSED_KEY = 'salo_customer_sidebar_collapsed';

export const CUSTOMER_NAV_CONFIG = [
  {
    id: 'home',
    label: 'Home / Explore',
    href: '/customer',
    end: true,
    matchPaths: ['/customer', '/customer/restaurants'],
    icon: (
      <svg {...iconProps}>
        <path d="M3 10.5L12 3l9 7.5V20a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 20v-9.5z" />
        <path d="M9.5 21.5V14h5v7.5" />
      </svg>
    ),
  },
  {
    id: 'orders',
    label: 'My Orders',
    href: '/customer/orders',
    icon: (
      <svg {...iconProps}>
        <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
        <path d="M3 6h18" />
        <path d="M16 10a4 4 0 01-8 0" />
      </svg>
    ),
  },
  {
    id: 'reservations',
    label: 'Reservations',
    href: '/customer/reservations',
    icon: (
      <svg {...iconProps}>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
    ),
  },
  {
    id: 'invitations',
    label: 'Invitations',
    href: '/customer/invitations',
    icon: (
      <svg {...iconProps}>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 7l9 6 9-6" />
      </svg>
    ),
  },
  {
    id: 'support',
    label: 'Help / Support',
    action: 'support',
    icon: (
      <svg {...iconProps}>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.5 9a2.5 2.5 0 014.8.8c0 1.7-2.3 2.2-2.3 3.7" />
        <circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    id: 'settings',
    label: 'Settings',
    href: '/customer/settings',
    pinnedBottom: true,
    icon: <SettingsGearIcon />,
  },
];
