/**
 * Shared rider navigation configuration (max 7 items).
 * Profile, Settings, Safety, and Notifications live in the topbar.
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

export const RIDER_SIDEBAR_COLLAPSED_KEY = 'salo_rider_sidebar_collapsed';

export const RIDER_NAV_CONFIG = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    path: '/rider',
    end: true,
    icon: (
      <svg {...iconProps}>
        <path d="M3 10.5L12 3l9 7.5V20a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 20v-9.5z" />
        <path d="M9.5 21.5V14h5v7.5" />
      </svg>
    ),
  },
  {
    id: 'deliveries',
    label: 'Deliveries',
    path: '/rider/deliveries',
    icon: (
      <svg {...iconProps}>
        <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
        <rect x="9" y="3" width="6" height="4" rx="1" />
        <path d="M9 12h6M9 16h4" />
      </svg>
    ),
  },
  {
    id: 'map',
    label: 'Map / Tracking',
    path: '/rider/map',
    icon: (
      <svg {...iconProps}>
        <path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z" />
        <path d="M9 3v15M15 6v15" />
      </svg>
    ),
  },
  {
    id: 'schedule',
    label: 'Schedule',
    path: '/rider/schedule',
    icon: (
      <svg {...iconProps}>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </svg>
    ),
  },
  {
    id: 'earnings',
    label: 'Earnings',
    path: '/rider/earnings',
    icon: (
      <svg {...iconProps}>
        <line x1="12" y1="2" x2="12" y2="22" />
        <path d="M17 6H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
      </svg>
    ),
  },
  {
    id: 'history',
    label: 'Delivery History',
    path: '/rider/history',
    icon: (
      <svg {...iconProps}>
        <circle cx="12" cy="12" r="9" />
        <polyline points="12 7 12 12 15 14" />
      </svg>
    ),
  },
  {
    id: 'support',
    label: 'Support',
    path: '/rider/support',
    icon: (
      <svg {...iconProps}>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.5 9a2.5 2.5 0 014.8.8c0 1.7-2.3 2.2-2.3 3.7" />
        <circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
];
